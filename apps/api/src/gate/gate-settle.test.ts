import { AUTHORIZATION_STATES, explainDecision } from "@ostensia/domain";
import type { AuthorizationState } from "@ostensia/domain";
import { describe, expect, it } from "vitest";
import type { CaptureResult, VoidResult } from "../paypal/adapter.ts";
import {
  confirmMandate,
  eventTypes,
  inputFor,
  notSent,
  rejected,
  setupGate,
  unknown,
} from "./test-support.ts";
import type { Context } from "./test-support.ts";

const writeCalls = (ctx: Context) => ctx.stub.count("captureAuthorization") + ctx.stub.count("voidAuthorization");

describe("settle: a compliant purchase is captured", () => {
  it("reads the authorization, evaluates again, and sends one capture", async () => {
    const ctx = await setupGate();
    const mandate = await confirmMandate(ctx);
    const result = await ctx.gate.run(inputFor(mandate));

    expect(result).toMatchObject({
      kind: "ok",
      attempt: {
        status: "captured",
        captureId: "CAPTURE-AUTH-a-1",
        intendedAction: "capture",
        finalDecision: { decision: "allow", computedTotalMinor: 7200 },
        authorization: { state: "created", amountMinor: 7200, currency: "USD", customId: mandate.hash },
      },
    });
    expect(ctx.stub.names()).toEqual(["createVaultOrder", "getAuthorization", "captureAuthorization"]);
    expect(ctx.stub.calls[2]?.input).toEqual({ attemptId: "a-1", authorizationId: "AUTH-a-1" });
    expect(ctx.stub.count("voidAuthorization")).toBe(0);
  });

  it("writes the event trail in order, with the request before the result", async () => {
    const ctx = await setupGate();
    const mandate = await confirmMandate(ctx);
    await ctx.gate.run(inputFor(mandate));
    expect(eventTypes(ctx)).toEqual([
      "mandate_created",
      "attempt_started",
      "precheck_decided",
      "order_requested",
      "order_result",
      "authorization_read",
      "final_decided",
      "write_requested",
      "write_result",
    ]);
  });

  it("records the write request before the capture is sent", async () => {
    let lastEventSeenByAdapter = "";
    const ctx = await setupGate({
      adapter: {
        async captureAuthorization(): Promise<CaptureResult> {
          lastEventSeenByAdapter = ctx.audit.events.at(-1)?.type ?? "";
          return { kind: "accepted", capture: { captureId: "C", statusRaw: "COMPLETED", state: "completed", amountMinor: 7200, currency: "USD" } };
        },
      },
    });
    const mandate = await confirmMandate(ctx);
    await ctx.gate.run(inputFor(mandate));
    expect(lastEventSeenByAdapter).toBe("write_requested");
  });

  it("explains the final decision from the stored record", async () => {
    const ctx = await setupGate();
    const mandate = await confirmMandate(ctx);
    const result = await ctx.gate.run(inputFor(mandate));
    const decision = result.kind === "ok" ? result.attempt.finalDecision : null;
    expect(decision && explainDecision(decision)).toEqual(["All purchase rules passed. The total is $72.00."]);
  });
});

describe("settle: repeating and racing", () => {
  it("settling a captured attempt again makes no PayPal call", async () => {
    const ctx = await setupGate();
    const mandate = await confirmMandate(ctx);
    await ctx.gate.run(inputFor(mandate));
    const before = ctx.stub.calls.length;
    expect(await ctx.gate.settle("a-1")).toMatchObject({ kind: "ok", attempt: { status: "captured" } });
    expect(await ctx.gate.run(inputFor(mandate))).toMatchObject({ kind: "ok", attempt: { status: "captured" } });
    expect(ctx.stub.calls).toHaveLength(before);
  });

  it("two settles at once send exactly one capture", async () => {
    const ctx = await setupGate();
    const mandate = await confirmMandate(ctx);
    await ctx.gate.authorize(inputFor(mandate));
    const results = await Promise.all([ctx.gate.settle("a-1"), ctx.gate.settle("a-1"), ctx.gate.settle("a-1")]);
    expect(results.every((result) => result.kind === "ok" && result.attempt.status === "captured")).toBe(true);
    expect(ctx.stub.count("captureAuthorization")).toBe(1);
  });

  it("two runs of the same request at once make one order and one capture", async () => {
    const ctx = await setupGate();
    const mandate = await confirmMandate(ctx);
    await Promise.all([ctx.gate.run(inputFor(mandate)), ctx.gate.run(inputFor(mandate))]);
    expect(ctx.stub.count("createVaultOrder")).toBe(1);
    expect(ctx.stub.count("captureAuthorization")).toBe(1);
  });

  it("refuses an attempt that does not exist", async () => {
    const ctx = await setupGate();
    expect(await ctx.gate.settle("nope")).toEqual({ kind: "refused", reason: "attempt_not_found" });
    expect(ctx.stub.calls).toHaveLength(0);
  });

  it("does not settle an attempt that never got an authorization", async () => {
    const ctx = await setupGate();
    const mandate = await confirmMandate(ctx);
    await ctx.gate.authorize(inputFor(mandate, "a-1", { declaredTotalMinor: 100 }));
    expect(await ctx.gate.settle("a-1")).toMatchObject({ kind: "ok", attempt: { status: "blocked_precheck" } });
    expect(ctx.stub.calls).toHaveLength(0);
  });
});

