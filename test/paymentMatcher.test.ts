import { describe, expect, it } from "vitest";
import { matchesPayment, reconcile } from "../src/payment/paymentMatcher.js";
import type { MerchantTransaction, Payment } from "../src/core/types.js";

function makePayment(partial: Partial<Payment> = {}): Payment {
  const createdAt = Date.parse("2026-07-14T21:40:00+07:00");
  return {
    id: "pay_1",
    baseAmount: 500000,
    uniqueOffset: 0,
    uniqueAmount: 500000,
    status: "pending",
    createdAt,
    expiresAt: createdAt + 5 * 60 * 1000,
    ...partial,
  };
}

function makeTx(partial: Partial<MerchantTransaction> = {}): MerchantTransaction {
  return {
    id: "tx_1",
    orderId: "GMA-1",
    merchantId: "G929951431",
    status: "SETTLEMENT",
    paymentType: "QRIS",
    grossAmount: 500000,
    currency: "IDR",
    transactionTime: "2026-07-14T21:40:35+07:00",
    raw: {},
    ...partial,
  };
}

describe("matchesPayment", () => {
  it("matches on exact amount within the time window", () => {
    expect(matchesPayment(makePayment(), makeTx())).toBe(true);
  });

  it("rejects amount mismatch", () => {
    expect(matchesPayment(makePayment(), makeTx({ grossAmount: 500001 }))).toBe(
      false,
    );
  });

  it("rejects transactions outside the window", () => {
    const tx = makeTx({ transactionTime: "2026-07-14T23:00:00+07:00" });
    expect(matchesPayment(makePayment(), tx)).toBe(false);
  });
});

describe("reconcile", () => {
  it("assigns each transaction to at most one payment", () => {
    const p1 = makePayment({ id: "p1", uniqueAmount: 10001, uniqueOffset: 1 });
    const p2 = makePayment({ id: "p2", uniqueAmount: 10002, uniqueOffset: 2 });

    const t1 = makeTx({ id: "t1", grossAmount: 10001 });
    const t2 = makeTx({ id: "t2", grossAmount: 10002 });

    const matches = reconcile([p2, p1], [t2, t1]);
    expect(matches).toHaveLength(2);

    const byPayment = Object.fromEntries(
      matches.map((m) => [m.payment.id, m.transaction.id]),
    );
    expect(byPayment["p1"]).toBe("t1");
    expect(byPayment["p2"]).toBe("t2");
  });

  it("does not settle two payments from one transaction", () => {
    const p1 = makePayment({ id: "p1", uniqueAmount: 10001, uniqueOffset: 1 });
    const p2 = makePayment({ id: "p2", uniqueAmount: 10001, uniqueOffset: 1 });
    const t1 = makeTx({ id: "t1", grossAmount: 10001 });

    const matches = reconcile([p1, p2], [t1]);
    expect(matches).toHaveLength(1);
  });
});
