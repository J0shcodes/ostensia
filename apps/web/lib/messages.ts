import type { ApiResult } from "./api.ts";
import type { DraftResponse } from "./api-types.ts";

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
