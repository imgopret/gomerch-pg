import { request } from "undici";
import { HttpError } from "../core/errors.js";
import { DEFAULT_REQUEST_TIMEOUT_MS } from "../core/constants.js";
import type { Logger } from "../utils/logger.js";
import { noopLogger } from "../utils/logger.js";
import type { TokenManager } from "../core/tokenManager.js";

export type QueryValue = string | number | boolean | undefined | null;

export interface HttpRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  baseUrl?: string;
  query?: Record<string, QueryValue>;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

export interface HttpClientOptions {
  baseUrl: string;
  defaultHeaders?: Record<string, string>;
  timeoutMs?: number;
  logger?: Logger;
  /** Optional token manager for automatic 401 retry with refreshed token. */
  tokenManager?: TokenManager;
}

/**
 * Thin JSON HTTP client over undici. It centralizes base URL handling, query
 * serialization, JSON encoding/decoding, and non-2xx error mapping so the API
 * clients stay declarative.
 *
 * When a TokenManager is provided, 401 responses automatically trigger token
 * refresh and retry the request once with the new access token.
 */
export class HttpClient {
  private readonly baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private readonly timeoutMs: number;
  private readonly logger: Logger;
  private tokenManager?: TokenManager;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.defaultHeaders = { ...(options.defaultHeaders ?? {}) };
    this.timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.logger = options.logger ?? noopLogger;
    this.tokenManager = options.tokenManager;
  }

  /** Set the token manager for automatic 401 retry. */
  setTokenManager(tokenManager: TokenManager | undefined): void {
    this.tokenManager = tokenManager;
  }

  /** Replace the full set of default headers sent with every request. */
  setDefaultHeaders(headers: Record<string, string>): void {
    this.defaultHeaders = { ...headers };
  }

  /** Set or remove a single default header. */
  setDefaultHeader(name: string, value: string | undefined): void {
    if (value === undefined) {
      delete this.defaultHeaders[name];
    } else {
      this.defaultHeaders[name] = value;
    }
  }

  async requestJson<T>(options: HttpRequestOptions): Promise<T> {
    const method = options.method ?? "GET";
    const base = (options.baseUrl ?? this.baseUrl).replace(/\/+$/, "");
    const url = this.buildUrl(base, options.path, options.query);

    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      ...options.headers,
    };

    let payload: string | undefined;
    if (options.body !== undefined && options.body !== null) {
      payload = JSON.stringify(options.body);
      headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
    }

    this.logger.debug("http request", { method, url });

    let response = await request(url, {
      method,
      headers,
      body: payload,
      headersTimeout: options.timeoutMs ?? this.timeoutMs,
      bodyTimeout: options.timeoutMs ?? this.timeoutMs,
    });

    let text = await response.body.text();
    let parsed = this.tryParseJson(text);

    // Auto-refresh on 401 Unauthorized (token expired)
    if (response.statusCode === 401 && this.tokenManager) {
      this.logger.info("http 401 detected, attempting token refresh");

      try {
        // Get fresh access token (TokenManager handles deduplication)
        const newAccessToken = await this.tokenManager.getValidAccessToken();

        // Update Authorization header and retry
        headers.Authorization = `Bearer ${newAccessToken}`;

        this.logger.debug("http retrying request with refreshed token", {
          method,
          url,
        });

        response = await request(url, {
          method,
          headers,
          body: payload,
          headersTimeout: options.timeoutMs ?? this.timeoutMs,
          bodyTimeout: options.timeoutMs ?? this.timeoutMs,
        });

        text = await response.body.text();
        parsed = this.tryParseJson(text);
      } catch (refreshError) {
        this.logger.error("http token refresh failed", {
          error:
            refreshError instanceof Error
              ? refreshError.message
              : String(refreshError),
        });
        // Fall through to throw the original 401 error below
      }
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      this.logger.warn("http error", {
        url,
        status: response.statusCode,
      });
      throw new HttpError(
        response.statusCode,
        `Request to ${options.path} failed with status ${response.statusCode}`,
        parsed ?? text,
        { method, url },
      );
    }

    return (parsed ?? {}) as T;
  }

  private buildUrl(
    base: string,
    path: string,
    query?: Record<string, QueryValue>,
  ): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${base}${normalizedPath}`);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        url.searchParams.set(key, String(value));
      }
    }

    return url.toString();
  }

  private tryParseJson(text: string): unknown {
    if (!text) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }
}
