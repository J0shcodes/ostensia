import { z } from "zod";
import { IdentifierSchema, MAX_LINES_PER_PURCHASE, QuantitySchema } from "./primitives.ts";

export const PurchaseLineSchema = z.strictObject({
  productId: IdentifierSchema,
  variantId: IdentifierSchema.optional(),
  quantity: QuantitySchema,
  unitPriceMinor: z.int().min(0),
});
export type PurchaseLine = z.infer<typeof PurchaseLineSchema>;

// The proposal's currency is any short string, and its lines may be empty, so
// a wrong currency or an empty cart is reported as a policy violation instead
// of an invalid proposal.
export const PurchaseProposalSchema = z.strictObject({
  mandateId: IdentifierSchema,
  currency: z.string().min(1).max(16),
  declaredTotalMinor: z.int().min(0),
  lines: z.array(PurchaseLineSchema).max(MAX_LINES_PER_PURCHASE),
});
export type PurchaseProposal = z.infer<typeof PurchaseProposalSchema>;
