/**
 * CRC-16/CCITT-FALSE implementation, the checksum algorithm mandated by the
 * EMVCo QR Code specification (and therefore Indonesia's QRIS standard).
 *
 * Parameters: polynomial 0x1021, initial value 0xFFFF, no reflection, no final
 * XOR. The result is rendered as a 4-character uppercase hexadecimal string.
 */

export function crc16ccitt(input: string): string {
  let crc = 0xffff;

  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }
      crc &= 0xffff;
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, "0");
}
