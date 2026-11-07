import { ConfirmedMandateSchema } from "@ostensia/domain";
import type { ConfirmedMandate, MandateDraft, MandateTerms, PurchaseLine, PurchaseProposal } from "@ostensia/domain";
import { ATTEMPT_STATUSES, SCENARIOS, SHOP_MODES } from "./api-types.ts";
import type {
  AgentProposalResponse,
  Attempt,
  AttemptEnvelope,
  AttemptEventSummary,
  AttemptList,
  AttemptStatus,
  AuthorizationFacts,
  Catalogue,
  CatalogueProduct,
  DecisionSummary,
  DraftCompleteness,
  DraftResponse,
  ReconcileEnvelope,
  ReconcileOutcome,
  Scenario,
  ShopMode,
  SimulatedProposalResponse,
} from "./api-types.ts";

// The only place this app calls fetch. Every request goes to this app's own origin under
// /api, and Next.js forwards it to the Ostensia API (D-027). Nothing here knows where
// the API is, and nothing is ever retried: a request that did not come back is not
// known to have failed (CLAUDE.md section 7), so the caller decides what to do.

const API_BASE = "/api";

// Longer than the 120 second proxy timeout in next.config.ts, so the proxy answers
// first and this only stops a request that nothing is answering.
const DEFAULT_TIMEOUT_MS = 150_000;

export type ApiResult<T> =
  // A 2xx answer whose body has the expected shape.
  | { readonly kind: "ok"; readonly status: number; readonly body: T }
  // The Ostensia API answered with an error. Fastify answers every error as JSON with
  // an `error` code (apps/api/src/server.ts), so this is the API speaking.
  | {
      readonly kind: "api_error";
      readonly status: number;
      readonly error: string;
      readonly body: Readonly<Record<string, unknown>>;
    }
  // Nothing usable came back from the API. Either the request never got an answer
  // (network, timeout), or the Next.js proxy gave up and answered a plain-text 5xx
  // (the API is down or took longer than the proxy allows). The two look the same from
  // here, and in neither case is it known whether the API acted.
  | { readonly kind: "unreachable"; readonly reason: "network" | "timeout" | "non_json" }
  // An answer arrived, but not one this page understands.
  | { readonly kind: "unexpected"; readonly status: number };

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function parseHealth(body: unknown): { readonly status: "ok" } | null {
  return isRecord(body) && body["status"] === "ok" ? { status: "ok" } : null;
}

function parseCatalogue(body: unknown): Catalogue | null {
  if (!isRecord(body) || body["simulated"] !== true || typeof body["label"] !== "string") return null;
  const raw = body["products"];
  if (!Array.isArray(raw)) return null;
  const products: CatalogueProduct[] = [];
  for (const entry of raw) {
    if (
      !isRecord(entry) ||
      typeof entry["productId"] !== "string" ||
      typeof entry["name"] !== "string" ||
      typeof entry["unitPriceMinor"] !== "number" ||
      !isStringArray(entry["variantIds"])
    ) {
      return null;
    }
    products.push({
      productId: entry["productId"],
      name: entry["name"],
      unitPriceMinor: entry["unitPriceMinor"],
      variantIds: entry["variantIds"],
    });
  }
  return { label: body["label"], products };
}

function isDraft(value: unknown): value is MandateDraft {
  if (!isRecord(value)) return false;
  if (typeof value["intentSummary"] !== "string") return false;
  if (value["currency"] !== null && value["currency"] !== "USD") return false;
  if (!isNullableNumber(value["maxTotalMinor"]) || !isNullableString(value["expiresAt"])) return false;
  if (!isStringArray(value["notes"])) return false;
  const items = value["items"];
  if (!Array.isArray(items)) return false;
  return items.every(
    (item) =>
      isRecord(item) &&
      isNullableString(item["productId"]) &&
      isNullableNumber(item["maxQuantity"]) &&
      isNullableNumber(item["maxUnitPriceMinor"]) &&
      (item["allowedVariantIds"] === undefined || isStringArray(item["allowedVariantIds"])),
  );
}

