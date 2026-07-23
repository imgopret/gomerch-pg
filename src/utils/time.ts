/** Small time helpers used across the gateway. */

export const now = (): number => Date.now();

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Format a Date as an ISO string in UTC, matching the dashboard query style. */
export const toIsoUtc = (date: Date): string => date.toISOString();

/**
 * Returns the [start, end] of the local day for a given date, expressed as
 * Date objects. Useful for building the default transaction polling window.
 */
export function dayBounds(reference: Date = new Date()): {
  start: Date;
  end: Date;
} {
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);
  const end = new Date(reference);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}
