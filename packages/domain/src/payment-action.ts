import { DecisionSchema } from "./decision.ts";

export type PaymentAction = "capture" | "void" | "none";

// The payment-action table from D-007:
//   valid allow + authorization "created" -> capture
//   valid block + authorization "created" -> void
//   everything else                       -> none (no PayPal write)
//
// Both arguments are `unknown` on purpose. A decision that is missing, has an
// unexpected shape, or is a block with no violations is not a decision we
// understand, and neither is an authorization state that is not exactly
// "created" (this includes raw PayPal strings such as "CREATED", which must go
// through mapAuthorizationStatus first). A void cannot be undone, so a decision
// we cannot read leads to no write, and the authorization lapses at expiry.
//
// The caller must pass the FINAL decision (finalEvaluatePurchase), not the
// pre-check. That ordering is the gate's job (Increment 5).
export function nextPaymentAction(decision: unknown, authorization: unknown): PaymentAction {
  if (authorization !== "created") return "none";
  const parsed = DecisionSchema.safeParse(decision);
  if (!parsed.success) return "none";
  return parsed.data.decision === "allow" ? "capture" : "void";
}