describe("settle: a purchase that stops being compliant is voided, never captured", () => {
  async function authorized(ctx: Context) {
    const mandate = await confirmMandate(ctx);
    await ctx.gate.authorize(inputFor(mandate));
    return mandate;
  }

  it("voids when the mandate is revoked after authorization", async () => {
    const ctx = await setupGate();
    const mandate = await authorized(ctx);
    await ctx.gate.revokeMandate(mandate.id);
    const result = await ctx.gate.settle("a-1");
    expect(result).toMatchObject({
      kind: "ok",
      attempt: { status: "voided", intendedAction: "void", finalDecision: { decision: "block", violations: [{ code: "MANDATE_REVOKED" }] } },
    });
    expect(ctx.stub.count("voidAuthorization")).toBe(1);
    expect(ctx.stub.count("captureAuthorization")).toBe(0);
    const decision = result.kind === "ok" ? result.attempt.finalDecision : null;
    expect(decision && explainDecision(decision)).toEqual(["The mandate has been revoked."]);
  });

  it("voids when the mandate expires between authorization and settlement", async () => {
    const ctx = await setupGate();
    await authorized(ctx);
    ctx.setNow(new Date("2026-11-03T00:00:00.001Z"));
    expect(await ctx.gate.settle("a-1")).toMatchObject({
      attempt: { status: "voided", finalDecision: { violations: [{ code: "MANDATE_EXPIRED" }] } },
    });
    expect(ctx.stub.count("captureAuthorization")).toBe(0);
  });

  it.each<[string, (ctx: Context) => void, string]>([
    ["a different amount", (ctx) => { const auth = ctx.stub.authorizations.get("AUTH-a-1"); if (auth) auth.amountMinor = 7201; }, "OBSERVED_AMOUNT_MISMATCH"],
    ["an amount PayPal reported that cannot be read", (ctx) => { const auth = ctx.stub.authorizations.get("AUTH-a-1"); if (auth) auth.amountMinor = null; }, "OBSERVATION_INVALID"],
    ["a different currency", (ctx) => { const auth = ctx.stub.authorizations.get("AUTH-a-1"); if (auth) auth.currency = "EUR"; }, "OBSERVED_CURRENCY_MISMATCH"],
    ["a different custom_id", (ctx) => { const auth = ctx.stub.authorizations.get("AUTH-a-1"); if (auth) auth.customId = "b".repeat(64); }, "BINDING_MISMATCH"],
    ["no custom_id", (ctx) => { const auth = ctx.stub.authorizations.get("AUTH-a-1"); if (auth) auth.customId = null; }, "BINDING_MISMATCH"],
  ])("voids when PayPal reports %s", async (_label, tamper, code) => {
    const ctx = await setupGate();
    await authorized(ctx);
    tamper(ctx);
    expect(await ctx.gate.settle("a-1")).toMatchObject({
      attempt: { status: "voided", finalDecision: { decision: "block", violations: [{ code }] } },
    });
    expect(ctx.stub.count("captureAuthorization")).toBe(0);
    expect(ctx.stub.count("voidAuthorization")).toBe(1);
  });

  it("voids when the stored mandate no longer matches its hash", async () => {
    const ctx = await setupGate();
    await authorized(ctx);
    // Alter the mandate in the log and start a new gate over it.
    const tampered = structuredClone(ctx.audit.events);
    const created = tampered[0];
    if (created?.type !== "mandate_created") throw new Error("expected a mandate event");
    created.mandate.terms.maxTotalMinor = 999999;

    const other = await setupGate({ initialEvents: tampered });
    other.stub.authorizations.set("AUTH-a-1", {
      state: "created", amountMinor: 7200, currency: "USD", customId: created.mandate.hash, orderId: "ORDER-a-1", captureId: null,
    });
    const result = await other.gate.settle("a-1");
    expect(result).toMatchObject({
      kind: "ok",
      attempt: { status: "voided", finalDecision: { decision: "block", violations: [{ code: "MANDATE_HASH_MISMATCH" }] } },
    });
    expect(other.stub.count("captureAuthorization")).toBe(0);
    expect(other.stub.count("voidAuthorization")).toBe(1);
    expect(eventTypes(other)).toContain("integrity_failed");
    const decision = result.kind === "ok" ? result.attempt.finalDecision : null;
    expect(decision && explainDecision(decision)).toEqual([
      "The stored mandate no longer matches the hash it was confirmed with, so it cannot be trusted.",
    ]);
  });
});

