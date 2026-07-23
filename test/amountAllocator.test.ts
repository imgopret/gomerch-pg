import { describe, expect, it } from "vitest";
import { AmountAllocator } from "../src/payment/amountAllocator.js";

describe("AmountAllocator", () => {
  it("allocates the smallest free offset starting at 1", () => {
    const allocator = new AmountAllocator();
    expect(allocator.allocate([])).toBe(1);
    expect(allocator.allocate([1])).toBe(2);
    expect(allocator.allocate([1, 2])).toBe(3);
  });

  it("reuses freed offsets by picking the smallest gap", () => {
    const allocator = new AmountAllocator();
    // offsets 1 and 3 taken, 2 is free
    expect(allocator.allocate([1, 3])).toBe(2);
  });

  it("throws when the pool is exhausted", () => {
    const allocator = new AmountAllocator(3);
    expect(() => allocator.allocate([1, 2, 3])).toThrowError(
      /No free unique amount slot/,
    );
  });

  it("validates maxOffset", () => {
    expect(() => new AmountAllocator(0)).toThrow();
    expect(() => new AmountAllocator(1.5)).toThrow();
  });
});
