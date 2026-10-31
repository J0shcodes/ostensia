export const VIOLATION_CODES = [
  "MANDATE_INVALID",
  "PROPOSAL_INVALID",
  "CLOCK_INVALID",
  "MANDATE_MISMATCH",
  "MANDATE_REVOKED",
  "MANDATE_EXPIRED",
  "CURRENCY_MISMATCH",
  "EMPTY_PURCHASE",
  "PRODUCT_NOT_ALLOWED",
  "VARIANT_NOT_ALLOWED",
  "UNIT_PRICE_EXCEEDED",
  "QUANTITY_EXCEEDED",
  "AMOUNT_OVERFLOW",
  "TOTAL_EXCEEDED",
  "TOTAL_MISMATCH",
] as const;

export type ViolationCode = (typeof VIOLATION_CODES)[number];

// `limit` is the maximum the mandate allows, `expected` is a value that was
// calculated, and `actual` is what the proposal carried. Money fields are in
// minor units; quantity fields are counts.
export type Violation = {
  readonly code: ViolationCode;
  readonly productId?: string;
  readonly variantId?: string;
  readonly limit?: number;
  readonly expected?: number;
  readonly actual?: number;
};

export type Decision =
  | { readonly decision: "allow"; readonly computedTotalMinor: number }
  | { readonly decision: "block"; readonly violations: readonly Violation[] };
