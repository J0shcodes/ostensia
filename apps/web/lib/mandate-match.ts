import { canonicalize } from "@ostensia/domain";
import type { ConfirmedMandate, MandateTerms } from "@ostensia/domain";

// Creating a mandate is not idempotent: every POST makes a new mandate with a new id
// (apps/api/src/gate/gate.ts). So when a confirmation does not come back, the request
// may or may not have created one, and sending it again could make a duplicate. Before
// the person decides, the page lists the existing mandates and shows any that have
// exactly these terms and this summary.
//
// "Exactly" means the domain's canonical form, which does not depend on key order. A
// revoked mandate is not a match: it can no longer be used.
export function findMatchingMandates(
  mandates: readonly ConfirmedMandate[],
  terms: MandateTerms,
  intentSummary: string,
): ConfirmedMandate[] {
  let wanted: string;
  try {
    wanted = canonicalize(terms);
  } catch {
    return [];
  }
  return mandates.filter((mandate) => {
    if (mandate.status !== "confirmed" || mandate.intentSummary !== intentSummary) return false;
    try {
      return canonicalize(mandate.terms) === wanted;
    } catch {
      return false;
    }
  });
}
