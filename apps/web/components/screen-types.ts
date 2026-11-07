import type { ConfirmedMandate, MandateTerms, PurchaseProposal } from "@ostensia/domain";
import type { AttemptRequest } from "../lib/api.ts";
import type { AttemptEnvelope, Catalogue, DraftResponse } from "../lib/api-types.ts";
import type { Failure, ProposalFailure } from "../lib/messages.ts";
import type { RememberedSource } from "../lib/session-memory.ts";

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

// ----- Increment 7b ----------------------------------------------------------------------
// The proposal screen (step 2) and the result screen (step 3). As on the mandate screen,
// each outcome is its own state, so the page cannot show something that did not happen.

export type MandateLoad =
  | { readonly kind: "loading" }
  | { readonly kind: "ok"; readonly mandate: ConfirmedMandate }
  | { readonly kind: "not_found" }
  | { readonly kind: "error" };

// The simulated shop: building a cart only reads and returns text.
export type SimulatedState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly failure: ProposalFailure };

// The AI agent. "answered" keeps what the agent said alongside the cart it proposed;
// "declined" is an answer too, not an error.
export type AgentState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly failure: ProposalFailure }
  | { readonly kind: "answered"; readonly modeNote: string; readonly rationale: string }
  | { readonly kind: "declined"; readonly modeNote: string; readonly rationale: string; readonly reason: string };

// The cart on the table, with the source it came from. Building another replaces it.
export type CartState =
  | { readonly kind: "none" }
  | { readonly kind: "ready"; readonly source: RememberedSource["source"]; readonly label: string; readonly proposal: PurchaseProposal };

// What "Check cart and authorize" or "Check cart and settle" did.
export type RunState =
  | { readonly kind: "idle" }
  | { readonly kind: "running"; readonly settleNow: boolean }
  // The API refused. A refusal means the request did nothing.
  | { readonly kind: "refused"; readonly message: string }
  | { readonly kind: "in_use"; readonly byAttemptId: string }
  // No clear answer: the request may have reached PayPal Sandbox. The page keeps the
  // attempt id and the exact request, so it can read the attempt or send the same
  // request again, and only when the person chooses.
  | {
      readonly kind: "uncertain";
      readonly request: AttemptRequest;
      readonly source: RememberedSource;
      readonly detail: string;
      readonly check: "idle" | "checking" | "missing" | "could_not_check";
    };

export type AttemptLoad =
  | { readonly kind: "loading" }
  | { readonly kind: "ok"; readonly envelope: AttemptEnvelope }
  | { readonly kind: "not_found" }
  | { readonly kind: "error" };
