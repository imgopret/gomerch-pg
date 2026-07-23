import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { uuid } from "../utils/id.js";
import type { SessionState, StoredMerchant } from "../core/types.js";

/**
 * Persistent CLI configuration. Stored as JSON so it can be inspected, backed
 * up, or provisioned by other tooling.
 *
 * Structure:
 * - `session`: authentication only (access/refresh tokens).
 * - `merchants`: every merchant the account can access, with full detail and
 *   outlet QRIS. An account may have more than one merchant.
 * - `defaultMerchantId`: which merchant the CLI/library uses by default.
 */
export interface CliConfig {
  session?: SessionState;
  merchants?: StoredMerchant[];
  defaultMerchantId?: string;
}

/**
 * Resolve the config file path. Order of precedence:
 * 1. `GOMERCH_CONFIG` environment variable (explicit path).
 * 2. `~/.gomerch/config.json` (default).
 */
export function resolveConfigPath(): string {
  const fromEnv = process.env.GOMERCH_CONFIG;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv;
  }
  return join(homedir(), ".gomerch", "config.json");
}

/** Read the config, returning an empty object when no file exists yet. */
export function readConfig(path = resolveConfigPath()): CliConfig {
  if (!existsSync(path)) {
    return {};
  }
  try {
    const text = readFileSync(path, "utf8");
    const config = JSON.parse(text) as CliConfig;
    return migrateConfig(config);
  } catch {
    return {};
  }
}

/**
 * Migrate old config schema to new schema with deviceId and timestamps.
 * This ensures backward compatibility with existing installations.
 */
function migrateConfig(config: CliConfig): CliConfig {
  if (!config.session?.tokens) {
    return config;
  }

  let needsSave = false;

  // Add deviceId if missing (for stable x-uniqueid header)
  if (!config.session.deviceId) {
    config.session.deviceId = uuid();
    needsSave = true;
  }

  // Add lastRefreshedAt if missing (for debugging)
  if (!config.session.lastRefreshedAt) {
    config.session.lastRefreshedAt = Date.now();
    needsSave = true;
  }

  // If we made changes, save immediately
  if (needsSave) {
    try {
      writeConfig(config, resolveConfigPath());
    } catch (error) {
      // Silent fail - migration is not critical
    }
  }

  return config;
}

/** Write the config, creating the parent directory when needed. */
export function writeConfig(
  config: CliConfig,
  path = resolveConfigPath(),
): void {
  const dir = join(path, "..");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

/** Merge a partial update into the existing config and persist it. */
export function updateConfig(
  patch: Partial<CliConfig>,
  path = resolveConfigPath(),
): CliConfig {
  const current = readConfig(path);
  const next: CliConfig = { ...current, ...patch };
  writeConfig(next, path);
  return next;
}