function parseCompleteness(value: unknown): DraftCompleteness | null {
  if (!isRecord(value) || !isStringArray(value["missing"]) || !isStringArray(value["problems"])) return null;
  if (value["status"] === "incomplete") {
    return { status: "incomplete", missing: value["missing"], problems: value["problems"] };
  }
  if (value["status"] === "complete" && isRecord(value["terms"])) {
    // The terms are only shown to the person, who edits and confirms them; the gate
    // validates what is posted. They are typed here as the domain's terms because that
    // is what the route sends (completeDraft validates them with the same schema).
    return {
      status: "complete",
      terms: value["terms"] as MandateTerms,
      missing: value["missing"],
      problems: value["problems"],
    };
  }
  return null;
}

function parseDraftResponse(body: unknown): DraftResponse | null {
  if (!isRecord(body) || body["aiGenerated"] !== true || typeof body["label"] !== "string") return null;
  if (!isDraft(body["draft"]) || !isStringArray(body["warnings"])) return null;
  const completeness = parseCompleteness(body["completeness"]);
  if (completeness === null) return null;
  return { label: body["label"], draft: body["draft"], completeness, warnings: body["warnings"] };
}

// The domain's own schema is the exact shape of a confirmed mandate.
function parseMandateEnvelope(body: unknown): { readonly mandate: ConfirmedMandate } | null {
  if (!isRecord(body)) return null;
  const parsed = ConfirmedMandateSchema.safeParse(body["mandate"]);
  return parsed.success ? { mandate: parsed.data } : null;
}

function parseMandateList(body: unknown): { readonly mandates: ConfirmedMandate[] } | null {
  if (!isRecord(body) || !Array.isArray(body["mandates"])) return null;
  const mandates: ConfirmedMandate[] = [];
  for (const entry of body["mandates"]) {
    const parsed = ConfirmedMandateSchema.safeParse(entry);
    if (parsed.success) mandates.push(parsed.data);
  }
  return { mandates };
}

// ----- Increment 7b: proposals and attempts -----------------------------------------------
// Each parser checks the shape the page relies on and returns null for anything else, so
// a response that is not what the API documents is reported as "unexpected" and never
// shown as if it were understood. The words shown to the person (explanations of
// decisions) come from the API; nothing here judges a purchase.

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

function parseLine(value: unknown): PurchaseLine | null {
  if (!isRecord(value)) return null;
  if (typeof value["productId"] !== "string" || !isInteger(value["quantity"]) || !isInteger(value["unitPriceMinor"])) return null;
  const variant = value["variantId"];
  if (variant !== undefined && typeof variant !== "string") return null;
  return {
    productId: value["productId"],
    quantity: value["quantity"],
    unitPriceMinor: value["unitPriceMinor"],
    ...(variant === undefined ? {} : { variantId: variant }),
  };
}

function parseProposal(value: unknown): PurchaseProposal | null {
  if (!isRecord(value) || typeof value["mandateId"] !== "string" || typeof value["currency"] !== "string") return null;
  if (!isInteger(value["declaredTotalMinor"]) || !Array.isArray(value["lines"])) return null;
  const lines: PurchaseLine[] = [];
  for (const entry of value["lines"]) {
    const line = parseLine(entry);
    if (line === null) return null;
    lines.push(line);
  }
  return {
    mandateId: value["mandateId"],
    currency: value["currency"],
    declaredTotalMinor: value["declaredTotalMinor"],
    lines,
  };
}

function parseSimulatedProposal(body: unknown): SimulatedProposalResponse | null {
  if (!isRecord(body) || body["simulated"] !== true || typeof body["label"] !== "string") return null;
  const scenario = body["scenario"];
  if (!isOneOf<Scenario>(SCENARIOS, scenario)) return null;
  const proposal = parseProposal(body["proposal"]);
  return proposal === null ? null : { label: body["label"], scenario, proposal };
}

