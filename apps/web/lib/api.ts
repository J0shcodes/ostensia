import { ConfirmedMandateSchema } from "@ostensia/domain";
import type { ConfirmedMandate, MandateDraft, MandateTerms } from "@ostensia/domain";
import type { Catalogue, CatalogueProduct, DraftCompleteness, DraftResponse } from "./api-types.ts";

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

export type ApiClient = {
  getHealth(): Promise<ApiResult<{ readonly status: "ok" }>>;
  getCatalogue(): Promise<ApiResult<Catalogue>>;
  draftMandate(instruction: string): Promise<ApiResult<DraftResponse>>;
  createMandate(terms: MandateTerms, intentSummary: string): Promise<ApiResult<{ readonly mandate: ConfirmedMandate }>>;
  listMandates(): Promise<ApiResult<{ readonly mandates: ConfirmedMandate[] }>>;
};

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
  };
}
