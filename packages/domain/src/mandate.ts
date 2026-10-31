import { z } from "zod";
import {
  IdentifierSchema,
  IsoUtcTimestampSchema,
  MAX_ITEMS_PER_MANDATE,
  MAX_QUANTITY,
  hasUniqueValues,
} from "./primitives.ts";

// A mandate has two shapes (D-009). MandateDraft is what the AI proposes: any
// field it could not read from the instruction is null. ConfirmedMandate is
// what the user confirmed: every field is present and valid, and it is
// immutable (an edit creates a new mandate).

export const MandateItemSchema = z.strictObject({
  productId: IdentifierSchema,
  allowedVariantIds: z
    .array(IdentifierSchema)
    .min(1)
    .max(50)
    .refine(hasUniqueValues, "allowedVariantIds must be unique")
    .optional(),
  maxQuantity: z.int().min(1).max(MAX_QUANTITY),
  maxUnitPriceMinor: z.int().min(1),
});
export type MandateItem = z.infer<typeof MandateItemSchema>;

export const MandateTermsSchema = z.strictObject({
  currency: z.literal("USD"),
  maxTotalMinor: z.int().min(1),
  expiresAt: IsoUtcTimestampSchema,
  items: z
    .array(MandateItemSchema)
    .min(1)
    .max(MAX_ITEMS_PER_MANDATE)
    .refine((items) => hasUniqueValues(items.map((item) => item.productId)), "productId values must be unique"),
});
export type MandateTerms = z.infer<typeof MandateTermsSchema>;

export const ConfirmedMandateSchema = z.strictObject({
  id: IdentifierSchema,
  version: z.literal(1),
  terms: MandateTermsSchema,
  intentSummary: z.string().min(1).max(500),
  confirmedAt: IsoUtcTimestampSchema,
  status: z.enum(["confirmed", "revoked"]),
  // SHA-256 of the canonical binding payload, computed in apps/api (D-015).
  hash: z.string().regex(/^[0-9a-f]{64}$/),
});
export type ConfirmedMandate = z.infer<typeof ConfirmedMandateSchema>;

const DraftItemSchema = z.strictObject({
  productId: z.string().min(1).max(128).nullable(),
  allowedVariantIds: z.array(z.string().min(1).max(128)).max(50).optional(),
  maxQuantity: z.int().min(0).nullable(),
  maxUnitPriceMinor: z.int().min(0).nullable(),
});

export const MandateDraftSchema = z.strictObject({
  intentSummary: z.string().max(500),
  currency: z.literal("USD").nullable(),
  maxTotalMinor: z.int().min(0).nullable(),
  items: z.array(DraftItemSchema).max(MAX_ITEMS_PER_MANDATE),
  expiresAt: z.string().max(40).nullable(),
  notes: z.array(z.string().max(300)).max(20),
});
export type MandateDraft = z.infer<typeof MandateDraftSchema>;
