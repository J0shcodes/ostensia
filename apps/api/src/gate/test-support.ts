// Shared test helpers for the gate tests. Not production code.
//
// The stub adapter behaves like the E-1 sandbox: an authorization starts
// CREATED, a capture makes it CAPTURED, a void makes it VOIDED, and a write on a
// settled authorization is refused with the issue E-1 recorded. All ids and
// values are synthetic (D-011).
import type { AuthorizationState, ConfirmedMandate, PurchaseProposal } from "@ostensia/domain";
import type {
  AuthorizationSnapshot,
  NotSent,
  OrderSnapshot,
  PayPalAdapter,
  Rejected,
  Unknown,
  UnknownReason,
} from "../paypal/adapter.ts";
import { createMemoryAuditLog } from "./audit-log.ts";
import type { AuditLog } from "./audit-log.ts";
import type { AuditEvent } from "./events.ts";
import { createGate } from "./gate.ts";
import type { Gate } from "./gate.ts";

export const T0 = new Date("2026-11-02T12:00:00.000Z");

export const TERMS = {
  currency: "USD",
  maxTotalMinor: 20000,
  expiresAt: "2026-11-03T00:00:00.000Z",
  items: [{ productId: "jacket", maxQuantity: 2, maxUnitPriceMinor: 8000 }],
};

export function proposalFor(mandateId: string, overrides: Partial<PurchaseProposal> = {}): PurchaseProposal {
  return {
    mandateId,
    currency: "USD",
    declaredTotalMinor: 7200,
    lines: [{ productId: "jacket", quantity: 1, unitPriceMinor: 7200 }],
    ...overrides,
  };
}

// ----- Results the stub can be told to return -----

export const rejected = (status = 422): Rejected => ({
  kind: "rejected",
  error: { status, errorName: "SYNTHETIC", issues: ["SYNTHETIC_ISSUE"], debugId: null },
});
export const unknown = (reason: UnknownReason = "timeout"): Unknown => ({ kind: "unknown", reason, status: null, debugId: null });
export const notSent = (): NotSent => ({ kind: "not_sent", reason: "token_unavailable", tokenFailure: "unavailable" });

// ----- The stub adapter -----

export type StubAuthorization = {
  state: AuthorizationState;
  amountMinor: number | null;
  currency: string;
  customId: string | null;
  orderId: string;
  captureId: string | null;
};

export type CallRecord = { readonly name: string; readonly input: unknown };

export type Stub = {
  readonly adapter: PayPalAdapter;
  readonly calls: CallRecord[];
  readonly authorizations: Map<string, StubAuthorization>;
  count(name: string): number;
  names(): string[];
};

function snapshotOf(id: string, auth: StubAuthorization): AuthorizationSnapshot {
  return {
    id,
    statusRaw: auth.state.toUpperCase(),
    state: auth.state,
    amountMinor: auth.amountMinor,
    currency: auth.currency,
    customId: auth.customId,
    expirationTime: "2026-12-01T12:29:15Z",
    createTime: "2026-11-02T12:29:15Z",
    orderId: auth.orderId,
  };
}

