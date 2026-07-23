/**
 * Static endpoint and header configuration derived from the GoBiz merchant
 * dashboard network flow. These are the hosts and default headers the official
 * web dashboard uses; they are required for the private API to accept requests.
 */

export const GOBIZ_API_BASE_URL = "https://api.gobiz.co.id";
export const GOJEK_API_BASE_URL = "https://api.gojekapi.com";

export const ENDPOINTS = {
  loginRequest: "/goid/login/request",
  token: "/goid/token",
  usersMe: "/v1/users/me",
  merchantsSearch: "/v1/merchants/search",
  merchantDetail: (merchantId: string) => `/v1/merchants/${merchantId}`,
  transactions: "/merchant-analytics/v2/merchants/transactions",
} as const;

/**
 * Default GoID client identifiers used by the web dashboard. They can be
 * overridden through the client configuration when Gojek rotates them.
 */
export const DEFAULT_GOID_CLIENT_ID = "go-biz-web-new";
export const DEFAULT_APP_ID = "go-biz-web-dashboard";
export const DEFAULT_APP_VERSION = "platform-v3.109.0-d4b20f12";

/**
 * Baseline headers required by the GoID/GoBiz gateway. The dashboard identifies
 * itself as a web merchant client through this set.
 */
export const DEFAULT_STATIC_HEADERS: Readonly<Record<string, string>> = {
  Accept: "application/json, text/plain, */*",
  "Authentication-Type": "go-id",
  "X-PhoneMake": "Web",
  "X-PhoneModel": "Node.js Client",
  "x-DeviceOS": "Web",
  "X-User-Locale": "id",
  "Gojek-Country-Code": "ID",
  "Gojek-Timezone": "Asia/Jakarta",
  "X-Platform": "Web",
  "X-User-Type": "merchant",
  "x-appId": DEFAULT_APP_ID,
};

/** Transaction statuses that represent money actually received by the merchant. */
export const PAID_TRANSACTION_STATUSES = ["SETTLEMENT", "CAPTURE"] as const;

/** Payment types the gateway polls for. GoPay QRIS is the primary channel. */
export const DEFAULT_PAYMENT_TYPES = [
  "QRIS",
  "GOPAY",
] as const;

export const DEFAULT_POLL_INTERVAL_MS = 3_000;
export const DEFAULT_PAYMENT_EXPIRY_MS = 5 * 60 * 1_000;
export const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;

/**
 * Amount uniqueness window. GoPay QRIS amounts are whole rupiah, so unique
 * "cents" are encoded as an integer offset added to the base amount.
 */
export const DEFAULT_MAX_UNIQUE_OFFSET = 999;
