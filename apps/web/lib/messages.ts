import type { ApiResult } from "./api.ts";
import type { DraftResponse, Scenario } from "./api-types.ts";

// Words the interface says. The strings marked "approved" are the ones in
// docs/design/OSTENSIA_BRAND_GUIDELINES.md (sections 5, 8 and 10), and a test checks
// that they match it word for word. Change them there first.

// Approved.
export const DISCLOSURE = "Sandbox demo · simulated shop · Ostensia acts as the merchant.";
export const PAGE_INTRO =
  "Set exactly what an AI shopping agent may buy. Ostensia checks every cart against these terms before any payment is captured.";
export const AI_DRAFT_NOTE = "AI suggests terms; you review and confirm them. AI never approves a purchase.";
export const AI_OFF_NOTICE =
  "AI drafting is off because no Anthropic key is configured. You can fill in the terms yourself.";
export const API_AVAILABLE = "Ostensia API available";
export const API_UNREACHABLE = "Ostensia API unreachable";
export const REFERENCE_NOTE =
  "Ostensia stores this reference with the mandate so that later records can be traced back to these exact terms. It is application-level traceability. It is not proof of who approved the mandate, of their consent, or of any authorization.";

// The API's limit on a description (apps/api/src/routes/draft.ts). The server enforces
// it; this only sets the counter and the field's maxLength.
export const MAX_INSTRUCTION_LENGTH = 2000;

// Placeholders: an example of a valid value, shown only while a field is empty (guidelines
// sections 6 and 10, a test compares each with the document). They are never a default and
// never the only instruction: every field keeps its label. Text fields start "Example:",
// number fields "e.g.". The expiry has none, because a date-time control cannot show one.
export const PLACEHOLDERS = {
  instruction: "Example: Buy up to two matte sticker packs, with a maximum total of $5.",
  agentTask: "Example: A small gift for a colleague, under $20.",
  intentSummary: "Example: Two matte sticker packs for my laptop.",
  maxTotal: "e.g. 5.00",
  maxQuantity: "e.g. 2",
  maxUnitPrice: "e.g. 1.50",
} as const;

export type Failure = { readonly tone: "off" | "error"; readonly text: string };

const SAFE_CODE = /^[a-z][a-z0-9_]{0,40}$/;

function codeNote(code: unknown): string {
  return typeof code === "string" && SAFE_CODE.test(code) ? ` (${code})` : "";
}

const TRY_AGAIN_OR_MANUAL = "Try again, or fill in the terms yourself.";

type NotOk<T> = Exclude<ApiResult<T>, { kind: "ok" }>;

export function describeUnreachable(reason: "network" | "timeout" | "non_json"): string {
  return reason === "timeout"
    ? "The request took too long and was stopped."
    : "Ostensia could not reach its API, or the request took longer than the page allows.";
}

// Why drafting did not give a draft. Drafting only reads and returns text, so "nothing
// was created" is always true here.
export function describeDraftFailure(result: NotOk<DraftResponse>): Failure {
  if (result.kind === "unreachable") {
    return {
      tone: "error",
      text: `${describeUnreachable(result.reason)} Nothing was created. Check that the API is running, then ${TRY_AGAIN_OR_MANUAL.toLowerCase()}`,
    };
  }
  if (result.kind === "unexpected") {
    return { tone: "error", text: "The Ostensia API sent a response this page does not understand. Nothing was created." };
  }

  const reason = result.body["reason"];
  switch (result.error) {
    case "drafting_unavailable":
      switch (reason) {
        case "not_configured":
          return { tone: "off", text: AI_OFF_NOTICE };
        case "auth":
          return { tone: "error", text: `The AI service rejected the key set for the Ostensia API (auth), so drafting is unavailable. You can fill in the terms yourself.` };
        case "rate_limited":
          return { tone: "error", text: `The AI service is limiting requests right now (rate_limited). Wait a little, then ${TRY_AGAIN_OR_MANUAL.toLowerCase()}` };
        case "timeout":
          return { tone: "error", text: `The AI service took too long to answer (timeout). ${TRY_AGAIN_OR_MANUAL}` };
        case "connection":
          return { tone: "error", text: `Ostensia could not reach the AI service (connection). ${TRY_AGAIN_OR_MANUAL}` };
        default:
          return { tone: "error", text: `The AI service is unavailable${codeNote(reason)}. ${TRY_AGAIN_OR_MANUAL}` };
      }
    case "draft_refused":
      return { tone: "error", text: `The AI declined to draft this description (draft_refused). Try rewording it, or fill in the terms yourself.` };
    case "draft_invalid":
      return { tone: "error", text: `The AI's answer could not be used (draft_invalid). ${TRY_AGAIN_OR_MANUAL}` };
    case "invalid_request":
      return { tone: "error", text: "The description was not accepted. Use between 1 and 2,000 characters." };
    default:
      return { tone: "error", text: `Ostensia returned an error${codeNote(result.error)}. Nothing was created.` };
  }
}

