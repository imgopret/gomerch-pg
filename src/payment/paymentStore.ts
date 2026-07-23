import type { Payment, PaymentStore } from "../core/types.js";

/**
 * Default in-memory {@link PaymentStore}. Suitable for single-process usage and
 * tests. For multi-process deployments, provide a durable store (Redis, SQL)
 * implementing the same interface.
 */
export class InMemoryPaymentStore implements PaymentStore {
  private readonly payments = new Map<string, Payment>();

  create(payment: Payment): void {
    this.payments.set(payment.id, { ...payment });
  }

  update(payment: Payment): void {
    this.payments.set(payment.id, { ...payment });
  }

  get(id: string): Payment | undefined {
    const found = this.payments.get(id);
    return found ? { ...found } : undefined;
  }

  listActive(): Payment[] {
    return [...this.payments.values()]
      .filter((payment) => payment.status === "pending")
      .map((payment) => ({ ...payment }));
  }

  /** Return every stored payment regardless of status (diagnostics/testing). */
  listAll(): Payment[] {
    return [...this.payments.values()].map((payment) => ({ ...payment }));
  }
}
