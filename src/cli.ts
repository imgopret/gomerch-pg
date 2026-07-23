#!/usr/bin/env node
import {
  loginCommand,
  sessionCommand,
  merchantsCommand,
  setMerchantCommand,
  whoamiCommand,
} from "./cli/commands.js";
import { GopayMerchantError } from "./core/errors.js";

const HELP = `gomerch - GoPay Merchant Payment Gateway CLI

Usage:
  gomerch login                 Interactive login (phone + OTP); saves tokens + merchants
  gomerch session               Print the stored auth session (tokens) as JSON
  gomerch merchants             List stored merchants, outlets, and QRIS
  gomerch whoami                Show config path, login status, and merchant summary
  gomerch set-merchant <id>     Set the default merchant (must be a known merchant id)
  gomerch help                  Show this help

Config file:
  Defaults to ~/.gomerch/config.json (override with the GOMERCH_CONFIG env var).
  Structure: { session (tokens), merchants[] (full detail + QRIS), defaultMerchantId }
`;

async function run(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;

  switch (command) {
    case "login":
      await loginCommand();
      return;
    case "session":
      sessionCommand();
      return;
    case "whoami":
      whoamiCommand();
      return;
    case "merchants":
      merchantsCommand();
      return;
    case "set-merchant":
      setMerchantCommand(rest[0] ?? "");
      return;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      process.stdout.write(HELP);
      return;
    default:
      process.stderr.write(`Unknown command: ${command}\n\n${HELP}`);
      process.exitCode = 1;
  }
}

run(process.argv.slice(2)).catch((error: unknown) => {
  if (error instanceof GopayMerchantError) {
    process.stderr.write(`Error [${error.code}]: ${error.message}\n`);
  } else if (error instanceof Error) {
    process.stderr.write(`Error: ${error.message}\n`);
  } else {
    process.stderr.write(`Error: ${String(error)}\n`);
  }
  process.exitCode = 1;
});
