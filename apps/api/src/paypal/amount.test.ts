import { describe, expect, it } from "vitest";
import { formatPayPalAmount, parsePayPalUsdAmount } from "./amount.ts";

describe("parsePayPalUsdAmount", () => {
  it.each<[string, number]>([
    ["72.00", 7200],
    ["0.00", 0],
    ["0.01", 1],
    ["0.99", 99],
    ["1.00", 100],
    ["1000000.50", 100000050],
    // The largest value that is still a safe integer of cents.
    ["90071992547409.91", 9007199254740991],
  ])("reads %s as %d cents", (value, expected) => {
    expect(parsePayPalUsdAmount(value)).toBe(expected);
  });

  it.each([
    "72",
    "72.0",
    "72.000",
    "072.00",
    "00.50",
    "-1.00",
    "+1.00",
    "1e2",
    "1.00e2",
    " 72.00",
    "72.00 ",
    "72.00\n",
    "7 2.00",
    "72,00",
    ".50",
    "",
    "abc",
    "72.0O",
    "٧٢.٠٠",
    "１２.００",
    // One cent past the safe-integer range, and a whole part too long to hold exactly.
    "90071992547409.92",
    "99999999999999999999.00",
  ])("rejects the string %j", (value) => {
    expect(parsePayPalUsdAmount(value)).toBeNull();
  });

  it.each([72, 72.0, null, undefined, {}, [], true, ["72.00"], { toString: () => "72.00" }])(
    "rejects a value that is not a string: %j",
    (value) => {
      expect(parsePayPalUsdAmount(value)).toBeNull();
    },
  );
});

describe("formatPayPalAmount", () => {
  it.each<[number, string]>([
    [7200, "72.00"],
    [0, "0.00"],
    [1, "0.01"],
    [99, "0.99"],
    [100, "1.00"],
    [100050, "1000.50"],
    [9007199254740991, "90071992547409.91"],
  ])("writes %d cents as %s", (minor, expected) => {
    expect(formatPayPalAmount(minor)).toBe(expected);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects %s",
    (minor) => {
      expect(formatPayPalAmount(minor)).toBeNull();
    },
  );

  it("round-trips through the parser", () => {
    for (const minor of [0, 1, 9, 10, 99, 100, 101, 12345, 7200, 999999999, 9007199254740991]) {
      const text = formatPayPalAmount(minor);
      expect(text).not.toBeNull();
      expect(parsePayPalUsdAmount(text)).toBe(minor);
    }
  });
});
