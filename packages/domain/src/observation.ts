import { z } from "zod";
import { MinorUnitsSchema } from "./money.ts";

// The facts PayPal reported about an authorization, already extracted by the
// adapter (Increment 3). The domain only defines the shape. The amount is in
// minor units, so converting PayPal's "95.00" string is the adapter's job.
// customId is null when PayPal returned none.
export const ObservedPaymentSchema = z.strictObject({
  amountMinor: MinorUnitsSchema,
  currency: z.string().min(1).max(16),
  customId: z.string().max(256).nullable(),
});
export type ObservedPayment = z.infer<typeof ObservedPaymentSchema>;
