import { GopayMerchant } from "../gopayMerchant.js";
import { createConsoleLogger } from "../utils/logger.js";
import { readConfig, resolveConfigPath, updateConfig } from "./config.js";
import { prompt, promptRequired } from "./prompt.js";

/**
 * Interactive login: asks for phone number, sends an OTP, asks for the OTP,
 * exchanges it for tokens, and saves the resulting session to the config file.
 */
export async function loginCommand(): Promise<void> {
  const configPath = resolveConfigPath();
  const existingConfig = readConfig(configPath);

  const phone = await promptRequired(
    "Phone number (without country code, e.g. 81234567890): ",
  );
  const countryCode = (await prompt("Country code [62]: ")) || "62";

  const gopay = new GopayMerchant({
    logger: createConsoleLogger("warn"),
    // Preserve deviceId from existing session if available
    deviceId: existingConfig.session?.deviceId,
    // Auto-save tokens when refreshed
    onTokenRefreshed: async (session) => {
      updateConfig({ session }, configPath);
    },
  });

  process.stdout.write("Requesting OTP...\n");
  const otpResult = await gopay.requestOtp(phone, countryCode);
  const { otpToken } = otpResult;

  if (process.env.GOMERCH_DEBUG) {
    process.stderr.write(
      `[debug] requestOtp response:\n${JSON.stringify(otpResult.raw, null, 2)}\n`,
    );
    process.stderr.write(`[debug] parsed otpToken: ${otpToken ?? "(none)"}\n`);
  }

  if (!otpToken) {
    process.stderr.write(
      "Warning: no otp_token was parsed from the server response.\n" +
        "Re-run with GOMERCH_DEBUG=1 to inspect the raw response.\n",
    );
  }

  const otp = await promptRequired("Enter the OTP you received: ");

  try {
    await gopay.verifyOtp({
      otp,
      otpToken: otpToken ?? "",
      phoneNumber: phone,
    });
  } catch (error) {
    if (process.env.GOMERCH_DEBUG && error && typeof error === "object") {
      const details = (error as { details?: unknown }).details;
      process.stderr.write(
        `[debug] verifyOtp error details:\n${JSON.stringify(details, null, 2)}\n`,
      );
    }
    throw error;
  }

  const session = gopay.exportSession();

  // Enumerate every merchant the account can access, with full detail + QRIS.
  let merchants = await gopay.listMerchants();
  if (merchants.length === 0) {
    // Fall back to the single merchant resolved from /users/me if search is empty.
    const single = await gopay.getMerchantProfile().catch(() => undefined);
    if (single) {
      merchants = [
        {
          id: single.id,
          merchantName: single.merchantName,
          outletName: single.outletName,
          phone: single.phone,
          email: single.email,
          outlets: single.outlets,
          qrString: single.outlets.find((o) => o.qrString)?.qrString,
          raw: single.raw,
        },
      ];
    }
  }

  updateConfig(
    {
      session,
      merchants,
      defaultMerchantId: merchants[0]?.id,
    },
    configPath,
  );

  process.stdout.write(`\nLogin successful. Config saved to ${configPath}\n`);
  process.stdout.write(
    `Merchants found: ${merchants.length}${
      merchants.length > 0
        ? " (" +
          merchants.map((m) => `${m.id}:${m.merchantName}`).join(", ") +
          ")"
        : ""
    }\n`,
  );
  const withQris = merchants.filter((m) => m.qrString).length;
  process.stdout.write(
    `Static QRIS resolved for ${withQris}/${merchants.length} merchant(s).\n`,
  );
}

/** Print the stored session as JSON. */
export function sessionCommand(): void {
  const config = readConfig();
  if (!config.session) {
    process.stdout.write("No session stored. Run `gmg login` first.\n");
    return;
  }
  process.stdout.write(`${JSON.stringify(config.session, null, 2)}\n`);
}

/** List stored merchants and their outlets/QRIS. */
export function merchantsCommand(): void {
  const config = readConfig();
  const merchants = config.merchants ?? [];
  if (merchants.length === 0) {
    process.stdout.write("No merchants stored. Run `gmg login` first.\n");
    return;
  }
  const view = merchants.map((m) => ({
    id: m.id,
    merchantName: m.merchantName,
    default: m.id === config.defaultMerchantId,
    outlets: m.outlets.map((o) => ({
      popId: o.popId,
      name: o.name,
      hasQris: Boolean(o.qrString),
    })),
    qrString: m.qrString ?? null,
  }));
  process.stdout.write(`${JSON.stringify(view, null, 2)}\n`);
}

/** Set the default merchant id (must already exist in the stored merchants). */
export function setMerchantCommand(merchantId: string): void {
  if (!merchantId) {
    process.stderr.write("Usage: gmg set-merchant <merchantId>\n");
    process.exitCode = 1;
    return;
  }
  const path = resolveConfigPath();
  const config = readConfig(path);
  const known = (config.merchants ?? []).some((m) => m.id === merchantId);
  if (!known) {
    process.stderr.write(
      `Merchant ${merchantId} is not in the stored merchants. Run \`gmg merchants\` to list them.\n`,
    );
    process.exitCode = 1;
    return;
  }
  updateConfig({ defaultMerchantId: merchantId }, path);
  process.stdout.write(`Default merchant set: ${merchantId}\n`);
}

/** Show where the config lives and a redacted summary. */
export function whoamiCommand(): void {
  const path = resolveConfigPath();
  const config = readConfig(path);
  const summary = {
    configPath: path,
    loggedIn: Boolean(config.session?.tokens?.accessToken),
    merchantCount: config.merchants?.length ?? 0,
    defaultMerchantId: config.defaultMerchantId ?? null,
    merchants: (config.merchants ?? []).map((m) => ({
      id: m.id,
      merchantName: m.merchantName,
      hasQris: Boolean(m.qrString),
    })),
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}
