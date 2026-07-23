import { DEFAULT_MAX_UNIQUE_OFFSET } from "../core/constants.js";
import { GopayMerchantError } from "../core/errors.js";

/**
 * Allocates a unique whole-rupiah offset for a base amount so that two
 * concurrent orders of the same nominal value can be told apart purely by the
 * amount that lands in the merchant account.
 *
 * Strategy: for a given base amount, pick the smallest offset in
 * [1, maxOffset] that is not currently occupied by another active payment of
 * the same base amount. Offsets are reused once the occupying payment leaves
 * the active set (paid, expired, or cancelled).
 */
export class AmountAllocator {
  private readonly maxOffset: number;

  constructor(maxOffset: number = DEFAULT_MAX_UNIQUE_OFFSET) {
    if (!Number.isInteger(maxOffset) || maxOffset < 1) {
      throw new GopayMerchantError(
        "CONFIG_INVALID",
        "maxOffset must be a positive integer",
      );
    }
    this.maxOffset = maxOffset;
  }

  /**
   * Find the smallest free offset for a base amount given the set of offsets
   * already taken. Returns a value in [1, maxOffset].
   *
   * @throws GopayMerchantError with code AMOUNT_POOL_EXHAUSTED when every
   * offset in range is occupied.
   */
  allocate(takenOffsets: Iterable<number>): number {
    const taken = new Set<number>(takenOffsets);

    for (let offset = 1; offset <= this.maxOffset; offset++) {
      if (!taken.has(offset)) {
        return offset;
      }
    }

    throw new GopayMerchantError(
      "AMOUNT_POOL_EXHAUSTED",
      `No free unique amount slot available (max ${this.maxOffset} concurrent payments per base amount)`,
    );
  }

  get max(): number {
    return this.maxOffset;
  }
}