// The API's refusal codes for creating a mandate, in plain words. Used for a refusal
// the API sent (a 4xx) and inside the "could not confirm" message for a 5xx.
export function describeApiError(error: string): string {
  switch (error) {
    case "invalid_mandate":
      return "Ostensia rejected these terms (invalid_mandate). Check each field.";
    case "invalid_request":
      return "Ostensia could not read the request (invalid_request).";
    case "gate_faulted":
      return "The Ostensia gate has stopped itself after an internal error and refuses new work (gate_faulted). Restart the API.";
    case "payload_too_large":
      return "The request was too large (payload_too_large).";
    case "internal_error":
      return "The Ostensia API had an internal error (internal_error).";
    default:
      return `Ostensia returned an error${codeNote(error)}.`;
  }
}

// The completeness check and the draft warnings name fields the way the API does
// ("items[0].maxQuantity"). A person reads "Item 1 maximum quantity".
const DRAFT_FIELD_NAMES: Readonly<Record<string, string>> = {
  currency: "currency",
  maxTotalMinor: "maximum total",
  expiresAt: "expiry",
  intentSummary: "summary",
  productId: "product",
  allowedVariantIds: "variants",
  maxQuantity: "maximum quantity",
  maxUnitPriceMinor: "maximum unit price",
};

export function humanizeDraftText(text: string): string {
  let out = text.replace(/items\[([0-9]+)\]/g, (_match, index: string) => `Item ${Number(index) + 1}`);
  out = out.replace(/\.([A-Za-z]+)/g, (match, name: string) => {
    const readable = DRAFT_FIELD_NAMES[name];
    return readable === undefined ? match : ` ${readable}`;
  });
  out = out.replace(/\b[A-Za-z]+\b/g, (word) => DRAFT_FIELD_NAMES[word] ?? word);
  return out.charAt(0).toUpperCase() + out.slice(1);
}

// What a missing-field path from the completeness check means.
export function describeMissingField(path: string): string {
  return path === "items" ? "At least one item" : humanizeDraftText(path);
}

// When a confirmation did not come back clearly, the mandate may or may not exist.
export const CONFIRM_UNCERTAIN =
  "Ostensia could not confirm whether the mandate was created. It is not known to have failed.";

// ----- Increment 7b ----------------------------------------------------------------------
// Approved: guidelines section 12 (a test compares each with the document).
export const PROPOSAL_TITLE = "Propose a purchase";
export const PROPOSAL_INTRO =
  "Choose a cart for an AI shopping agent to propose, or build one from the simulated shop. Ostensia checks it against your mandate before anything is authorised.";
export const AGENT_NOTE = "The AI proposes a cart. It never approves a purchase.";
export const AGENT_OFF_NOTICE =
  "The AI agent is off because no Anthropic key is configured. You can use the simulated shop instead.";
export const AGENT_MODE_INFORMED = "Show the agent the mandate's limits";
export const AGENT_MODE_UNINFORMED = "Do not show the agent the limits";
export const AUTHORIZE_HELP =
  "Ostensia checks the cart. If it passes, PayPal Sandbox puts the funds on hold. Nothing is captured until you settle.";
export const SETTLE_HELP = "The same check, then Ostensia captures or voids straight away.";
export const NOT_SENT_TO_PAYPAL = "Nothing was sent to PayPal.";
export const SOURCE_NOT_RECORDED = "Ostensia's audit log does not record where a cart came from.";
export const ATTEMPT_UNCERTAIN =
  "Ostensia could not confirm what happened. The request may have reached PayPal Sandbox. Nothing will be sent again unless you choose.";
export const ATTEMPT_MISSING = "No attempt with this id exists. Nothing was sent.";
// Not in the guidelines: used when an order was never sent (no token, or nothing payable),
// so the payment panel carries no PayPal Sandbox treatment.
export const NO_ORDER_SENT = "No order was sent to PayPal Sandbox.";
export const REVOKE_WARNING =
  "Revoke this mandate? This cannot be undone. Any further purchase will be blocked. A payment already on hold is voided only when you settle it.";

export const LABELS = {
  continueToProposal: "Continue to proposal",
  buildSimulated: "Build simulated cart",
  askAgent: "Ask the AI agent for a cart",
  authorize: "Check cart and authorize",
  settleNow: "Check cart and settle",
  settle: "Settle this authorization",
  revoke: "Revoke mandate",
  keep: "Keep mandate",
  reconcile: "Check PayPal's record",
  checkStatus: "Check status",
  tryAgain: "Try again",
} as const;

export const BUSY = {
  building: "Building…",
  asking: "Asking…",
  checking: "Checking…",
  settling: "Settling…",
  revoking: "Revoking…",
  checkingStatus: "Checking status…",
} as const;

// One line for each scenario, in the order the API lists them (guidelines section 12.2).
export const SCENARIO_TEXT: Readonly<Record<Scenario, { readonly name: string; readonly line: string }>> = {
  compliant: { name: "Compliant", line: "One unit of the first product on the mandate that fits its limits." },
  over_unit_price: { name: "Over unit price", line: "A product priced above the mandate's unit-price limit." },
  over_quantity: { name: "Over quantity", line: "More units than the mandate allows." },
  wrong_variant: { name: "Wrong variant", line: "A variant the mandate does not allow." },
  unlisted_product: { name: "Unlisted product", line: "A product that is not on the mandate." },
  over_total: { name: "Over total", line: "Every line within its limits, but the total above the mandate's limit." },
};