function parseAgentProposal(body: unknown): AgentProposalResponse | null {
  if (!isRecord(body) || body["aiGenerated"] !== true || typeof body["label"] !== "string") return null;
  const mode = body["mode"];
  if (!isOneOf<ShopMode>(SHOP_MODES, mode) || typeof body["modeNote"] !== "string" || typeof body["rationale"] !== "string") return null;
  const declined = body["declined"];
  const declinedReason = isRecord(declined) && typeof declined["reason"] === "string" ? declined["reason"] : null;
  const proposal = body["proposal"] === null ? null : parseProposal(body["proposal"]);
  if (body["proposal"] !== null && proposal === null) return null;
  // A cart together with a decline, or neither, is not something the route sends.
  if ((proposal === null) === (declinedReason === null)) return null;
  return { label: body["label"], mode, modeNote: body["modeNote"], proposal, declinedReason, rationale: body["rationale"] };
}

// undefined means "not a decision this page understands"; null means "no decision yet".
function parseDecision(value: unknown): DecisionSummary | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  if (value["decision"] === "allow" && isInteger(value["computedTotalMinor"])) {
    return { decision: "allow", computedTotalMinor: value["computedTotalMinor"] };
  }
  if (value["decision"] === "block") return { decision: "block" };
  return undefined;
}

function parseAuthorization(value: unknown): AuthorizationFacts | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || typeof value["state"] !== "string" || typeof value["statusRaw"] !== "string") return undefined;
  if (typeof value["currency"] !== "string" || !isNullableNumber(value["amountMinor"])) return undefined;
  return { state: value["state"], statusRaw: value["statusRaw"], amountMinor: value["amountMinor"], currency: value["currency"] };
}

function parseAttempt(value: unknown): Attempt | null {
  if (!isRecord(value)) return null;
  const status = value["status"];
  if (!isOneOf<AttemptStatus>(ATTEMPT_STATUSES, status)) return null;
  if (typeof value["attemptId"] !== "string" || typeof value["mandateId"] !== "string") return null;
  if (typeof value["startedAt"] !== "string" || typeof value["updatedAt"] !== "string") return null;
  const orderId = value["orderId"];
  const authorizationId = value["authorizationId"];
  const captureId = value["captureId"];
  if (!isNullableString(orderId) || !isNullableString(authorizationId) || !isNullableString(captureId)) return null;
  const proposal = parseProposal(value["proposal"]);
  const precheck = parseDecision(value["precheck"]);
  const finalDecision = parseDecision(value["finalDecision"]);
  const authorization = parseAuthorization(value["authorization"]);
  if (proposal === null || precheck === undefined || finalDecision === undefined || authorization === undefined) return null;
  return {
    attemptId: value["attemptId"],
    mandateId: value["mandateId"],
    proposal,
    status,
    precheck,
    finalDecision,
    orderId,
    authorizationId,
    authorization,
    captureId,
    startedAt: value["startedAt"],
    updatedAt: value["updatedAt"],
  };
}

function parseExplanation(value: unknown): readonly string[] | null | undefined {
  if (value === null) return null;
  return isStringArray(value) ? value : undefined;
}

function parseEventAuthorization(value: unknown): AttemptEventSummary["authorization"] | undefined {
  if (!isRecord(value) || typeof value["statusRaw"] !== "string") return undefined;
  const amount = value["amountMinor"] ?? null;
  const customId = value["customId"] ?? null;
  if (!isNullableNumber(amount) || !isNullableString(customId)) return undefined;
  return { statusRaw: value["statusRaw"], amountMinor: amount, customId };
}