describe("settle: no write at all unless the authorization is CREATED", () => {
  const notCreated = AUTHORIZATION_STATES.filter((state) => state !== "created");

  it.each(notCreated)("an authorization that is %s ends as no_action, for a compliant purchase", async (state: AuthorizationState) => {
    const ctx = await setupGate();
    const mandate = await confirmMandate(ctx);
    await ctx.gate.authorize(inputFor(mandate));
    const auth = ctx.stub.authorizations.get("AUTH-a-1");
    if (auth) auth.state = state;
    expect(await ctx.gate.settle("a-1")).toMatchObject({ kind: "ok", attempt: { status: "no_action", authorization: { state } } });
    expect(writeCalls(ctx)).toBe(0);
    expect(eventTypes(ctx)).not.toContain("write_requested");
  });

  it.each(notCreated)("an authorization that is %s ends as no_action, for a non-compliant purchase", async (state: AuthorizationState) => {
    const ctx = await setupGate();
    const mandate = await confirmMandate(ctx);
    await ctx.gate.authorize(inputFor(mandate));
    await ctx.gate.revokeMandate(mandate.id);
    const auth = ctx.stub.authorizations.get("AUTH-a-1");
    if (auth) auth.state = state;
    expect(await ctx.gate.settle("a-1")).toMatchObject({ kind: "ok", attempt: { status: "no_action" } });
    expect(writeCalls(ctx)).toBe(0);
  });
});

describe("settle: reading the authorization fails", () => {
  it.each([
    ["not found", { kind: "not_found" as const }, "authorization_not_found"],
    ["unknown", unknown("server_error"), "reason=server_error status=none"],
    ["rejected", rejected(403), "status=403 error=SYNTHETIC issues=SYNTHETIC_ISSUE"],
    ["not sent", notSent(), "token_unavailable"],
  ])("%s: no write, the attempt stays authorized, and it can be settled again", async (_label, failure, detail) => {
    let failing = true;
    const ctx = await setupGate({
      adapter: {
        async getAuthorization(id) {
          if (failing) return failure;
          const auth = ctx.stub.authorizations.get(id);
          return auth ? { kind: "ok", authorization: { id, statusRaw: "CREATED", state: auth.state, amountMinor: auth.amountMinor, currency: auth.currency, customId: auth.customId, expirationTime: null, createTime: null, orderId: auth.orderId } } : { kind: "not_found" };
        },
      },
    });
    const mandate = await confirmMandate(ctx);
    await ctx.gate.authorize(inputFor(mandate));

    expect(await ctx.gate.settle("a-1")).toMatchObject({ kind: "read_failed", detail, attempt: { status: "authorized" } });
    expect(writeCalls(ctx)).toBe(0);
    expect(eventTypes(ctx).at(-1)).toBe("settle_read_failed");

    failing = false;
    expect(await ctx.gate.settle("a-1")).toMatchObject({ kind: "ok", attempt: { status: "captured" } });
    expect(ctx.stub.count("captureAuthorization")).toBe(1);
  });
});

