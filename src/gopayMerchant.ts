import { HttpClient } from "./http/httpClient.js";
import { AuthClient } from "./api/authClient.js";
import { MerchantClient } from "./api/merchantClient.js";
import { TransactionClient } from "./api/transactionClient.js";
import { PaymentService } from "./payment/paymentService.js";
import { InMemoryPaymentStore } from "./payment/paymentStore.js";
import { AmountAllocator } from "./payment/amountAllocator.js";
import { TokenManager } from "./core/tokenManager.js";
import {
  DEFAULT_STATIC_HEADERS,
  DEFAULT_APP_VERSION,
  GOBIZ_API_BASE_URL,
} from "./core/constants.js";
import { AuthError, ConfigError } from "./core/errors.js";
import type {
  CreatePaymentInput,
  PaymentServiceOptions,
} from "./payment/paymentService.js";
import type {
  LoginRequestResult,
  MerchantProfile,
  Payment,
  PaymentStore,
  SessionState,
  StoredMerchant,
  TokenSet,
} from "./core/types.js";
import { uuid } from "./utils/id.js";
import type { Logger } from "./utils/logger.js";
import { noopLogger } from "./utils/logger.js";

export interface GopayMerchantConfig {
  /** Merchant id (e.g. "G929951431"). Required for transaction polling. */
  merchantId?: string;
  /** Restore a previous session instead of logging in again. */
  session?: SessionState;
  /** Merchant static QRIS payload to derive dynamic per-order QRIS strings. */
  staticQris?: string;
  /** GoID client id override. */
  clientId?: string;
  /** App version header override. */
  appVersion?: string;
  /** Stable device identifier; restored from session or generated when omitted. */
  deviceId?: string;
  /** Custom payment store (durable backends). Defaults to in-memory. */
  store?: PaymentStore;
  /** Polling and payment tuning. */
  payment?: Partial<
    Pick<
      PaymentServiceOptions,
      "pollIntervalMs" | "defaultExpiryMs" | "clockSkewMs"
    >
  > & { maxUniqueOffset?: number };
  /**
   * Callback invoked after automatic token refresh. Use this to persist
   * the updated session to disk/database.
   */
  onTokenRefreshed?: (session: SessionState) => Promise<void> | void;
  /** Refresh tokens this many milliseconds before expiry. Default: 5 minutes. */
  refreshBeforeExpiryMs?: number;
  requestTimeoutMs?: number;
  logger?: Logger;
}

/**
 * High-level entry point. Wires the HTTP client, API clients, token manager,
 * and payment orchestration together and exposes an ergonomic surface for
 * login, QRIS generation, and payment detection.
 *
 * Token Management:
 * - Automatically refreshes access tokens before expiry (default: 5 min buffer)
 * - Transparently retries 401 requests with refreshed token
 * - Preserves stable device ID across sessions
 * - Invokes onTokenRefreshed callback for persistence
 */
export class GopayMerchant {
  readonly auth: AuthClient;
  readonly merchant: MerchantClient;
  readonly transactions: TransactionClient;

  private readonly http: HttpClient;
  private readonly config: GopayMerchantConfig;
  private readonly deviceId: string;
  private readonly logger: Logger;
  private tokenManager?: TokenManager;
  private merchantId?: string;
  private resolvedStaticQris?: string;
  private paymentService?: PaymentService;
  private readonly store: PaymentStore;

  constructor(config: GopayMerchantConfig = {}) {
    this.config = config;
    this.logger = config.logger ?? noopLogger;

    // Use deviceId from session > config > generate new
    this.deviceId = config.session?.deviceId ?? config.deviceId ?? uuid();

    this.merchantId = config.merchantId;
    this.store = config.store ?? new InMemoryPaymentStore();

    this.http = new HttpClient({
      baseUrl: GOBIZ_API_BASE_URL,
      timeoutMs: config.requestTimeoutMs,
      logger: this.logger,
      defaultHeaders: this.buildHeaders(),
    });

    this.auth = new AuthClient(this.http, { clientId: config.clientId });
    this.merchant = new MerchantClient(this.http);
    this.transactions = new TransactionClient(this.http);

    // Initialize TokenManager if session tokens are available
    if (config.session?.tokens) {
      this.initializeTokenManager(config.session.tokens);
    }
  }

  /** Step 1 of login: request an OTP for a phone number. */
  async requestOtp(
    phoneNumber: string,
    countryCode = "62",
  ): Promise<LoginRequestResult> {
    return this.auth.requestOtp(phoneNumber, countryCode);
  }

  /** Step 2 of login: verify the OTP and store the resulting session. */
  async verifyOtp(params: {
    otp: string;
    otpToken: string;
    phoneNumber?: string;
    countryCode?: string;
  }): Promise<TokenSet> {
    const tokens = await this.auth.verifyOtp(params);
    this.initializeTokenManager(tokens);
    await this.resolveMerchantId();
    await this.resolveStaticQris();
    return tokens;
  }

