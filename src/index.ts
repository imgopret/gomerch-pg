/**
 * gomerch-pg
 *
 * GoPay Merchant Payment Gateway. Library payment gateway tidak resmi untuk
 * GoPay Merchant (GoBiz). Mengubah QRIS GoPay statis menjadi QRIS dinamis
 * per pesanan dan mendeteksi settlement dengan polling API transaksi GoBiz.
 */

export { GopayMerchant } from "./gopayMerchant.js";
export type { GopayMerchantConfig } from "./gopayMerchant.js";

export { AuthClient } from "./api/authClient.js";
export { MerchantClient } from "./api/merchantClient.js";
export { TransactionClient } from "./api/transactionClient.js";

export { TokenManager } from "./core/tokenManager.js";
export type { TokenManagerConfig } from "./core/tokenManager.js";

export { LoginService, createLoginService } from "./auth/loginService.js";
export type {
  LoginServiceConfig,
  LoginStep,
  OtpRequestPayload,
  OtpVerifyPayload,
  LoginResult,
} from "./auth/loginService.js";

export { PaymentService } from "./payment/paymentService.js";
export type {
  CreatePaymentInput,
  PaymentServiceOptions,
  PaymentServiceEvents,
} from "./payment/paymentService.js";
export { InMemoryPaymentStore } from "./payment/paymentStore.js";
export { AmountAllocator } from "./payment/amountAllocator.js";
export { matchesPayment, reconcile } from "./payment/paymentMatcher.js";

export {
  parseEmv,
  buildEmv,
  encodeTlv,
  staticToDynamicQris,
  isValidQrisChecksum,
  QRIS_TAGS,
} from "./qris/qris.js";
export type { EmvTlvMap } from "./qris/qris.js";

export { crc16ccitt } from "./utils/crc16.js";
export { createConsoleLogger, noopLogger } from "./utils/logger.js";
export type { Logger, LogLevel } from "./utils/logger.js";
export { HttpClient } from "./http/httpClient.js";
export type {
  FetchLike,
  HttpClientOptions,
  HttpRequestOptions,
  QueryValue,
} from "./http/httpClient.js";

export {
  GopayMerchantError,
  ConfigError,
  AuthError,
  HttpError,
  ApiError,
} from "./core/errors.js";
export type { GopayErrorCode } from "./core/errors.js";

export * from "./core/types.js";
export {
  GOBIZ_API_BASE_URL,
  GOJEK_API_BASE_URL,
  PAID_TRANSACTION_STATUSES,
  DEFAULT_PAYMENT_TYPES,
} from "./core/constants.js";
