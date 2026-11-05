import type { AuthorizationState } from "@ostensia/domain";
import type { WriteAction } from "./events.ts";

// What reading PayPal's state tells us about an attempt whose write has an
// unknown or refused outcome. Reconcile only reads; it never sends a write
// (D-010). A conclusion is drawn only when the evidence matches the action the
// gate intended; anything else is left for a person.
//
//   captured   the authorization is CAPTURED and every capture is complete
//   voided     the authorization is VOIDED
//   conflict   it was settled the OPPOSITE way to the action the gate intended
//   unchanged  the evidence does not settle it
export type ReconcileOutcome = "captured" | "voided" | "conflict" | "unchanged";

export function reconcileOutcome(
  intended: WriteAction | null,
  authorization: AuthorizationState,
  captureStates: readonly string[],
): ReconcileOutcome {
  if (intended === "capture") {
    if (authorization === "captured") {
      // A capture that is still pending is not money moved yet.
      return captureStates.every((state) => state === "completed") ? "captured" : "unchanged";
    }
    if (authorization === "voided") return "conflict";
    return "unchanged";
  }
  if (intended === "void") {
    if (authorization === "voided") return "voided";
    if (authorization === "captured" || authorization === "partially_captured") return "conflict";
    return "unchanged";
  }
  return "unchanged";
}
