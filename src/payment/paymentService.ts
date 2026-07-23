import { EventEmitter } from "node:events";
import type { TransactionClient } from "../api/transactionClient.js";
import type {
  MerchantTransaction,
  Payment,
  PaymentStore,
} from "../core/types.js";
import {
  DEFAULT_PAYMENT_EXPIRY_MS,
  DEFAULT_POLL_INTERVAL_MS,
} from "../core/constants.js";
import { GopayMerchantError } from "../core/errors.js";
import { AmountAllocator } from "./amountAllocator.js";
import { reconcile } from "./paymentMatcher.js";
import { staticToDynamicQris } from "../qris/qris.js";
import { paymentId as generatePaymentId } from "../utils/id.js";
import { dayBounds, now } from "../utils/time.js";
import type { Logger } from "../utils/logger.js";
import { noopLogger } from "../utils/logger.js";

export interface CreatePaymentInput {
  /** Base amount in whole rupiah. */
  amount: number;
  /** Optional caller reference (internal order id, etc.). */
  reference?: string;
  /** Override the default expiry for this payment, in milliseconds. */
  expiresInMs?: number;
  metadata?: Record<string, unknown>;
}

export interface PaymentServiceOptions {
  merchantId: string;
  store: PaymentStore;
  transactions: TransactionClient;
  /** Static QRIS payload used to derive per-order dynamic QRIS strings. */
  staticQris?: string;
  allocator?: AmountAllocator;
  pollIntervalMs?: number;
  defaultExpiryMs?: number;
  clockSkewMs?: number;
  logger?: Logger;
}

export interface PaymentServiceEvents {
  paid: [Payment];
  expired: [Payment];
  error: [Error];
}

/**
 * Core orchestration: creates dynamic payments with unique amounts, and polls
 * the transaction feed to settle or expire them. Emits `paid`, `expired`, and
 * `error` events.
 */
export class PaymentService extends EventEmitter {
  private readonly merchantId: string;
  private readonly store: PaymentStore;
  private readonly transactions: TransactionClient;
  private staticQris?: string;
  private readonly allocator: AmountAllocator;
  private readonly pollIntervalMs: number;
  private readonly defaultExpiryMs: number;
  private readonly clockSkewMs: number;
  private readonly logger: Logger;

  private timer?: ReturnType<typeof setInterval>;
  private polling = false;

  constructor(options: PaymentServiceOptions) {
    super();
    this.merchantId = options.merchantId;
    this.store = options.store;
    this.transactions = options.transactions;
    this.staticQris = options.staticQris;
    this.allocator = options.allocator ?? new AmountAllocator();
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.defaultExpiryMs = options.defaultExpiryMs ?? DEFAULT_PAYMENT_EXPIRY_MS;
    this.clockSkewMs = options.clockSkewMs ?? 60_000;
    this.logger = options.logger ?? noopLogger;
  }

  /**
   * Set (or clear) the static QRIS used to derive per-order dynamic QRIS
   * strings. Typically called once after resolving the merchant's outlet QR.
   */
  setStaticQris(staticQris: string | undefined): void {
    this.staticQris = staticQris;
  }

  /** Whether a static QRIS is configured for dynamic QR generation. */
  get hasStaticQris(): boolean {
    return Boolean(this.staticQris);
  }

  /** Create a new pending payment with a unique amount and (optional) QRIS. */
  async createPayment(input: CreatePaymentInput): Promise<Payment> {
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      throw new GopayMerchantError(
        "CONFIG_INVALID",
        "amount must be a positive integer (whole rupiah)",
      );
    }

    const active = await this.store.listActive();
    const takenOffsets = active
      .filter((payment) => payment.baseAmount === input.amount)
      .map((payment) => payment.uniqueOffset);

    const uniqueOffset = this.allocator.allocate(takenOffsets);
    const uniqueAmount = input.amount + uniqueOffset;
    const createdAt = now();
    const expiresAt = createdAt + (input.expiresInMs ?? this.defaultExpiryMs);

    const payment: Payment = {
      id: generatePaymentId(),
      baseAmount: input.amount,
      uniqueOffset,
      uniqueAmount,
      status: "pending",
      createdAt,
      expiresAt,
      reference: input.reference,
      metadata: input.metadata,
      qrString: this.staticQris
        ? staticToDynamicQris(this.staticQris, uniqueAmount)
        : undefined,
    };

    await this.store.create(payment);
    this.logger.info("payment created", {
      id: payment.id,
      uniqueAmount,
    });

    return payment;
  }

  /** Cancel a pending payment, releasing its unique amount slot. */
  async cancelPayment(id: string): Promise<Payment | undefined> {
    const payment = await this.store.get(id);
    if (!payment || payment.status !== "pending") return payment;
    const cancelled: Payment = { ...payment, status: "cancelled" };
    await this.store.update(cancelled);
    return cancelled;
  }

  async getPayment(id: string): Promise<Payment | undefined> {
    return this.store.get(id);
  }

  /** Begin background polling. Safe to call once; repeated calls are ignored. */
  start(): void {
    if (this.timer) return;
    this.logger.info("payment polling started", {
      intervalMs: this.pollIntervalMs,
    });
    this.timer = setInterval(() => {
      void this.tick();
    }, this.pollIntervalMs);
    // Do not keep the event loop alive solely for polling.
    this.timer.unref?.();
  }

  /** Stop background polling. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
      this.logger.info("payment polling stopped");
    }
  }

  /**
   * Run a single reconciliation pass: expire stale payments, fetch recent
   * transactions, and settle matches. Exposed for manual/tested invocation.
   */
  async tick(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      await this.expireStale();
      const pending = await this.store.listActive();
      if (pending.length === 0) return;

      const transactions = await this.fetchRecentTransactions();
      const matches = reconcile(pending, transactions, this.clockSkewMs);

      for (const { payment, transaction } of matches) {
        await this.settle(payment, transaction);
      }
    } catch (error) {
      const err =
        error instanceof Error ? error : new Error(String(error));
      this.logger.error("poll tick failed", { message: err.message });
      this.emit("error", err);
    } finally {
      this.polling = false;
    }
  }

  private async settle(
    payment: Payment,
    transaction: MerchantTransaction,
  ): Promise<void> {
    const paid: Payment = {
      ...payment,
      status: "paid",
      transaction,
    };
    await this.store.update(paid);
    this.logger.info("payment settled", {
      id: paid.id,
      transactionId: transaction.id,
    });
    this.emit("paid", paid);
  }

  private async expireStale(): Promise<void> {
    const current = now();
    const pending = await this.store.listActive();
    for (const payment of pending) {
      if (payment.expiresAt <= current) {
        const expired: Payment = { ...payment, status: "expired" };
        await this.store.update(expired);
        this.logger.info("payment expired", { id: expired.id });
        this.emit("expired", expired);
      }
    }
  }

  private async fetchRecentTransactions(): Promise<MerchantTransaction[]> {
    const { start, end } = dayBounds(new Date());
    return this.transactions.list(this.merchantId, {
      startTime: start,
      endTime: end,
      size: 50,
    });
  }
}

export interface PaymentService {
  on<K extends keyof PaymentServiceEvents>(
    event: K,
    listener: (...args: PaymentServiceEvents[K]) => void,
  ): this;
  emit<K extends keyof PaymentServiceEvents>(
    event: K,
    ...args: PaymentServiceEvents[K]
  ): boolean;
}
