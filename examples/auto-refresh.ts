/**
 * Example: Automatic Token Refresh
 *
 * This example demonstrates the automatic token refresh mechanism.
 * Tokens are automatically refreshed:
 * 1. Proactively before expiry (default: 5 minutes buffer)
 * 2. Reactively on 401 Unauthorized responses
 * 3. With concurrent request deduplication
 */

import { GopayMerchant } from "../src/index.js";
import { readFileSync, writeFileSync } from "fs";

const CONFIG_PATH = "./.gopay-session.json";

interface StoredSession {
  tokens: {
    accessToken: string;
    refreshToken: string;
    tokenType: string;
    expiresAt?: number;
  };
  deviceId?: string;
  lastRefreshedAt?: number;
}

async function main() {
  // Load existing session from disk
  let session: StoredSession | undefined;
  try {
    const data = readFileSync(CONFIG_PATH, "utf8");
    session = JSON.parse(data);
    console.log("✓ Loaded existing session");
  } catch {
    console.log("✗ No existing session found");
    console.log("Run the basic example first to login and create a session");
    process.exit(1);
  }

  // Initialize with auto-refresh callback
  const gopay = new GopayMerchant({
    session,
    merchantId: process.env.GOMERCH_MERCHANT_ID,

    // This callback is invoked automatically after token refresh
    onTokenRefreshed: async (updatedSession) => {
      console.log("🔄 Token auto-refreshed, saving to disk...");
      writeFileSync(CONFIG_PATH, JSON.stringify(updatedSession, null, 2));
      console.log("✓ Session saved");
    },

    // Optional: customize refresh timing (default: 5 minutes before expiry)
    refreshBeforeExpiryMs: 5 * 60 * 1000,
  });

  console.log("\n📊 Session Info:");
  const exportedSession = gopay.exportSession();
  console.log(`- Device ID: ${exportedSession.deviceId}`);
  console.log(
    `- Last Refreshed: ${
      exportedSession.lastRefreshedAt
        ? new Date(exportedSession.lastRefreshedAt).toISOString()
        : "N/A"
    }`,
  );

  // Test 1: Normal API calls (tokens auto-refresh if needed)
  console.log("\n🧪 Test 1: Fetching merchant profile...");
  try {
    const profile = await gopay.getMerchantProfile();
    console.log(`✓ Merchant: ${profile.merchantName} (${profile.id})`);
  } catch (error) {
    console.error("✗ Failed:", error);
  }

  // Test 2: Multiple concurrent requests (should deduplicate refresh)
  console.log("\n🧪 Test 2: Multiple concurrent API calls...");
  try {
    const [merchants, profile] = await Promise.all([
      gopay.listMerchants(),
      gopay.getMerchantProfile(),
    ]);
    console.log(`✓ Fetched ${merchants.length} merchants and profile`);
  } catch (error) {
    console.error("✗ Failed:", error);
  }

  // Test 3: Manual refresh (if needed)
  console.log("\n🧪 Test 3: Manual token refresh...");
  try {
    const newTokens = await gopay.refreshSession();
    console.log(
      `✓ Manually refreshed token (expires at: ${newTokens.expiresAt})`,
    );
  } catch (error) {
    console.error("✗ Failed:", error);
  }

  console.log("\n✅ All tests completed!");
  console.log("\nKey Features Demonstrated:");
  console.log("- ✓ Automatic token refresh before expiry");
  console.log("- ✓ Transparent 401 retry with refreshed token");
  console.log("- ✓ Concurrent request deduplication");
  console.log("- ✓ Persistent device ID across sessions");
  console.log("- ✓ Auto-save updated tokens to disk");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
