import type { ConfirmedMandate, MandateTerms } from "@ostensia/domain";
import type { Catalogue, DraftResponse } from "../lib/api-types.ts";
import type { Failure } from "../lib/messages.ts";

// What the mandate screen can be showing. Each outcome is its own state, so the page
// cannot show something that did not happen (a confirmation that was only attempted,
// or a draft that is still loading).

export type CatalogueState =
  | { readonly kind: "loading" }
  | { readonly kind: "ok"; readonly catalogue: Catalogue }
  | { readonly kind: "error" };

export type DraftState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "ok"; readonly response: DraftResponse; readonly used: boolean }
  | { readonly kind: "failed"; readonly failure: Failure };

// After a confirmation that did not come back clearly: is there already a mandate with
// exactly these terms?
export type MatchCheck =
  | { readonly kind: "checking" }
  | { readonly kind: "found"; readonly matches: readonly ConfirmedMandate[] }
  | { readonly kind: "none" }
  | { readonly kind: "could_not_check" };

export type SentMandate = { readonly terms: MandateTerms; readonly intentSummary: string };

export type SubmitState =
  | { readonly kind: "idle" }
  // The form had problems; nothing was sent.
  | { readonly kind: "invalid" }
  | { readonly kind: "submitting" }
  // The API answered with a refusal (a 4xx). It did not create a mandate.
  | { readonly kind: "refused"; readonly message: string }
  // No clear answer. The mandate may or may not exist.
  | { readonly kind: "uncertain"; readonly detail: string; readonly check: MatchCheck; readonly sent: SentMandate }
  | { readonly kind: "confirmed"; readonly mandate: ConfirmedMandate; readonly existing: boolean };
