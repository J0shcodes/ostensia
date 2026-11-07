// Money in the form is text. It becomes integer cents by splitting the string and never
// by multiplying a float, so no amount can be off by a rounding error (CLAUDE.md
// section 7). The domain has no parser for this, so it lives here. Display uses the
// domain's own formatUsd.

export type MoneyParse =
  | { readonly ok: true; readonly minor: number }
  | { readonly ok: false; readonly reason: "empty" | "format" };

// Whole dollars, then optionally a point and one or two digits. At most 13 whole-dollar
// digits, so the result is always below 2^53 and the arithmetic below is exact.
// Signs, exponents, thousands separators and a currency symbol are all rejected: the
// field already shows "$" and "USD".
const MONEY_PATTERN = /^([0-9]{1,13})(?:\.([0-9]{1,2}))?$/;

export function parseMoneyToMinor(input: string): MoneyParse {
  const text = input.trim();
  if (text === "") return { ok: false, reason: "empty" };
  const match = MONEY_PATTERN.exec(text);
  if (match === null) return { ok: false, reason: "format" };
  const whole = match[1] ?? "";
  const fraction = (match[2] ?? "").padEnd(2, "0");
  return { ok: true, minor: Number(whole) * 100 + Number(fraction) };
}

// Cents back to the text a person would type ("1250" -> "12.50"). Integer arithmetic
// only. Returns "" for anything that is not a safe non-negative integer, so a bad
// value never turns into a plausible-looking amount.
export function formatMinorAsDecimal(minor: number): string {
  if (!Number.isSafeInteger(minor) || minor < 0) return "";
  const cents = minor % 100;
  return `${(minor - cents) / 100}.${String(cents).padStart(2, "0")}`;
}

// A whole number typed into a quantity field.
export type CountParse =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly reason: "empty" | "format" };

const COUNT_PATTERN = /^[0-9]{1,15}$/;

export function parseWholeNumber(input: string): CountParse {
  const text = input.trim();
  if (text === "") return { ok: false, reason: "empty" };
  if (!COUNT_PATTERN.test(text)) return { ok: false, reason: "format" };
  return { ok: true, value: Number(text) };
}
