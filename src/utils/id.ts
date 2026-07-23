import { randomUUID } from "node:crypto";

/** Generate an RFC4122 v4 UUID. */
export const uuid = (): string => randomUUID();

/**
 * Generate a short, url-safe, time-ordered identifier for payments. Combines a
 * base36 timestamp with random entropy so ids sort roughly by creation time.
 */
export function paymentId(): string {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `pay_${time}${rand}`;
}
