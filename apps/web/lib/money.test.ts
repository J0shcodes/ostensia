import { describe, expect, it } from "vitest";
import { formatMinorAsDecimal, parseMoneyToMinor, parseWholeNumber } from "./money.ts";

describe("parseMoneyToMinor", () => {
  it.each([
    ["12.50", 1250],
    ["12.5", 1250],
    ["12", 1200],
    ["0.01", 1],
    ["0.10", 10],
    ["0", 0],
    ["1.05", 105],
    ["007.50", 750],
    [" 3.00 ", 300],
    ["9999999999999.99", 999999999999999],
  ])("reads %j as %i cents", (input, minor) => {
    expect(parseMoneyToMinor(input)).toEqual({ ok: true, minor });
  });

  // These are the amounts where multiplying a float by 100 goes wrong
  // (0.29 * 100 is 28.999999999999996). String arithmetic must not.
  it.each([
    ["0.07", 7],
    ["0.29", 29],
    ["1.15", 115],
    ["4.35", 435],
    ["19.99", 1999],
    ["8.20", 820],
    ["1.005", null],
  ])("is exact for %j", (input, minor) => {
    const result = parseMoneyToMinor(input);
    if (minor === null) expect(result.ok).toBe(false);
    else expect(result).toEqual({ ok: true, minor });
  });

  it("reports an empty field as empty", () => {
    expect(parseMoneyToMinor("")).toEqual({ ok: false, reason: "empty" });
    expect(parseMoneyToMinor("   ")).toEqual({ ok: false, reason: "empty" });
  });

  it.each([
    "1.505",
    "-1",
    "+1",
    "1e3",
    "$1",
    "1,000",
    "1.",
    ".5",
    "abc",
    "1 .00",
    "１２", // full-width digits
    "0x10",
    "1_000",
    "10000000000000", // 14 whole-dollar digits
    "NaN",
    "Infinity",
  ])("rejects %j", (input) => {
    expect(parseMoneyToMinor(input)).toEqual({ ok: false, reason: "format" });
  });

  it("round-trips through formatMinorAsDecimal", () => {
    for (let minor = 0; minor <= 20_000; minor += 7) {
      expect(parseMoneyToMinor(formatMinorAsDecimal(minor))).toEqual({ ok: true, minor });
    }
  });
});

describe("formatMinorAsDecimal", () => {
  it.each([
    [1250, "12.50"],
    [5, "0.05"],
    [0, "0.00"],
    [100, "1.00"],
    [99, "0.99"],
    [123456789, "1234567.89"],
  ])("formats %i as %j", (minor, text) => {
    expect(formatMinorAsDecimal(minor)).toBe(text);
  });

  it("returns an empty string rather than a plausible wrong amount", () => {
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
      expect(formatMinorAsDecimal(bad)).toBe("");
    }
  });
});

describe("parseWholeNumber", () => {
  it.each([
    ["2", 2],
    ["0", 0],
    ["007", 7],
    [" 15 ", 15],
    ["1000000", 1_000_000],
  ])("reads %j as %i", (input, value) => {
    expect(parseWholeNumber(input)).toEqual({ ok: true, value });
  });

  it("separates empty from malformed", () => {
    expect(parseWholeNumber("")).toEqual({ ok: false, reason: "empty" });
    for (const bad of ["1.5", "-1", "1e3", "two", "1 000", "9999999999999999"]) {
      expect(parseWholeNumber(bad)).toEqual({ ok: false, reason: "format" });
    }
  });
});
