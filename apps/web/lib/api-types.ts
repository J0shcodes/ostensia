import type { MandateDraft, MandateTerms, PurchaseProposal } from "@ostensia/domain";

// The shapes of the API responses this page reads, copied from the routes that send
// them. The domain's own types and schemas are used wherever the domain defines the
// shape (a confirmed mandate, a draft, mandate terms). What follows is only what lives
// in apps/api and so cannot be imported (the web app never imports from apps/api).
// The server stays authoritative: nothing here is a rule, only a description.

// GET /catalogue (apps/api/src/routes/simulation.ts). A synthetic shop (D-012).
export type CatalogueProduct = {
  readonly productId: string;
  readonly name: string;
  readonly unitPriceMinor: number;
  readonly variantIds: readonly string[];
};
export type Catalogue = {
  readonly label: string;
  readonly products: readonly CatalogueProduct[];
};

// POST /mandates/draft (apps/api/src/routes/draft.ts). The draft is the AI's; the
// completeness check and the warnings come from deterministic code (D-024).
export type DraftCompleteness =
  | {
      readonly status: "complete";
      readonly terms: MandateTerms;
      readonly missing: readonly string[];
      readonly problems: readonly string[];
    }
  | {
      readonly status: "incomplete";
      readonly missing: readonly string[];
      readonly problems: readonly string[];
    };

export type DraftResponse = {
  readonly label: string;
  readonly draft: MandateDraft;
  readonly completeness: DraftCompleteness;
  readonly warnings: readonly string[];
};

// ---------------------------------------------------------------------------------------
// Increment 7b: proposals and purchase attempts.
//
// The three lists below are copied from the API (they live in apps/api and cannot be
// imported). api-drift.test.ts reads the API's source and fails if a list changes there
// and not here, so a copy cannot drift without a test noticing.
// ---------------------------------------------------------------------------------------

// apps/api/src/simulation/scenarios.ts
export const SCENARIOS = [
  "compliant",
  "over_unit_price",
  "over_quantity",
  "wrong_variant",
  "unlisted_product",
  "over_total",
] as const;
export type Scenario = (typeof SCENARIOS)[number];

// apps/api/src/ai/shopper-prompt.ts
export const SHOP_MODES = ["informed", "uninformed"] as const;
export type ShopMode = (typeof SHOP_MODES)[number];

// apps/api/src/gate/state.ts (AttemptStatus). Every status the gate can put an attempt in.
export const ATTEMPT_STATUSES = [
  "started",
  "prechecked",
  "blocked_precheck",
  "integrity_failed",
  "abandoned",
  "creating",
  "create_rejected",
  "create_unknown",
  "anomaly",
  "authorized",
  "writing",
  "captured",
  "capture_pending",
  "voided",
  "write_refused",
  "write_rejected",
  "write_unknown",
  "no_action",
  "conflict",
] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

// POST /mandates/:id/simulated-proposal. Everything in it is simulated (D-012).
export type SimulatedProposalResponse = {
  readonly label: string;
  readonly scenario: Scenario;
  readonly proposal: PurchaseProposal;
};

// POST /mandates/:id/agent-proposal. The cart is the AI's proposal; nothing here decides
// whether it is allowed (D-025).
export type AgentProposalResponse = {
  readonly label: string;
  readonly mode: ShopMode;
  readonly modeNote: string;
  readonly proposal: PurchaseProposal | null;
  readonly declinedReason: string | null;
  readonly rationale: string;
};

// A decision as the page needs it. The words come from the API (the domain's own
// explanations), so only the outcome and the total are read here.
export type DecisionSummary =
  | { readonly decision: "allow"; readonly computedTotalMinor: number }
  | { readonly decision: "block" };

// What PayPal reported about an authorization (apps/api/src/gate/events.ts).
export type AuthorizationFacts = {
  readonly state: string;
  readonly statusRaw: string;
  readonly amountMinor: number | null;
  readonly currency: string;
};

// One purchase attempt, as GET /attempts/:id and the settle routes send it.
export type Attempt = {
  readonly attemptId: string;
  readonly mandateId: string;
  readonly proposal: PurchaseProposal;
  readonly status: AttemptStatus;
  readonly precheck: DecisionSummary | null;
  readonly finalDecision: DecisionSummary | null;
  readonly orderId: string | null;
  readonly authorizationId: string | null;
  readonly authorization: AuthorizationFacts | null;
  readonly captureId: string | null;
  readonly startedAt: string;
  readonly updatedAt: string;
};

// The audit events of an attempt, as much of each as the page shows: the audit record
// (guidelines section 13) and the check that says whether PayPal was called. Every field
// beyond the first three is present only on the kinds of event that carry it
// (apps/api/src/gate/events.ts), and none of them is a secret or a raw response.
export type AttemptEventSummary = {
  readonly type: string;
  readonly outcome: string | null;
  readonly detail: string | null;
  // When the gate wrote the event (UTC, ISO 8601).
  readonly at?: string;
  // write_requested and write_result.
  readonly action?: "capture" | "void";
  // precheck_decided, final_decided and integrity_failed: the outcome only; the words come
  // from the API's explanation.
  readonly decision?: "allow" | "block";
  readonly orderId?: string | null;
  readonly authorizationId?: string | null;
  readonly captureId?: string | null;
  // no_action and reconciled.
  readonly authorizationState?: string;
  // authorization_read.
  readonly authorization?: {
    readonly statusRaw: string;
    readonly amountMinor: number | null;
    readonly customId: string | null;
  };
  // reconciled: captured, voided, conflict or unchanged.
  readonly result?: string;
};

export type AttemptEnvelope = {
  readonly attempt: Attempt;
  readonly explanation: {
    readonly precheck: readonly string[] | null;
    readonly final: readonly string[] | null;
  };
  // Only GET /attempts/:id sends events.
  readonly events: readonly AttemptEventSummary[] | null;
};

export type ReconcileOutcome = "captured" | "voided" | "conflict" | "unchanged" | "not_applicable";
export type ReconcileEnvelope = AttemptEnvelope & { readonly outcome: ReconcileOutcome };

// GET /attempts: every attempt the gate knows, without events.
export type AttemptList = { readonly attempts: readonly Attempt[] };