function parseEvent(entry: Record<string, unknown>, type: string): AttemptEventSummary {
  const decision = isRecord(entry["decision"]) ? entry["decision"]["decision"] : undefined;
  const authorization = parseEventAuthorization(entry["authorization"]);
  const action = entry["action"];
  return {
    type,
    outcome: typeof entry["outcome"] === "string" ? entry["outcome"] : null,
    detail: typeof entry["detail"] === "string" ? entry["detail"] : null,
    ...(typeof entry["at"] === "string" ? { at: entry["at"] } : {}),
    ...(action === "capture" || action === "void" ? { action } : {}),
    ...(decision === "allow" || decision === "block" ? { decision } : {}),
    ...(isNullableString(entry["orderId"]) && entry["orderId"] !== undefined ? { orderId: entry["orderId"] } : {}),
    ...(isNullableString(entry["authorizationId"]) && entry["authorizationId"] !== undefined ? { authorizationId: entry["authorizationId"] } : {}),
    ...(isNullableString(entry["captureId"]) && entry["captureId"] !== undefined ? { captureId: entry["captureId"] } : {}),
    ...(typeof entry["authorizationState"] === "string" ? { authorizationState: entry["authorizationState"] } : {}),
    ...(authorization === undefined ? {} : { authorization }),
    ...(typeof entry["result"] === "string" ? { result: entry["result"] } : {}),
  };
}

function parseEvents(value: unknown): AttemptEventSummary[] | null | undefined {
  if (value === undefined) return null;
  if (!Array.isArray(value)) return undefined;
  const events: AttemptEventSummary[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry["type"] !== "string") return undefined;
    events.push(parseEvent(entry, entry["type"]));
  }
  return events;
}

// Exported because a refused settle can still carry the attempt (a 502 "read_failed": the
// authorization could not be read, and nothing was written).
export function parseAttemptEnvelope(body: unknown): AttemptEnvelope | null {
  if (!isRecord(body)) return null;
  const attempt = parseAttempt(body["attempt"]);
  const explanation = body["explanation"];
  if (attempt === null || !isRecord(explanation)) return null;
  const precheck = parseExplanation(explanation["precheck"]);
  const final = parseExplanation(explanation["final"]);
  const events = parseEvents(body["events"]);
  if (precheck === undefined || final === undefined || events === undefined) return null;
  return { attempt, explanation: { precheck, final }, events };
}

function parseAttemptList(body: unknown): AttemptList | null {
  if (!isRecord(body) || !Array.isArray(body["attempts"])) return null;
  const attempts: Attempt[] = [];
  for (const entry of body["attempts"]) {
    const attempt = parseAttempt(entry);
    // One record this page does not understand is reported, not skipped: a list with a
    // hole in it would look like a complete one.
    if (attempt === null) return null;
    attempts.push(attempt);
  }
  return { attempts };
}

const RECONCILE_OUTCOMES: readonly ReconcileOutcome[] = ["captured", "voided", "conflict", "unchanged", "not_applicable"];

function parseReconcile(body: unknown): ReconcileEnvelope | null {
  const envelope = parseAttemptEnvelope(body);
  if (envelope === null || !isRecord(body)) return null;
  const outcome = body["outcome"];
  return isOneOf<ReconcileOutcome>(RECONCILE_OUTCOMES, outcome) ? { ...envelope, outcome } : null;
}

export type AttemptRequest = {
  readonly attemptId: string;
  readonly mandateId: string;
  readonly proposal: PurchaseProposal;
  // false stops after the authorization; true settles straight away.
  readonly settleNow: boolean;
};

export type ApiClient = {
  getHealth(): Promise<ApiResult<{ readonly status: "ok" }>>;
  getCatalogue(): Promise<ApiResult<Catalogue>>;
  draftMandate(instruction: string): Promise<ApiResult<DraftResponse>>;
  createMandate(terms: MandateTerms, intentSummary: string): Promise<ApiResult<{ readonly mandate: ConfirmedMandate }>>;
  listMandates(): Promise<ApiResult<{ readonly mandates: ConfirmedMandate[] }>>;
  getMandate(mandateId: string): Promise<ApiResult<{ readonly mandate: ConfirmedMandate }>>;
  revokeMandate(mandateId: string): Promise<ApiResult<{ readonly mandate: ConfirmedMandate }>>;
  simulatedProposal(mandateId: string, scenario: Scenario): Promise<ApiResult<SimulatedProposalResponse>>;
  agentProposal(mandateId: string, mode: ShopMode, task?: string): Promise<ApiResult<AgentProposalResponse>>;
  createAttempt(request: AttemptRequest): Promise<ApiResult<AttemptEnvelope>>;
  listAttempts(): Promise<ApiResult<AttemptList>>;
  getAttempt(attemptId: string): Promise<ApiResult<AttemptEnvelope>>;
  settleAttempt(attemptId: string): Promise<ApiResult<AttemptEnvelope>>;
  reconcileAttempt(attemptId: string): Promise<ApiResult<ReconcileEnvelope>>;
};

