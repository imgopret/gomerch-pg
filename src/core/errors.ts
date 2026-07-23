/**
 * Typed error hierarchy for the gateway. Every failure surfaced to callers is
 * an instance of {@link GopayMerchantError}, which makes error handling in
 * consuming applications predictable.
 */

export type GopayErrorCode =
  | "CONFIG_INVALID"
  | "AUTH_REQUIRED"
  | "AUTH_FAILED"
  | "HTTP_ERROR"
  | "API_ERROR"
  | "AMOUNT_POOL_EXHAUSTED"
  | "PAYMENT_NOT_FOUND"
  | "PAYMENT_EXPIRED"
  | "QRIS_PARSE_ERROR";

export class GopayMerchantError extends Error {
  public readonly code: GopayErrorCode;
  public override readonly cause?: unknown;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: GopayErrorCode,
    message: string,
    options: { cause?: unknown; details?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.name = "GopayMerchantError";
    this.code = code;
    this.cause = options.cause;
    this.details = options.details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ConfigError extends GopayMerchantError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("CONFIG_INVALID", message, { details });
    this.name = "ConfigError";
  }
}

export class AuthError extends GopayMerchantError {
  constructor(
    code: Extract<GopayErrorCode, "AUTH_REQUIRED" | "AUTH_FAILED">,
    message: string,
    options: { cause?: unknown; details?: Record<string, unknown> } = {},
  ) {
    super(code, message, options);
    this.name = "AuthError";
  }
}

export class HttpError extends GopayMerchantError {
  public readonly status: number;
  public readonly body: unknown;

  constructor(
    status: number,
    message: string,
    body: unknown,
    details?: Record<string, unknown>,
  ) {
    super("HTTP_ERROR", message, { details });
    this.name = "HttpError";
    this.status = status;
    this.body = body;
  }
}

export class ApiError extends GopayMerchantError {
  public readonly apiCode?: string;

  constructor(
    message: string,
    options: {
      apiCode?: string;
      cause?: unknown;
      details?: Record<string, unknown>;
    } = {},
  ) {
    super("API_ERROR", message, {
      cause: options.cause,
      details: options.details,
    });
    this.name = "ApiError";
    this.apiCode = options.apiCode;
  }
}
