import { z } from "zod";

// All money is integer minor units (cents). USD only (TD-008). Floats never
// represent money; PayPal's "75.00" strings are converted at the adapter.
export const MinorUnitsSchema = z.int().min(0);
export type MinorUnits = z.infer<typeof MinorUnitsSchema>;

// Both helpers return null instead of a wrong number when an input is not a
// safe integer or the result leaves the safe-integer range. When the true
// result is a safe integer the floating-point result is exact, so the check
// below cannot be fooled by rounding.
export function addMinor(a: number, b: number): number | null {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) return null;
  const sum = a + b;
  return Number.isSafeInteger(sum) ? sum : null;
}

export function mulMinor(a: number, b: number): number | null {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) return null;
  const product = a * b;
  return Number.isSafeInteger(product) ? product : null;
}

// For explanations only. Integer arithmetic throughout, so large values are
// exact.
export function formatUsd(minor: number): string {
  if (!Number.isSafeInteger(minor) || minor < 0) return "an invalid amount";
  const cents = minor % 100;
  const dollars = (minor - cents) / 100;
  const grouped = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `$${grouped}.${String(cents).padStart(2, "0")}`;
}
