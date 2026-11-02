import { addMinor, mulMinor } from "@ostensia/domain";

// PayPal amounts are decimal strings. E-1 observed "72.00": digits, a dot and
// exactly two decimals (D-019). Anything else is not accepted, so an amount we
// cannot read exactly never reaches the evaluator as a number.
const AMOUNT = /^(0|[1-9][0-9]*)\.([0-9]{2})$/;

export function parsePayPalUsdAmount(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = AMOUNT.exec(value);
  if (match === null) return null;
  const [, whole, cents] = match;
  if (whole === undefined || cents === undefined) return null;

  // mulMinor and addMinor return null outside the safe-integer range. A whole
  // part too long to hold exactly cannot round into that range, so it is
  // rejected rather than rounded.
  const dollarsAsCents = mulMinor(Number(whole), 100);
  return dollarsAsCents === null ? null : addMinor(dollarsAsCents, Number(cents));
}

// The inverse, for the request body. Integer arithmetic only.
export function formatPayPalAmount(minor: number): string | null {
  if (!Number.isSafeInteger(minor) || minor < 0) return null;
  const cents = minor % 100;
  const dollars = (minor - cents) / 100;
  return `${dollars}.${String(cents).padStart(2, "0")}`;
}