  /**
   * Initialize or reinitialize the TokenManager with new tokens.
   * Sets up automatic token refresh and persistence callback.
   */
  private initializeTokenManager(tokens: TokenSet): void {
    this.tokenManager = new TokenManager(this.auth, tokens, {
      onTokenRefreshed: async (refreshedTokens) => {
        // Update HTTP client with new access token
        this.http.setDefaultHeader(
          "Authorization",
          `Bearer ${refreshedTokens.accessToken}`,
        );

        // Invoke user callback for persistence
        if (this.config.onTokenRefreshed) {
          const session: SessionState = {
            tokens: refreshedTokens,
            deviceId: this.deviceId,
            lastRefreshedAt: Date.now(),
          };
          await this.config.onTokenRefreshed(session);
        }
      },
      refreshBeforeExpiryMs: this.config.refreshBeforeExpiryMs,
      logger: this.logger,
    });

    // Wire TokenManager to HttpClient for auto 401 retry
    this.http.setTokenManager(this.tokenManager);

    // Set initial Authorization header
    this.http.setDefaultHeader("Authorization", `Bearer ${tokens.accessToken}`);
  }

  /**
   * Resolve and cache the merchant id from the authenticated user profile
   * (`/v1/users/me`) unless one was already provided. Returns the id when
   * available. Failures are swallowed so login itself never breaks.
   */
  async resolveMerchantId(): Promise<string | undefined> {
    if (this.merchantId) return this.merchantId;
    try {
      const user = await this.merchant.getCurrentUser();
      if (user.merchantId) {
        this.merchantId = user.merchantId;
      }
    } catch (error) {
      this.logger.warn("failed to resolve merchant id from /users/me", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return this.merchantId;
  }

  /**
   * Resolve the outlet's GoPay static QRIS from the merchant profile and cache
   * it for dynamic QR generation, unless one was already provided in config.
   * When the merchant has multiple outlets, the first with a QRIS is used
   * unless `popId` selects a specific one. Returns the resolved QRIS.
   */
  async resolveStaticQris(popId?: string): Promise<string | undefined> {
    if (this.resolvedStaticQris) return this.resolvedStaticQris;

    const id = this.merchantId;
    if (!id) return undefined;

    try {
      const profile = await this.merchant.getMerchant(id);
      const outlet = popId
        ? profile.outlets.find((o) => o.popId === popId)
        : profile.outlets.find((o) => Boolean(o.qrString));

      if (outlet?.qrString) {
        this.resolvedStaticQris = outlet.qrString;
        this.paymentService?.setStaticQris(outlet.qrString);
      }
    } catch (error) {
      this.logger.warn("failed to resolve static QRIS from merchant profile", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return this.resolvedStaticQris;
  }

  /**
   * Enumerate every merchant the authenticated account can access, with full
   * detail and outlet QRIS, via `/v1/merchants/search`. An account may have
   * more than one merchant.
   */
  async listMerchants(limit = 200): Promise<StoredMerchant[]> {
    return this.merchant.searchMerchants(limit);
  }

  /** The resolved outlet static QRIS, if one was fetched or configured. */
  get staticQris(): string | undefined {
    return this.config.staticQris ?? this.resolvedStaticQris;
  }

  /** Refresh the access token using the stored refresh token. */
  async refreshSession(): Promise<TokenSet> {
    if (!this.tokenManager) {
      throw new AuthError("AUTH_REQUIRED", "No active session to refresh");
    }

    // Force refresh through TokenManager (will deduplicate if already refreshing)
    await this.tokenManager.getValidAccessToken();
    return this.tokenManager.getTokens();
  }

  /** Export the current session for persistence. */
  exportSession(): SessionState {
    if (!this.tokenManager) {
      throw new AuthError("AUTH_REQUIRED", "Not authenticated");
    }
    return {
      tokens: this.tokenManager.getTokens(),
      deviceId: this.deviceId,
      lastRefreshedAt: Date.now(),
    };
  }

  /** Fetch the current merchant profile. */
  async getMerchantProfile(): Promise<MerchantProfile> {
    const id = this.requireMerchantId();
    return this.merchant.getMerchant(id);
  }

  /**
   * Access the payment service, lazily constructed on first use. Requires an
   * authenticated session and a configured merchant id.
   */
  payments(): PaymentService {
    if (!this.tokenManager) {
      throw new AuthError("AUTH_REQUIRED", "Login before using payments");
    }
    const id = this.requireMerchantId();

    if (!this.paymentService) {
      this.paymentService = new PaymentService({
        merchantId: id,
        store: this.store,
        transactions: this.transactions,
        staticQris: this.config.staticQris ?? this.resolvedStaticQris,
        allocator: new AmountAllocator(this.config.payment?.maxUniqueOffset),
        pollIntervalMs: this.config.payment?.pollIntervalMs,
        defaultExpiryMs: this.config.payment?.defaultExpiryMs,
        clockSkewMs: this.config.payment?.clockSkewMs,
        logger: this.logger,
      });
    }

    return this.paymentService;
  }

  /** Convenience: create a payment through the payment service. */
  async createPayment(input: CreatePaymentInput): Promise<Payment> {
    return this.payments().createPayment(input);
  }

  private buildHeaders(): Record<string, string> {
    return {
      ...DEFAULT_STATIC_HEADERS,
      "X-AppVersion": this.config.appVersion ?? DEFAULT_APP_VERSION,
      "x-uniqueid": this.deviceId,
    };
  }

  private requireMerchantId(): string {
    if (!this.merchantId) {
      throw new ConfigError(
        "merchantId is required (set it in the config or session)",
      );
    }
    return this.merchantId;
  }
}
