import { crc16ccitt } from "../utils/crc16.js";
import { GopayMerchantError } from "../core/errors.js";

/**
 * A parsed EMVCo QR data object: a map of tag id to raw value string. Nested
 * templates keep their inner payload as the raw value.
 */
export type EmvTlvMap = Map<string, string>;

const TAG_PAYLOAD_FORMAT = "00";
const TAG_POINT_OF_INITIATION = "01";
const TAG_TRANSACTION_AMOUNT = "54";
const TAG_CRC = "63";

const POI_STATIC = "11";
const POI_DYNAMIC = "12";

/**
 * Parse an EMVCo/QRIS payload string into a flat TLV map. Each element is
 * `<2-digit tag><2-digit length><value>`. Nested templates are preserved as
 * raw values and can be parsed again by the caller if needed.
 */
export function parseEmv(payload: string): EmvTlvMap {
  const map: EmvTlvMap = new Map();
  let cursor = 0;

  while (cursor < payload.length) {
    const tag = payload.slice(cursor, cursor + 2);
    cursor += 2;

    const lengthText = payload.slice(cursor, cursor + 2);
    cursor += 2;

    const length = Number.parseInt(lengthText, 10);
    if (tag.length < 2 || lengthText.length < 2 || Number.isNaN(length)) {
      throw new GopayMerchantError(
        "QRIS_PARSE_ERROR",
        `Malformed QRIS payload near index ${cursor}`,
      );
    }

    const value = payload.slice(cursor, cursor + length);
    cursor += length;
    map.set(tag, value);
  }

  return map;
}

/** Serialize a single TLV element with a zero-padded two digit length. */
export function encodeTlv(tag: string, value: string): string {
  const length = value.length.toString().padStart(2, "0");
  return `${tag}${length}${value}`;
}

/**
 * Rebuild an EMVCo payload from a TLV map and append a freshly computed CRC.
 * Tags are emitted in ascending numeric order to keep output deterministic,
 * except the CRC tag which is always placed last per the specification.
 */
export function buildEmv(map: EmvTlvMap): string {
  const tags = [...map.keys()]
    .filter((tag) => tag !== TAG_CRC)
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));

  let body = "";
  for (const tag of tags) {
    body += encodeTlv(tag, map.get(tag) ?? "");
  }

  // CRC is computed over the payload including the CRC tag id and length.
  const withCrcHeader = `${body}${TAG_CRC}04`;
  const crc = crc16ccitt(withCrcHeader);
  return `${withCrcHeader}${crc}`;
}

/**
 * Convert a static QRIS payload into a dynamic one carrying a fixed amount.
 *
 * GoPay merchant QRIS codes are static (no amount). To make each order unique
 * and machine-detectable, we inject tag 54 (transaction amount) and flip the
 * point-of-initiation method (tag 01) from static (11) to dynamic (12), then
 * recompute the CRC.
 *
 * @param staticPayload The merchant's static QRIS string.
 * @param amount Whole-rupiah amount to embed.
 */
export function staticToDynamicQris(
  staticPayload: string,
  amount: number,
): string {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new GopayMerchantError(
      "QRIS_PARSE_ERROR",
      "QRIS amount must be a positive integer",
    );
  }

  const map = parseEmv(staticPayload);

  if (!map.has(TAG_PAYLOAD_FORMAT)) {
    throw new GopayMerchantError(
      "QRIS_PARSE_ERROR",
      "Input does not look like a QRIS payload (missing tag 00)",
    );
  }

  map.set(TAG_POINT_OF_INITIATION, POI_DYNAMIC);
  map.set(TAG_TRANSACTION_AMOUNT, String(amount));

  return buildEmv(map);
}

/** Validate the trailing CRC of a QRIS payload. */
export function isValidQrisChecksum(payload: string): boolean {
  if (payload.length < 8) return false;
  const withoutCrc = payload.slice(0, -4);
  const provided = payload.slice(-4).toUpperCase();
  return crc16ccitt(withoutCrc) === provided;
}

export const QRIS_TAGS = {
  payloadFormat: TAG_PAYLOAD_FORMAT,
  pointOfInitiation: TAG_POINT_OF_INITIATION,
  transactionAmount: TAG_TRANSACTION_AMOUNT,
  crc: TAG_CRC,
  poiStatic: POI_STATIC,
  poiDynamic: POI_DYNAMIC,
} as const;
