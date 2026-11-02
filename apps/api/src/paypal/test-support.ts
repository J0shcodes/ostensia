// Shared test helpers for the PayPal adapter tests. Not production code.
//
// Fixtures follow the SHAPES recorded in E-1 (docs/evidence/paypal-lifecycle)
// with SYNTHETIC values. No field is added that E-1 did not show, and none of
// this is a real PayPal response (D-011).
import type { FetchFn } from "./http.ts";
import { PAYPAL_SANDBOX_BASE_URL } from "./paypal-config.ts";
import type { PayPalConfig } from "./paypal-config.ts";

export const SYNTH = {
  clientId: "synthetic-client-id",
  clientSecret: "synthetic-client-secret-value",
  accessToken: "synthetic-access-token",
  vaultId: "SYNTH-VAULT-1",
  orderId: "SYNTH-ORDER-1",
  authorizationId: "SYNTH-AUTH-1",
  mandateHash: "a".repeat(64),
} as const;

export function testConfig(overrides: Partial<PayPalConfig> = {}): PayPalConfig {
  return {
    baseUrl: PAYPAL_SANDBOX_BASE_URL,
    clientId: SYNTH.clientId,
    clientSecret: SYNTH.clientSecret,
    vaultId: SYNTH.vaultId,
    ...overrides,
  };
}

// ----- Response builders -----

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export function textResponse(status: number, text: string): Response {
  return new Response(text, { status });
}

export function emptyResponse(status: number): Response {
  return new Response(null, { status });
}

export function tokenBody(expiresIn = 32400): unknown {
  return { access_token: SYNTH.accessToken, token_type: "Bearer", expires_in: expiresIn };
}

type OrderAuthorization = { id: string; status: string };

export function orderBody(
  options: { id?: string; status?: string; authorizations?: OrderAuthorization[] } = {},
): unknown {
  const authorizations = options.authorizations ?? [{ id: SYNTH.authorizationId, status: "CREATED" }];
  return {
    id: options.id ?? SYNTH.orderId,
    status: options.status ?? "COMPLETED",
    purchase_units: [
      { reference_id: "attempt-1", payments: authorizations.length > 0 ? { authorizations } : {} },
    ],
  };
}

export function authorizationBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: SYNTH.authorizationId,
    status: "CREATED",
    amount: { currency_code: "USD", value: "72.00" },
    invoice_id: "ostensia-attempt-1",
    custom_id: SYNTH.mandateHash,
    seller_protection: { status: "ELIGIBLE" },
    supplementary_data: { related_ids: { order_id: SYNTH.orderId } },
    expiration_time: "2026-12-01T12:29:15Z",
    create_time: "2026-11-02T12:29:15Z",
    update_time: "2026-11-02T12:29:15Z",
    // Hostile on purpose: the adapter must never follow these.
    links: [{ href: "https://attacker.example.test/steal", rel: "self", method: "GET" }],
    ...overrides,
  };
}

export function errorBody(name: string, issues: string[] = [], message = "synthetic message"): unknown {
  return { name, message, details: issues.map((issue) => ({ issue })), debug_id: "synthetic" };
}

// ----- Fake fetch -----

export type Step = Response | "timeout" | "network";

export type RecordedCall = {
  readonly method: string;
  readonly path: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string | null;
  readonly redirect: string | undefined;
  readonly hasSignal: boolean;
};

export type FakeFetch = {
  readonly fetch: FetchFn;
  readonly calls: RecordedCall[];
  // Requests nobody scripted. Every test asserts this stays empty.
  readonly unscripted: string[];
  on(method: string, path: string, ...steps: Step[]): void;
  callsTo(method: string, path: string): RecordedCall[];
};

export function createFakeFetch(): FakeFetch {
  const queues = new Map<string, Step[]>();
  const calls: RecordedCall[] = [];
  const unscripted: string[] = [];

  const fetchFn: FetchFn = (input, init) => {
    const parsed = new URL(input);
    const method = init.method ?? "GET";
    const key = `${method} ${parsed.pathname}`;
    calls.push({
      method,
      path: parsed.pathname,
      url: input,
      headers: { ...(init.headers as Record<string, string>) },
      body: typeof init.body === "string" ? init.body : null,
      redirect: init.redirect,
      hasSignal: init.signal !== undefined && init.signal !== null,
    });

    const step = queues.get(key)?.shift();
    if (step === undefined) {
      unscripted.push(key);
      return Promise.reject(new TypeError(`unscripted request: ${key}`));
    }
    if (step === "timeout") {
      return Promise.reject(new DOMException("The operation timed out.", "TimeoutError"));
    }
    if (step === "network") return Promise.reject(new TypeError("fetch failed"));
    return Promise.resolve(step);
  };

  return {
    fetch: fetchFn,
    calls,
    unscripted,
    on(method, path, ...steps) {
      const key = `${method} ${path}`;
      queues.set(key, [...(queues.get(key) ?? []), ...steps]);
    },
    callsTo: (method, path) => calls.filter((call) => call.method === method && call.path === path),
  };
}