// A message for a proposal that did not arrive. Building a cart only reads and returns
// text, so "nothing was sent to PayPal" is always true here.
export type ProposalFailure = { readonly tone: "off" | "neutral" | "error"; readonly text: string };

const PROPOSAL_NOTHING_SENT = "Nothing was sent to PayPal.";

function describeProposalCommon(result: NotOk<unknown>): ProposalFailure | null {
  if (result.kind === "unreachable") {
    return {
      tone: "error",
      text: `${describeUnreachable(result.reason)} ${PROPOSAL_NOTHING_SENT} Check that the API is running, then try again.`,
    };
  }
  if (result.kind === "unexpected") {
    return { tone: "error", text: `The Ostensia API sent a response this page does not understand. ${PROPOSAL_NOTHING_SENT}` };
  }
  if (result.error === "mandate_not_found") return { tone: "error", text: "Ostensia does not know this mandate (mandate_not_found)." };
  if (result.error === "invalid_request") return { tone: "error", text: "Ostensia could not read the request (invalid_request)." };
  return null;
}

export function describeSimulatedFailure(result: NotOk<unknown>): ProposalFailure {
  const common = describeProposalCommon(result);
  if (common !== null) return common;
  if (result.kind === "api_error" && result.error === "scenario_not_buildable") {
    const reason = result.body["reason"];
    return {
      tone: "neutral",
      text: typeof reason === "string" && reason !== "" ? reason : "This scenario cannot be built from this mandate.",
    };
  }
  return { tone: "error", text: `Ostensia returned an error${codeNote(result.kind === "api_error" ? result.error : undefined)}. ${PROPOSAL_NOTHING_SENT}` };
}

export function describeAgentFailure(result: NotOk<unknown>): ProposalFailure {
  const common = describeProposalCommon(result);
  if (common !== null) return common;
  if (result.kind !== "api_error") return { tone: "error", text: "The AI agent did not answer." };
  const reason = result.body["reason"];
  switch (result.error) {
    case "agent_unavailable":
      switch (reason) {
        case "not_configured":
          return { tone: "off", text: AGENT_OFF_NOTICE };
        case "auth":
          return { tone: "error", text: "The AI service rejected the key set for the Ostensia API (auth), so the agent is unavailable. You can use the simulated shop instead." };
        case "rate_limited":
          return { tone: "error", text: "The AI service is limiting requests right now (rate_limited). Wait a little, then try again." };
        case "timeout":
          return { tone: "error", text: "The AI service took too long to answer (timeout). Try again, or use the simulated shop." };
        case "connection":
          return { tone: "error", text: "Ostensia could not reach the AI service (connection). Try again, or use the simulated shop." };
        default:
          return { tone: "error", text: `The AI service is unavailable${codeNote(reason)}. Try again, or use the simulated shop.` };
      }
    case "agent_refused":
      return { tone: "error", text: "The AI declined to propose a cart (agent_refused). Try a different task, or use the simulated shop." };
    case "agent_invalid":
      return { tone: "error", text: "The AI's cart could not be used (agent_invalid). Try again, or use the simulated shop." };
    default:
      return { tone: "error", text: `Ostensia returned an error${codeNote(result.error)}. ${PROPOSAL_NOTHING_SENT}` };
  }
}

// The API refusing a request about an attempt (a 4xx or the stopped gate). A refusal
// means the request did nothing.
export function describeAttemptRefusal(error: string): string {
  switch (error) {
    case "invalid_attempt_id":
      return "Ostensia did not accept the attempt id (invalid_attempt_id). Nothing was sent.";
    case "invalid_proposal":
      return "Ostensia did not accept this cart (invalid_proposal). Nothing was sent.";
    case "invalid_mandate":
      return "Ostensia did not accept this mandate (invalid_mandate). Nothing was sent.";
    case "mandate_not_found":
      return "Ostensia does not know this mandate (mandate_not_found). Nothing was sent.";
    case "attempt_not_found":
      return "Ostensia does not know this attempt (attempt_not_found).";
    case "attempt_id_reused":
      return "This attempt id was already used for a different cart (attempt_id_reused). Nothing was sent.";
    case "mandate_in_use":
      return "This mandate is already in use by another attempt (mandate_in_use). Nothing was sent.";
    case "invalid_request":
      return "Ostensia could not read the request (invalid_request). Nothing was sent.";
    case "gate_faulted":
      return "The Ostensia gate has stopped itself after an internal error and refuses new work (gate_faulted). Restart the API. Nothing was sent.";
    default:
      return `Ostensia returned an error${codeNote(error)}.`;
  }
}

// What was behind a request about an attempt that did not come back clearly.
export function describeAttemptDetail(
  result: NotOk<unknown>,
): string {
  if (result.kind === "unreachable") return describeUnreachable(result.reason);
  if (result.kind === "unexpected") return "The Ostensia API sent a response this page does not understand.";
  return describeApiError(result.error);
}
