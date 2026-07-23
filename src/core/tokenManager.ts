import type { AuthClient } from "../api/authClient.js";
import type { TokenSet } from "./types.js";
import { AuthError } from "./errors.js";
import type { Logger } from "../utils/logger.js";
import { noopLogger } from "../utils/logger.js";

export interface TokenManagerConfig {
  /** Callback invoked after successful token refresh for persistence. */
  onTokenRefreshed?: (tokens: TokenSet) => Promise<void> | void;
  /** Refresh tokens this many milliseconds before expiry. Default: 5 minutes. */
  refreshBeforeExpiryMs?: number;
  logger?: Logger;
}

/**
 * Manages token lifecycle with automatic refresh, expiry tracking, and
 * concurrent request deduplication. Ensures a valid access token is always
 * available without redundant refresh calls.
 *
 * Key behaviors:
 * - Proactively refreshes tokens before expiry (default: 5 min buffer)
 * - Deduplicates concurrent refresh requests (single refresh per cycle)
 * - Preserves the original refresh token (GoPay doesn't rotate it)
 * - Notifies callback after refresh for config persistence
 */
export class TokenManager {
  private tokens: TokenSet;
  private expiresAt: number;
  private refreshPromise: Promise<TokenSet> | null = null;
  private readonly bufferMs: number;
  private readonly logger: Logger;

  constructor(
    private readonly authClient: AuthClient,
    initialTokens: TokenSet,
    private readonly config: TokenManagerConfig = {}
  ) {
    this.tokens = { ...initialTokens };
    this.bufferMs = config.refreshBeforeExpiryMs ?? 5 * 60 * 1000; // 5 minutes
    this.logger = config.logger ?? noopLogger;
    this.expiresAt = this.calculateExpiry(initialTokens);
  }

  /**
   * Get a valid access token, refreshing automatically if needed or about to
   * expire. Concurrent calls are deduplicated to a single refresh request.
   */
  async getValidAccessToken(): Promise<string> {
    if (!this.needsRefresh()) {
      return this.tokens.accessToken;
    }

    // Deduplicate concurrent refresh calls
    if (!this.refreshPromise) {
      this.refreshPromise = this.performRefresh().finally(() => {
        this.refreshPromise = null;
      });
    }

    const newTokens = await this.refreshPromise;
    return newTokens.accessToken;
  }

  /**
   * Check if the access token needs refresh based on expiry time and buffer.
   */
  private needsRefresh(): boolean {
    const now = Date.now();
    const timeUntilExpiry = this.expiresAt - now;
    return timeUntilExpiry < this.bufferMs;
  }

  /**
   * Perform the actual token refresh. Updates internal state and notifies
   * the callback for persistence.
   */
  private async performRefresh(): Promise<TokenSet> {
    this.logger.debug("TokenManager: refreshing access token", {
      expiresAt: new Date(this.expiresAt).toISOString(),
      bufferMs: this.bufferMs,
    });

    try {
      const newTokens = await this.authClient.refresh(
        this.tokens.refreshToken
      );

      // Merge: preserve original refresh token, update access token
      // GoPay refresh endpoint doesn't return a new refresh_token
      this.tokens = {
        accessToken: newTokens.accessToken,
        refreshToken: this.tokens.refreshToken, // Keep original
        tokenType: newTokens.tokenType,
        expiresAt: newTokens.expiresAt,
      };

      this.expiresAt = this.calculateExpiry(this.tokens);

      this.logger.info("TokenManager: token refreshed successfully", {
        newExpiresAt: new Date(this.expiresAt).toISOString(),
      });

      // Notify callback for persistence
      if (this.config.onTokenRefreshed) {
        await this.config.onTokenRefreshed(this.tokens);
      }

      return this.tokens;
    } catch (error) {
      this.logger.error("TokenManager: token refresh failed", {
        error: error instanceof Error ? error.message : String(error),
      });

      // Check if refresh token is invalid/expired (401)
      if (error instanceof AuthError || (error as any)?.code === "OIDC:401") {
        throw new AuthError(
          "AUTH_FAILED",
          "Refresh token expired or invalid. Please login again."
        );
      }

      throw error;
    }
  }

  /**
   * Calculate token expiry timestamp from TokenSet. Tries multiple strategies:
   * 1. Use expiresAt if present (from auth response)
   * 2. Parse JWT exp claim
   * 3. Fallback: assume 30 minutes from now
   */
  private calculateExpiry(tokens: TokenSet): number {
    // Strategy 1: Use expiresAt from response
    if (tokens.expiresAt) {
      return tokens.expiresAt;
    }

    // Strategy 2: Parse JWT exp claim
    try {
      const [, payload] = tokens.accessToken.split(".");
      if (payload) {
        const decoded = JSON.parse(
          Buffer.from(payload, "base64").toString("utf8")
        );
        if (typeof decoded.exp === "number") {
          return decoded.exp * 1000; // Convert seconds to milliseconds
        }
      }
    } catch (error) {
      this.logger.warn("TokenManager: failed to parse JWT exp claim", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Strategy 3: Fallback to 30 minutes (GoPay default)
    const fallbackExpiry = Date.now() + 30 * 60 * 1000;
    this.logger.warn("TokenManager: using fallback expiry (30 min)", {
      expiresAt: new Date(fallbackExpiry).toISOString(),
    });
    return fallbackExpiry;
  }

  /**
   * Get the current token set (read-only copy).
   */
  getTokens(): TokenSet {
    return { ...this.tokens };
  }

  /**
   * Check if token is expired or needs refresh (exposed for testing/debugging).
   */
  isExpired(): boolean {
    return this.needsRefresh();
  }

  /**
   * Get time until expiry in milliseconds (exposed for debugging).
   */
  getTimeUntilExpiry(): number {
    return Math.max(0, this.expiresAt - Date.now());
  }
}