export function createStub(overrides: Partial<PayPalAdapter> = {}): Stub {
  const calls: CallRecord[] = [];
  const authorizations = new Map<string, StubAuthorization>();

  const defaults: PayPalAdapter = {
    async checkVault() {
      return { kind: "ok" };
    },
    async createVaultOrder(input) {
      const authorizationId = `AUTH-${input.attemptId}`;
      const orderId = `ORDER-${input.attemptId}`;
      authorizations.set(authorizationId, {
        state: "created",
        amountMinor: input.amountMinor,
        currency: "USD",
        customId: input.mandateHash,
        orderId,
        captureId: null,
      });
      const order: OrderSnapshot = {
        orderId,
        statusRaw: "COMPLETED",
        state: "completed",
        authorizations: [{ id: authorizationId, statusRaw: "CREATED", state: "created" }],
        captures: [],
      };
      return { kind: "created", order, authorizationId };
    },
    async getOrder(orderId) {
      const entry = [...authorizations.entries()].find(([, auth]) => auth.orderId === orderId);
      if (entry === undefined) return { kind: "not_found" };
      const [id, auth] = entry;
      return {
        kind: "ok",
        order: {
          orderId,
          statusRaw: "COMPLETED",
          state: "completed",
          authorizations: [{ id, statusRaw: auth.state.toUpperCase(), state: auth.state }],
          captures:
            auth.captureId === null ? [] : [{ id: auth.captureId, statusRaw: "COMPLETED", state: "completed" }],
        },
      };
    },
    async getAuthorization(authorizationId) {
      const auth = authorizations.get(authorizationId);
      return auth === undefined ? { kind: "not_found" } : { kind: "ok", authorization: snapshotOf(authorizationId, auth) };
    },
    async captureAuthorization({ authorizationId }) {
      const auth = authorizations.get(authorizationId);
      if (auth === undefined) return rejected(404);
      if (auth.state === "captured") return { kind: "already_terminal", issue: "PREVIOUSLY_CAPTURED", status: 422, debugId: null };
      if (auth.state === "voided") return { kind: "already_terminal", issue: "AUTHORIZATION_VOIDED", status: 422, debugId: null };
      auth.state = "captured";
      auth.captureId = `CAPTURE-${authorizationId}`;
      return {
        kind: "accepted",
        capture: { captureId: auth.captureId, statusRaw: "COMPLETED", state: "completed", amountMinor: auth.amountMinor, currency: "USD" },
      };
    },
    async voidAuthorization({ authorizationId }) {
      const auth = authorizations.get(authorizationId);
      if (auth === undefined) return rejected(404);
      if (auth.state === "captured") return { kind: "already_terminal", issue: "PREVIOUSLY_CAPTURED", status: 422, debugId: null };
      if (auth.state === "voided") return { kind: "already_terminal", issue: "AUTHORIZATION_VOIDED", status: 422, debugId: null };
      auth.state = "voided";
      return { kind: "voided" };
    },
  };

  // Calls are recorded around the merged methods, so an override is recorded
  // exactly like a default.
  const merged = { ...defaults, ...overrides };
  const record = <A, R>(name: string, method: (input: A) => Promise<R>) => (input: A): Promise<R> => {
    calls.push({ name, input });
    return method(input);
  };
  const adapter: PayPalAdapter = {
    checkVault: record("checkVault", () => merged.checkVault()) as PayPalAdapter["checkVault"],
    createVaultOrder: record("createVaultOrder", merged.createVaultOrder),
    getOrder: record("getOrder", merged.getOrder),
    getAuthorization: record("getAuthorization", merged.getAuthorization),
    captureAuthorization: record("captureAuthorization", merged.captureAuthorization),
    voidAuthorization: record("voidAuthorization", merged.voidAuthorization),
  };

  return {
    adapter,
    calls,
    authorizations,
    count: (name) => calls.filter((call) => call.name === name).length,
    names: () => calls.map((call) => call.name),
  };
}

// ----- A gate over a stub and a memory audit log -----

export type Context = {
  readonly stub: Stub;
  readonly audit: AuditLog & { readonly events: AuditEvent[] };
  gate: Gate;
  setNow(date: Date): void;
  // A new gate over the same log and the same stub, as after a restart.
  restart(): Promise<Gate>;
};

export async function setupGate(
  options: { adapter?: Partial<PayPalAdapter>; initialEvents?: readonly AuditEvent[]; audit?: AuditLog } = {},
): Promise<Context> {
  const stub = createStub(options.adapter);
  const memory = createMemoryAuditLog(options.initialEvents);
  const audit = options.audit ?? memory;
  let current = T0;
  let counter = 0;
  const build = () =>
    createGate({ adapter: stub.adapter, audit, now: () => new Date(current), newId: () => `m-${++counter}` });

  const context: Context = {
    stub,
    audit: memory,
    gate: await build(),
    setNow: (date) => {
      current = date;
    },
    restart: async () => {
      context.gate = await build();
      return context.gate;
    },
  };
  return context;
}

export async function confirmMandate(context: Context, terms: unknown = TERMS): Promise<ConfirmedMandate> {
  const result = await context.gate.createMandate({ terms, intentSummary: "A jacket, up to $200" });
  if (result.kind !== "ok") throw new Error(`expected a mandate, got a refusal: ${result.reason}`);
  return result.mandate;
}

export function inputFor(mandate: ConfirmedMandate, attemptId = "a-1", proposal: Partial<PurchaseProposal> = {}) {
  return { attemptId, mandateId: mandate.id, proposal: proposalFor(mandate.id, proposal) };
}

export const eventTypes = (context: Context) => context.audit.events.map((event) => event.type);