describe("settle: what the answer to the capture means", () => {
  const pending: CaptureResult = {
    kind: "accepted",
    capture: { captureId: "CAP-1", statusRaw: "PENDING", state: "pending", amountMinor: 7200, currency: "USD" },
  };

  it.each<[string, CaptureResult, string]>([
    ["a pending capture", pending, "capture_pending"],
    ["a refusal because it was already captured", { kind: "already_terminal", issue: "PREVIOUSLY_CAPTURED", status: 422, debugId: null }, "write_refused"],
    ["a refusal because it was voided", { kind: "already_terminal", issue: "AUTHORIZATION_VOIDED", status: 422, debugId: null }, "write_refused"],
    ["a rejection", rejected(400), "write_rejected"],
    ["an unknown outcome", unknown("timeout"), "write_unknown"],
    ["a server error", unknown("server_error"), "write_unknown"],
  ])("%s becomes %s, after exactly one capture", async (_label, result, status) => {
    const ctx = await setupGate({ adapter: { captureAuthorization: async () => result } });
    const mandate = await confirmMandate(ctx);
    expect(await ctx.gate.run(inputFor(mandate))).toMatchObject({ kind: "ok", attempt: { status } });
    expect(ctx.stub.count("captureAuthorization")).toBe(1);

    // Settling again must not send anything: the outcome is unsettled or final.
    await ctx.gate.settle("a-1");
    await ctx.gate.run(inputFor(mandate));
    expect(ctx.stub.count("captureAuthorization")).toBe(1);
    expect(ctx.stub.count("voidAuthorization")).toBe(0);
  });

  it("keeps the capture id of a pending capture", async () => {
    const ctx = await setupGate({ adapter: { captureAuthorization: async () => pending } });
    const mandate = await confirmMandate(ctx);
    expect(await ctx.gate.run(inputFor(mandate))).toMatchObject({ attempt: { status: "capture_pending", captureId: "CAP-1" } });
  });

  it("a capture that was never sent leaves the attempt authorized, and a second settle may send it", async () => {
    let first = true;
    const ctx = await setupGate({
      adapter: {
        async captureAuthorization({ authorizationId }): Promise<CaptureResult> {
          if (first) {
            first = false;
            return notSent();
          }
          const auth = ctx.stub.authorizations.get(authorizationId);
          if (auth) auth.state = "captured";
          return { kind: "accepted", capture: { captureId: "CAP-2", statusRaw: "COMPLETED", state: "completed", amountMinor: 7200, currency: "USD" } };
        },
      },
    });
    const mandate = await confirmMandate(ctx);
    expect(await ctx.gate.run(inputFor(mandate))).toMatchObject({ kind: "ok", attempt: { status: "authorized", intendedAction: null } });
    expect(await ctx.gate.settle("a-1")).toMatchObject({ kind: "ok", attempt: { status: "captured" } });
    expect(ctx.stub.count("captureAuthorization")).toBe(2);
  });
});

describe("settle: what the answer to the void means", () => {
  async function revokedAfterAuthorize(ctx: Context) {
    const mandate = await confirmMandate(ctx);
    await ctx.gate.authorize(inputFor(mandate));
    await ctx.gate.revokeMandate(mandate.id);
  }

  it.each<[string, VoidResult, string]>([
    ["a refusal because it was already captured", { kind: "already_terminal", issue: "PREVIOUSLY_CAPTURED", status: 422, debugId: null }, "write_refused"],
    ["a rejection", rejected(400), "write_rejected"],
    ["an unconfirmed void", unknown("void_unconfirmed"), "write_unknown"],
    ["a timeout", unknown("timeout"), "write_unknown"],
  ])("%s becomes %s, after exactly one void", async (_label, result, status) => {
    const ctx = await setupGate({ adapter: { voidAuthorization: async () => result } });
    await revokedAfterAuthorize(ctx);
    expect(await ctx.gate.settle("a-1")).toMatchObject({ kind: "ok", attempt: { status, intendedAction: "void" } });
    expect(ctx.stub.count("voidAuthorization")).toBe(1);

    await ctx.gate.settle("a-1");
    expect(ctx.stub.count("voidAuthorization")).toBe(1);
    expect(ctx.stub.count("captureAuthorization")).toBe(0);
  });

  it("a void that was never sent leaves the attempt authorized, and a second settle may send it", async () => {
    let first = true;
    const ctx = await setupGate({
      adapter: {
        async voidAuthorization({ authorizationId }): Promise<VoidResult> {
          if (first) {
            first = false;
            return notSent();
          }
          const auth = ctx.stub.authorizations.get(authorizationId);
          if (auth) auth.state = "voided";
          return { kind: "voided" };
        },
      },
    });
    await revokedAfterAuthorize(ctx);
    expect(await ctx.gate.settle("a-1")).toMatchObject({ attempt: { status: "authorized" } });
    expect(await ctx.gate.settle("a-1")).toMatchObject({ attempt: { status: "voided" } });
    expect(ctx.stub.count("voidAuthorization")).toBe(2);
    expect(ctx.stub.count("captureAuthorization")).toBe(0);
  });
});

