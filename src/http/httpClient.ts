import { HttpError, ConfigError } from "../core/errors.js";
import { DEFAULT_REQUEST_TIMEOUT_MS } from "../core/constants.js";
import type { Logger } from "../utils/logger.js";
import { noopLogger } from "../utils/logger.js";
import type { TokenManager } from "../core/tokenManager.js";

export type QueryValue = string | number | boolean | undefined | null;

/**
 * The subset of the WHATWG `fetch` signature this client relies on. Any
 * spec-compliant fetch satisfies it: the global `fetch` in Node 18+, browsers,
 * Cloudflare Workers, Vercel (Node & Edge), Deno, and Bun. A custom
 * implementation can be injected for connection pooling (e.g. an undici
 * `Agent` in Node), proxying, or testing.
 */
export type FetchLike = typeof fetch;

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
  /**
   * Custom fetch implementation. Defaults to the runtime's global `fetch`.
   * Provide one to run on Node < 18 or to use a pooled/proxied client.
   */
  fetch?: FetchLike;
}

/**
 * Resolve the runtime global `fetch`, wrapped so it is always invoked with the
 * correct receiver (avoids "Illegal invocation" in browser-like runtimes).
 */
function resolveGlobalFetch(): FetchLike {
  if (typeof fetch === "function") {
    return (input, init) => fetch(input, init);
  }
  throw new ConfigError(
    "No global `fetch` is available in this runtime. Upgrade to Node 18+ or " +
      "pass a `fetch` implementation via the client config.",
  );
}

/**
 * Build a single-shot timeout AbortSignal. Uses `AbortSignal.timeout` when
 * available (Node 18+, Workers, Deno, Bun, modern browsers) and degrades to no
 * timeout on runtimes that lack it.
 */
function timeoutSignal(ms: number): AbortSignal | undefined {
  try {
    if (
      typeof AbortSignal !== "undefined" &&
      typeof AbortSignal.timeout === "function"
    ) {
      return AbortSignal.timeout(ms);
    }
  } catch {
    // Ignore and proceed without an abort signal.
  }
  return undefined;
}

/**
 * Thin JSON HTTP client over the WHATWG `fetch` API. It centralizes base URL
 * handling, query serialization, JSON encoding/decoding, timeouts, and non-2xx
 * error mapping so the API clients stay declarative. Being fetch-based, it runs
 * unchanged on any modern JavaScript runtime.
 *
 * When a TokenManager is provided, 401 responses automatically trigger token
 * refresh and retry the request once with the new access token.
 */
export class HttpClient {
  private readonly baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private readonly timeoutMs: number;
  private readonly logger: Logger;
  private readonly fetchImpl: FetchLike;
  private tokenManager?: TokenManager;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.defaultHeaders = { ...(options.defaultHeaders ?? {}) };
    this.timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.logger = options.logger ?? noopLogger;
    this.fetchImpl = options.fetch ?? resolveGlobalFetch();
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
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;

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

    let { status, text } = await this.send(url, method, headers, payload, timeoutMs);
    let parsed = this.tryParseJson(text);

    // Auto-refresh on 401 Unauthorized (token expired)
    if (status === 401 && this.tokenManager) {
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

        ({ status, text } = await this.send(url, method, headers, payload, timeoutMs));
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

    if (status < 200 || status >= 300) {
      this.logger.warn("http error", {
        url,
        status,
      });
      throw new HttpError(
        status,
        `Request to ${options.path} failed with status ${status}`,
        parsed ?? text,
        { method, url },
      );
    }

    return (parsed ?? {}) as T;
  }

  /** Perform a single request attempt and read the response body as text. */
  private async send(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: string | undefined,
    timeoutMs: number,
  ): Promise<{ status: number; text: string }> {
    try {
      const response = await this.fetchImpl(url, {
        method,
        headers,
        body,
        signal: timeoutSignal(timeoutMs),
      });
      const text = await response.text();
      return { status: response.status, text };
    } catch (error) {
      const name = (error as { name?: string } | null)?.name;
      if (name === "AbortError" || name === "TimeoutError") {
        throw new HttpError(
          408,
          `Request to ${url} timed out after ${timeoutMs}ms`,
          undefined,
          { method, url },
        );
      }
      throw error;
    }
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
