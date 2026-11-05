import { z } from "zod";

export const VIOLATION_CODES = [
  "MANDATE_INVALID",
  "PROPOSAL_INVALID",
  "OBSERVATION_INVALID",
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
  "OBSERVED_AMOUNT_MISMATCH",
  "OBSERVED_CURRENCY_MISMATCH",
  "BINDING_MISMATCH",
  // Raised by the gate, not by the evaluators: the stored mandate no longer
  // matches its own hash (D-015). The domain never recomputes the hash.
  "MANDATE_HASH_MISMATCH",
] as const;

export type ViolationCode = (typeof VIOLATION_CODES)[number];

// `limit` is the maximum the mandate allows, `expected` is a value that was
// calculated, and `actual` is what the proposal carried. Money fields are in
// minor units; quantity fields are counts.
//
// The optional fields accept an explicit `undefined` so that the type matches
// what DecisionSchema parses (Zod's optional); the evaluators never set them to
// undefined, they leave them out.
export type Violation = {
  readonly code: ViolationCode;
  readonly productId?: string | undefined;
  readonly variantId?: string | undefined;
  readonly limit?: number | undefined;
  readonly expected?: number | undefined;
  readonly actual?: number | undefined;
};

export type Decision =
  | { readonly decision: "allow"; readonly computedTotalMinor: number }
  | { readonly decision: "block"; readonly violations: readonly Violation[] };

// Used by nextPaymentAction to re-check a decision it is handed. A valid allow
// has a safe-integer total and nothing else. A valid block lists at least one
// violation with a known code. Anything else is not a decision we understand.
const ViolationSchema = z.strictObject({
  code: z.enum(VIOLATION_CODES),
  productId: z.string().optional(),
  variantId: z.string().optional(),
  limit: z.number().optional(),
  expected: z.number().optional(),
  actual: z.number().optional(),
});

export const DecisionSchema = z.union([
  z.strictObject({ decision: z.literal("allow"), computedTotalMinor: z.int().min(0) }),
  z.strictObject({ decision: z.literal("block"), violations: z.array(ViolationSchema).min(1) }),
]);
