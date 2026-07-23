import { HttpClient } from "../http/httpClient.js";
import {
  DEFAULT_PAYMENT_TYPES,
  ENDPOINTS,
  GOJEK_API_BASE_URL,
  PAID_TRANSACTION_STATUSES,
} from "../core/constants.js";
import { toIsoUtc } from "../utils/time.js";
import type {
  MerchantTransaction,
  TransactionQuery,
} from "../core/types.js";

interface RawTransaction {
  id: string;
  order_id: string;
  merchant_id: string;
  transaction_status: string;
  payment_type: string;
  gross_amount: number;
  real_gross_amount?: number;
  currency?: string;
  transaction_time: string;
  settlement_time?: string;
  transaction_source?: string;
  [key: string]: unknown;
}

interface TransactionListPayload {
  from: number;
  size: number;
  total: number;
  transactions?: RawTransaction[];
}

/**
 * Reads settled/authorized transactions from the merchant analytics API. This
 * is the signal source the gateway polls to detect incoming QRIS payments.
 */
export class TransactionClient {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async list(
    merchantId: string,
    query: TransactionQuery,
  ): Promise<MerchantTransaction[]> {
    // Undefined -> sensible defaults; an explicit empty array -> omit the
    // filter entirely (fetch all), letting the caller match client-side.
    const statuses = query.statuses ?? PAID_TRANSACTION_STATUSES;
    const paymentTypes = query.paymentTypes ?? DEFAULT_PAYMENT_TYPES;

    const params: Record<string, string | number> = {
      from: query.from ?? 0,
      size: query.size ?? 20,
      start_time: toIsoUtc(query.startTime),
      end_time: toIsoUtc(query.endTime),
      merchant_ids: merchantId,
    };
    if (statuses.length > 0) params.statuses = statuses.join(",");
    if (paymentTypes.length > 0) params.payment_types = paymentTypes.join(",");

    const payload = await this.http.requestJson<TransactionListPayload>({
      method: "GET",
      baseUrl: GOJEK_API_BASE_URL,
      path: ENDPOINTS.transactions,
      query: params,
    });

    return (payload.transactions ?? []).map(normalizeTransaction);
  }
}

function normalizeTransaction(raw: RawTransaction): MerchantTransaction {
  return {
    id: raw.id,
    orderId: raw.order_id,
    merchantId: raw.merchant_id,
    status: raw.transaction_status,
    paymentType: raw.payment_type,
    grossAmount: raw.gross_amount,
    realGrossAmount: raw.real_gross_amount,
    currency: raw.currency ?? "IDR",
    transactionTime: raw.transaction_time,
    settlementTime: raw.settlement_time,
    transactionSource: raw.transaction_source,
    raw,
  };
}