// D-007's verification: "zero captures on any failure". Every combination of a
// failing or tampered step is run, and a capture may only happen when every
// step before it was clean.
describe("D-007 sweep: a capture needs every earlier step to be clean", () => {
  const createVariants: { name: string; clean: boolean; adapter?: Record<string, unknown> }[] = [
    { name: "order created", clean: true },
    { name: "order rejected", clean: false, adapter: { createVaultOrder: async () => rejected() } },
    { name: "order not sent", clean: false, adapter: { createVaultOrder: async () => notSent() } },
    { name: "order unknown", clean: false, adapter: { createVaultOrder: async () => ({ ...unknown(), orderId: null }) } },
  ];

  type Tamper = { name: string; apply: (ctx: Context) => Promise<void> | void; capture: boolean; void: boolean };
  const stateTamper = (change: (auth: NonNullable<ReturnType<Context["stub"]["authorizations"]["get"]>>) => void) => (ctx: Context) => {
    const auth = ctx.stub.authorizations.get("AUTH-a-1");
    if (auth) change(auth);
  };
  const tampers: Tamper[] = [
    { name: "nothing changed", apply: () => undefined, capture: true, void: false },
    { name: "amount changed", apply: stateTamper((a) => { a.amountMinor = 7201; }), capture: false, void: true },
    { name: "currency changed", apply: stateTamper((a) => { a.currency = "EUR"; }), capture: false, void: true },
    { name: "custom_id removed", apply: stateTamper((a) => { a.customId = null; }), capture: false, void: true },
    { name: "authorization captured elsewhere", apply: stateTamper((a) => { a.state = "captured"; }), capture: false, void: false },
    { name: "authorization voided elsewhere", apply: stateTamper((a) => { a.state = "voided"; }), capture: false, void: false },
    { name: "mandate revoked", apply: async (ctx) => { await ctx.gate.revokeMandate("m-1"); }, capture: false, void: true },
  ];

  for (const create of createVariants) {
    for (const tamper of tampers) {
      it(`${create.name}, then ${tamper.name}`, async () => {
        const ctx = await setupGate(create.adapter ? { adapter: create.adapter as never } : {});
        const mandate = await confirmMandate(ctx);
        await ctx.gate.authorize(inputFor(mandate));
        await tamper.apply(ctx);
        await ctx.gate.settle("a-1");

        const captures = ctx.stub.count("captureAuthorization");
        const voids = ctx.stub.count("voidAuthorization");
        // Never both, never more than one.
        expect(captures + voids).toBeLessThanOrEqual(1);
        // A capture only after a created order and an untouched authorization.
        expect(captures).toBe(create.clean && tamper.capture ? 1 : 0);
        // A void only when there was an authorization to void.
        expect(voids).toBe(create.clean && tamper.void ? 1 : 0);
      });
    }
  }

  it.each([
    ["not found", { kind: "not_found" as const }],
    ["unknown", unknown()],
    ["rejected", rejected(500)],
    ["not sent", notSent()],
  ])("a failed read of the authorization (%s) sends nothing", async (_label, failure) => {
    const ctx = await setupGate({ adapter: { getAuthorization: async () => failure } });
    const mandate = await confirmMandate(ctx);
    await ctx.gate.run(inputFor(mandate));
    expect(writeCalls(ctx)).toBe(0);
  });

  it("a gate that cannot write its log sends no capture", async () => {
    // A log that fails on the write request: the capture must not be sent.
    const { createMemoryAuditLog } = await import("./audit-log.ts");
    const inner = createMemoryAuditLog();
    const failing = {
      ...inner,
      async append(event: Parameters<typeof inner.append>[0]) {
        if (event.type === "write_requested") throw new Error("disk full");
        await inner.append(event);
      },
    };
    const ctx = await setupGate({ audit: failing });
    const mandate = await confirmMandate(ctx);
    await expect(ctx.gate.run(inputFor(mandate))).rejects.toThrow("disk full");
    expect(writeCalls(ctx)).toBe(0);
  });
});
