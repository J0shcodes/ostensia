import { describe, expect, it } from "vitest";
import { MinorUnitsSchema, addMinor, formatUsd, mulMinor } from "./money.ts";

const MAX = Number.MAX_SAFE_INTEGER;

describe("MinorUnitsSchema", () => {
  it.each([0, 1, 100, MAX])("accepts %j", (value) => {
    expect(MinorUnitsSchema.safeParse(value).success).toBe(true);
  });

  it.each([-1, 1.5, Number.NaN, Infinity, -Infinity, MAX + 1, 1e21, "5", null, undefined, {}])(
    "rejects %j",
    (value) => {
      expect(MinorUnitsSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe("addMinor", () => {
  it("adds safe integers", () => {
    expect(addMinor(1, 2)).toBe(3);
    expect(addMinor(MAX, 0)).toBe(MAX);
  });

  it("returns null when the result leaves the safe range", () => {
    expect(addMinor(MAX, 1)).toBeNull();
    expect(addMinor(MAX, MAX)).toBeNull();
  });

  it("returns null for inputs that are not safe integers", () => {
    expect(addMinor(1.5, 1)).toBeNull();
    expect(addMinor(Number.NaN, 1)).toBeNull();
    expect(addMinor(2 ** 53, 0)).toBeNull();
  });
});

describe("mulMinor", () => {
  it("multiplies safe integers", () => {
    expect(mulMinor(3, 4)).toBe(12);
    expect(mulMinor(0, MAX)).toBe(0);
  });

  it("is exact right below the limit and null right above it", () => {
    expect(mulMinor(94906265, 94906265)).toBe(Number(94906265n * 94906265n));
    expect(94906266n * 94906266n > BigInt(MAX)).toBe(true);
    expect(mulMinor(94906266, 94906266)).toBeNull();
  });

  it("returns null at exactly 2^53", () => {
    expect(mulMinor(2 ** 52, 2)).toBeNull();
    expect(mulMinor(2 ** 52, 1)).toBe(2 ** 52);
  });

  it("returns null for inputs that are not safe integers", () => {
    expect(mulMinor(0.5, 2)).toBeNull();
    expect(mulMinor(Infinity, 0)).toBeNull();
  });
});

describe("formatUsd", () => {
  it.each([
    [0, "$0.00"],
    [5, "$0.05"],
    [99, "$0.99"],
    [100, "$1.00"],
    [7500, "$75.00"],
    [123456, "$1,234.56"],
    [100000000, "$1,000,000.00"],
    [MAX, "$90,071,992,547,409.91"],
  ])("formats %j as %s", (minor, expected) => {
    expect(formatUsd(minor)).toBe(expected);
  });

  it.each([-1, 1.5, Number.NaN, Infinity, MAX + 1])("does not format %j", (value) => {
    expect(formatUsd(value)).toBe("an invalid amount");
  });
});
