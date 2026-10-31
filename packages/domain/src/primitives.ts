import { z } from "zod";

// Input bounds. They are MVP limits (TD-012), not product rules. Bounding the
// quantity keeps per-product quantity sums far below the safe-integer limit.
export const MAX_QUANTITY = 1_000_000;
export const MAX_ITEMS_PER_MANDATE = 50;
export const MAX_LINES_PER_PURCHASE = 100;

// Product, variant and mandate ids. A restricted ASCII charset means an id can
// be compared exactly, hashed and shown in an explanation without surprises.
export const IdentifierSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);

export const QuantitySchema = z.int().min(1).max(MAX_QUANTITY);

// UTC only: "Z" is required, offsets are rejected, and impossible dates such as
// 2026-02-30 do not pass.
export const IsoUtcTimestampSchema = z.iso.datetime();

export function hasUniqueValues(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}
