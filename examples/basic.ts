/**
 * Example: use a session saved by the CLI (`gomerch login`) to create a payment
 * and wait for settlement. No credentials are hardcoded here — everything is
 * read from the persisted config file (~/.gomerch/config.json by default).
 *
 * Prerequisites:
 *   1. gomerch login   (saves tokens + all merchants, each with its outlet QRIS)
 *
 * Run with tsx: `npx tsx examples/basic.ts`
 */

import { GopayMerchant, createConsoleLogger } from "../src/index.js";
import { readConfig } from "../src/cli/config.js";

async function main(): Promise<void> {
  const config = readConfig();

  if (!config.session) {
    throw new Error("No saved session. Run `gomerch login` first.");
  }

  const merchants = config.merchants ?? [];
  // Pick the default merchant (or the first one).
  const merchant =
    merchants.find((m) => m.id === config.defaultMerchantId) ?? merchants[0];
  if (!merchant) {
    throw new Error("No merchants stored. Run `gomerch login` first.");
  }

  const gopay = new GopayMerchant({
    merchantId: merchant.id,
    staticQris: merchant.qrString,
    session: config.session,
    logger: createConsoleLogger("info"),
  });

  const payments = gopay.payments();
  payments.on("paid", (payment) => {
    console.log(
      `PAID: ${payment.id} amount=Rp${payment.uniqueAmount} tx=${payment.transaction?.id}`,
    );
  });
  payments.on("expired", (payment) => console.log(`EXPIRED: ${payment.id}`));
  payments.on("error", (error) => console.error("poll error:", error.message));
  payments.start();

  const payment = await gopay.createPayment({
    amount: 10_000,
    reference: "example-order-1",
  });

  console.log("Ask the buyer to pay exactly: Rp" + payment.uniqueAmount);
  if (payment.qrString) {
    console.log("Dynamic QRIS payload:", payment.qrString);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