// An id in a path is encoded, so a link with a strange id cannot reach another route.
const seg = (id: string): string => encodeURIComponent(id);

export function createApiClient(options: { readonly fetcher?: Fetcher; readonly timeoutMs?: number } = {}): ApiClient {
  const fetcher: Fetcher = options.fetcher ?? ((input, init) => fetch(input, init));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function call<T>(
    method: "GET" | "POST",
    path: string,
    payload: unknown,
    parse: (body: unknown) => T | null,
  ): Promise<ApiResult<T>> {
    const init: RequestInit = {
      method,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
      ...(payload === undefined
        ? {}
        : { headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }),
    };

    let response: Response;
    try {
      response = await fetcher(`${API_BASE}${path}`, init);
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === "TimeoutError";
      return { kind: "unreachable", reason: timedOut ? "timeout" : "network" };
    }

    let text: string;
    try {
      text = await response.text();
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === "TimeoutError";
      return { kind: "unreachable", reason: timedOut ? "timeout" : "network" };
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      // Fastify never answers anything but JSON. A server error that is not JSON is
      // the proxy giving up (a plain-text 500 when the API is down or too slow).
      return response.status >= 500
        ? { kind: "unreachable", reason: "non_json" }
        : { kind: "unexpected", status: response.status };
    }

    if (response.ok) {
      const body = parse(json);
      return body === null ? { kind: "unexpected", status: response.status } : { kind: "ok", status: response.status, body };
    }
    if (isRecord(json) && typeof json["error"] === "string") {
      return { kind: "api_error", status: response.status, error: json["error"], body: json };
    }
    return { kind: "unexpected", status: response.status };
  }

  return {
    getHealth: () => call("GET", "/health", undefined, parseHealth),
    getCatalogue: () => call("GET", "/catalogue", undefined, parseCatalogue),
    draftMandate: (instruction) => call("POST", "/mandates/draft", { instruction }, parseDraftResponse),
    createMandate: (terms, intentSummary) => call("POST", "/mandates", { terms, intentSummary }, parseMandateEnvelope),
    listMandates: () => call("GET", "/mandates", undefined, parseMandateList),
    getMandate: (mandateId) => call("GET", `/mandates/${seg(mandateId)}`, undefined, parseMandateEnvelope),
    revokeMandate: (mandateId) => call("POST", `/mandates/${seg(mandateId)}/revoke`, undefined, parseMandateEnvelope),
    simulatedProposal: (mandateId, scenario) =>
      call("POST", `/mandates/${seg(mandateId)}/simulated-proposal`, { scenario }, parseSimulatedProposal),
    agentProposal: (mandateId, mode, task) =>
      call(
        "POST",
        `/mandates/${seg(mandateId)}/agent-proposal`,
        task === undefined || task.trim() === "" ? { mode } : { mode, task: task.trim() },
        parseAgentProposal,
      ),
    createAttempt: (request) =>
      call(
        "POST",
        "/attempts",
        {
          attemptId: request.attemptId,
          mandateId: request.mandateId,
          proposal: request.proposal,
          settleNow: request.settleNow,
        },
        parseAttemptEnvelope,
      ),
    listAttempts: () => call("GET", "/attempts", undefined, parseAttemptList),
    getAttempt: (attemptId) => call("GET", `/attempts/${seg(attemptId)}`, undefined, parseAttemptEnvelope),
    settleAttempt: (attemptId) => call("POST", `/attempts/${seg(attemptId)}/settle`, undefined, parseAttemptEnvelope),
    reconcileAttempt: (attemptId) => call("POST", `/attempts/${seg(attemptId)}/reconcile`, undefined, parseReconcile),
  };
}
