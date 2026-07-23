import { describe, expect, it } from "vitest";
import {
  crc16ccitt,
} from "../src/utils/crc16.js";
import {
  parseEmv,
  buildEmv,
  staticToDynamicQris,
  isValidQrisChecksum,
  QRIS_TAGS,
} from "../src/qris/qris.js";

// A minimal but structurally valid static QRIS-like payload for testing.
// Tags: 00 (format), 01 (POI=11 static), 59 (name), then CRC (63).
function makeStaticQris(): string {
  const body = "000201" + "010211" + "5905ATMOS";
  const withCrcHeader = `${body}6304`;
  return `${withCrcHeader}${crc16ccitt(withCrcHeader)}`;
}

describe("crc16ccitt", () => {
  it("matches known EMVCo checksum vector", () => {
    // "123456789" under CRC-16/CCITT-FALSE => 0x29B1
    expect(crc16ccitt("123456789")).toBe("29B1");
  });
});

describe("parseEmv / buildEmv", () => {
  it("round-trips a payload and recomputes a valid CRC", () => {
    const payload = makeStaticQris();
    const map = parseEmv(payload);
    expect(map.get(QRIS_TAGS.payloadFormat)).toBe("01");
    expect(map.get(QRIS_TAGS.pointOfInitiation)).toBe("11");

    const rebuilt = buildEmv(map);
    expect(isValidQrisChecksum(rebuilt)).toBe(true);
  });
});

describe("staticToDynamicQris", () => {
  it("injects amount, flips POI to dynamic, and keeps a valid checksum", () => {
    const staticPayload = makeStaticQris();
    const dynamic = staticToDynamicQris(staticPayload, 10001);

    const map = parseEmv(dynamic);
    expect(map.get(QRIS_TAGS.pointOfInitiation)).toBe(QRIS_TAGS.poiDynamic);
    expect(map.get(QRIS_TAGS.transactionAmount)).toBe("10001");
    expect(isValidQrisChecksum(dynamic)).toBe(true);
  });

  it("rejects non-positive or non-integer amounts", () => {
    const staticPayload = makeStaticQris();
    expect(() => staticToDynamicQris(staticPayload, 0)).toThrow();
    expect(() => staticToDynamicQris(staticPayload, 1.5)).toThrow();
  });

  it("rejects payloads without tag 00", () => {
    expect(() => staticToDynamicQris("0102115905ATMOS", 100)).toThrow();
  });
});
