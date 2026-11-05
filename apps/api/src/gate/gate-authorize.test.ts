import { describe, expect, it } from "vitest";
import { hashMandate } from "../mandate-hash.ts";
import type { CreateOrderResult } from "../paypal/adapter.ts";
import { createMemoryAuditLog } from "./audit-log.ts";
import {
  T0,
  TERMS,
  confirmMandate,
  eventTypes,
  inputFor,
  notSent,
  proposalFor,
  rejected,
  setupGate,
  unknown,
} from "./test-support.ts";

describe("createMandate", () => {
  it("stores a confirmed mandate whose hash matches its own terms", async () => {
    const ctx = await setupGate();
    const mandate = await confirmMandate(ctx);
    expect(mandate).toMatchObject({ id: "m-1", version: 1, status: "confirmed", confirmedAt: T0.toISOString() });
    expect(mandate.hash).toBe(hashMandate(mandate));
    expect(ctx.gate.getMandate("m-1")).toEqual(mandate);
    expect(eventTypes(ctx)).toEqual(["mandate_created"]);
  });

  it.each([
    ["terms that are not an object", null, "A jacket"],
    ["a currency other than USD", { ...TERMS, currency: "EUR" }, "A jacket"],
    ["no items", { ...TERMS, items: [] }, "A jacket"],
    ["a fractional limit", { ...TERMS, maxTotalMinor: 100.5 }, "A jacket"],
    ["an extra field", { ...TERMS, extra: 1 }, "A jacket"],
    ["a missing summary", TERMS, undefined],
    ["a summary that is not text", TERMS, 42],
  ])("refuses %s and writes nothing", async (_label, terms, intentSummary) => {
    const ctx = await setupGate();
    expect(await ctx.gate.createMandate({ terms, intentSummary })).toEqual({ kind: "refused", reason: "invalid_mandate" });
    expect(ctx.audit.events).toHaveLength(0);
  });

  it("gives each mandate its own id and hash", async () => {
    const ctx = await setupGate();
    const first = await confirmMandate(ctx);
    const second = await confirmMandate(ctx, { ...TERMS, maxTotalMinor: 15000 });
    expect(first.id).not.toBe(second.id);
    expect(first.hash).not.toBe(second.hash);
  });

  it("returns copies, so a caller cannot change the stored mandate", async () => {
    const ctx = await setupGate();
    const mandate = await confirmMandate(ctx);
    (mandate.terms as { maxTotalMinor: number }).maxTotalMinor = 999999;
    expect(ctx.gate.getMandate(mandate.id)?.terms.maxTotalMinor).toBe(20000);
  });
});

describe("revokeMandate", () => {
  it("changes only the status, so the hash stays the same", async () => {
    const ctx = await setupGate();
    const mandate = await confirmMandate(ctx);
    const result = await ctx.gate.revokeMandate(mandate.id);
    expect(result).toMatchObject({ kind: "ok", mandate: { status: "revoked", hash: mandate.hash, terms: mandate.terms } });
    expect(hashMandate(ctx.gate.getMandate(mandate.id) as never)).toBe(mandate.hash);
  });

  it("is safe to repeat and writes one event", async () => {
    const ctx = await setupGate();
    const mandate = await confirmMandate(ctx);
    await ctx.gate.revokeMandate(mandate.id);
    await ctx.gate.revokeMandate(mandate.id);
    expect(eventTypes(ctx)).toEqual(["mandate_created", "mandate_revoked"]);
  });

  it("refuses an unknown mandate", async () => {
    const ctx = await setupGate();
    expect(await ctx.gate.revokeMandate("nope")).toEqual({ kind: "refused", reason: "mandate_not_found" });
  });
});

describe("authorize: a compliant purchase", () => {
  it("creates the order for the computed total with the mandate hash, and stops before any write", async () => {
    const ctx = await setupGate();
    const mandate = await confirmMandate(ctx);
    const result = await ctx.gate.authorize(inputFor(mandate));

    expect(result).toMatchObject({ kind: "ok", attempt: { status: "authorized", orderId: "ORDER-a-1", authorizationId: "AUTH-a-1" } });
    expect(ctx.stub.names()).toEqual(["createVaultOrder"]);
    expect(ctx.stub.calls[0]?.input).toEqual({ attemptId: "a-1", amountMinor: 7200, mandateHash: mandate.hash });
    expect(eventTypes(ctx)).toEqual([
      "mandate_created",
      "attempt_started",
      "precheck_decided",
      "order_requested",
      "order_result",
    ]);
  });

  it("records the order request before the PayPal call is made", async () => {
    let eventsSeenByAdapter: string[] = [];
    const ctx = await setupGate({
      adapter: {
        async createVaultOrder() {
          eventsSeenByAdapter = ctx.audit.events.map((event) => event.type);
          return { ...unknown(), orderId: null };
        },
      },
    });
    const mandate = await confirmMandate(ctx);
    await ctx.gate.authorize(inputFor(mandate));
    expect(eventsSeenByAdapter.at(-1)).toBe("order_requested");
  });
});

describe("authorize: nothing reaches PayPal when the pre-check or integrity check fails", () => {
  it.each([
    ["a total over the limit", { declaredTotalMinor: 24000, lines: [{ productId: "jacket", quantity: 2, unitPriceMinor: 12000 }] }],
    ["a product the mandate does not list", { lines: [{ productId: "hat", quantity: 1, unitPriceMinor: 7200 }] }],
    ["too many of a product", { declaredTotalMinor: 21600, lines: [{ productId: "jacket", quantity: 3, unitPriceMinor: 7200 }] }],
    ["an under-declared total", { declaredTotalMinor: 100 }],
    ["the wrong currency", { currency: "EUR" }],
    ["an empty cart", { declaredTotalMinor: 0, lines: [] }],
  ])("blocks %s with no PayPal call at all", async (_label, overrides) => {
    const ctx = await setupGate();
    const mandate = await confirmMandate(ctx);
    const result = await ctx.gate.authorize(inputFor(mandate, "a-1", overrides));
    expect(result).toMatchObject({ kind: "ok", attempt: { status: "blocked_precheck", orderId: null, authorizationId: null } });
    expect(ctx.stub.calls).toHaveLength(0);
    expect(eventTypes(ctx)).toEqual(["mandate_created", "attempt_started", "precheck_decided"]);
  });

  it("blocks a revoked mandate", async () => {
    const ctx = await setupGate();
    const mandate = await confirmMandate(ctx);
    await ctx.gate.revokeMandate(mandate.id);
    const result = await ctx.gate.authorize(inputFor(mandate));
    expect(result).toMatchObject({ kind: "ok", attempt: { status: "blocked_precheck" } });
    expect(ctx.stub.calls).toHaveLength(0);
  });

  it("blocks an expired mandate, including exactly at the expiry instant", async () => {
    const ctx = await setupGate();
    const mandate = await confirmMandate(ctx);
    ctx.setNow(new Date(TERMS.expiresAt));
    const result = await ctx.gate.authorize(inputFor(mandate));
    expect(result).toMatchObject({ kind: "ok", attempt: { status: "blocked_precheck" } });
    expect(ctx.stub.calls).toHaveLength(0);
  });

  it("records the reasons, so they can be explained later", async () => {
    const ctx = await setupGate();
    const mandate = await confirmMandate(ctx);
    const result = await ctx.gate.authorize(inputFor(mandate, "a-1", { declaredTotalMinor: 100 }));
    expect(result).toMatchObject({
      attempt: { precheck: { decision: "block", violations: [{ code: "TOTAL_MISMATCH", expected: 7200, actual: 100 }] } },
    });
  });

  it("fails the integrity check when the stored mandate was altered, with no PayPal call", async () => {
    const ctx = await setupGate();
    await confirmMandate(ctx);
    const tampered = structuredClone(ctx.audit.events);
    const created = tampered[0];
    if (created?.type !== "mandate_created") throw new Error("expected a mandate event");
    created.mandate.terms.maxTotalMinor = 999999; // the hash is not updated

    const other = await setupGate({ initialEvents: tampered });
    const result = await other.gate.authorize(inputFor(created.mandate));
    expect(result).toMatchObject({
      kind: "ok",
      attempt: { status: "integrity_failed", precheck: { decision: "block", violations: [{ code: "MANDATE_HASH_MISMATCH" }] } },
    });
    expect(other.stub.calls).toHaveLength(0);
  });

  it("refuses to create an order for a total of nothing, without calling PayPal", async () => {
    const ctx = await setupGate();
    const mandate = await confirmMandate(ctx);
    const result = await ctx.gate.authorize(
      inputFor(mandate, "a-1", { declaredTotalMinor: 0, lines: [{ productId: "jacket", quantity: 1, unitPriceMinor: 0 }] }),
    );
    expect(result).toMatchObject({ kind: "ok", attempt: { status: "create_rejected" } });
    expect(ctx.stub.calls).toHaveLength(0);
    expect(ctx.audit.events.at(-1)).toMatchObject({ type: "order_result", outcome: "not_sent", detail: "total_not_payable" });
  });
});

describe("authorize: what PayPal's answer to the order means", () => {
  const anomaly: CreateOrderResult = {
    kind: "anomaly",
    reason: "no_authorization",
    order: { orderId: "ORDER-x", statusRaw: "COMPLETED", state: "completed", authorizations: [], captures: [] },
  };

  it.each<[string, CreateOrderResult, string, string | null]>([
    ["rejected", rejected(), "create_rejected", null],
    ["not sent", notSent(), "create_rejected", null],
    ["an unknown outcome with no order id", { ...unknown(), orderId: null }, "create_unknown", null],
    ["an unknown outcome with an order id", { ...unknown("server_error"), orderId: "ORDER-known" }, "create_unknown", "ORDER-known"],
    ["an anomaly", anomaly, "anomaly", "ORDER-x"],
  ])("%s becomes %s", async (_label, result, status, orderId) => {
    const ctx = await setupGate({ adapter: { createVaultOrder: async () => result } });
    const mandate = await confirmMandate(ctx);
    expect(await ctx.gate.authorize(inputFor(mandate))).toMatchObject({ kind: "ok", attempt: { status, orderId } });
    expect(ctx.stub.count("createVaultOrder")).toBe(1);
    expect(ctx.stub.count("captureAuthorization")).toBe(0);
    expect(ctx.stub.count("voidAuthorization")).toBe(0);
  });

  it("stops at an anomaly and does not settle it", async () => {
    const ctx = await setupGate({ adapter: { createVaultOrder: async () => anomaly } });
    const mandate = await confirmMandate(ctx);
    const result = await ctx.gate.run(inputFor(mandate));
    expect(result).toMatchObject({ kind: "ok", attempt: { status: "anomaly" } });
    expect(ctx.stub.names()).toEqual(["createVaultOrder"]);
  });

  it("stops the gate if the adapter throws, because the request may have been sent", async () => {
    const ctx = await setupGate({
      adapter: {
        async createVaultOrder() {
          throw new Error("bug in the adapter");
        },
      },
    });
    const mandate = await confirmMandate(ctx);
    await expect(ctx.gate.authorize(inputFor(mandate))).rejects.toThrow("bug in the adapter");
    expect(await ctx.gate.authorize(inputFor(mandate, "a-2"))).toEqual({ kind: "refused", reason: "gate_faulted" });
    expect(await ctx.gate.settle("a-1")).toEqual({ kind: "refused", reason: "gate_faulted" });
    expect(await ctx.gate.createMandate({ terms: TERMS, intentSummary: "x" })).toEqual({ kind: "refused", reason: "gate_faulted" });
  });
});

describe("authorize: the request itself", () => {
  it.each([
    ["an empty attempt id", ""],
    ["an attempt id with a space", "bad id"],
    ["an attempt id with a slash", "a/b"],
    ["an attempt id over 100 characters", "x".repeat(101)],
  ])("refuses %s", async (_label, attemptId) => {
    const ctx = await setupGate();
    const mandate = await confirmMandate(ctx);
    expect(await ctx.gate.authorize({ ...inputFor(mandate), attemptId })).toEqual({ kind: "refused", reason: "invalid_attempt_id" });
    expect(ctx.stub.calls).toHaveLength(0);
  });

  it.each([
    ["null", null],
    ["a string", "a purchase"],
    ["an extra field", { ...proposalFor("m-1"), extra: true }],
    ["a negative total", { ...proposalFor("m-1"), declaredTotalMinor: -1 }],
  ])("refuses a proposal that is %s and records nothing", async (_label, proposal) => {
    const ctx = await setupGate();
    const mandate = await confirmMandate(ctx);
    const before = ctx.audit.events.length;
    expect(await ctx.gate.authorize({ attemptId: "a-1", mandateId: mandate.id, proposal })).toEqual({
      kind: "refused",
      reason: "invalid_proposal",
    });
    expect(ctx.audit.events).toHaveLength(before);
  });

  it("refuses an unknown mandate", async () => {
    const ctx = await setupGate();
    expect(await ctx.gate.authorize({ attemptId: "a-1", mandateId: "nope", proposal: proposalFor("nope") })).toEqual({
      kind: "refused",
      reason: "mandate_not_found",
    });
    expect(ctx.stub.calls).toHaveLength(0);
  });
});

describe("authorize: repeating a request", () => {
  it("returns the existing attempt and makes no second order", async () => {
    const ctx = await setupGate();
    const mandate = await confirmMandate(ctx);
    const first = await ctx.gate.authorize(inputFor(mandate));
    const second = await ctx.gate.authorize(inputFor(mandate));
    expect(second).toEqual(first);
    expect(ctx.stub.count("createVaultOrder")).toBe(1);
    expect(eventTypes(ctx).filter((type) => type === "attempt_started")).toHaveLength(1);
  });

  it("refuses the same attempt id with a different proposal", async () => {
    const ctx = await setupGate();
    const mandate = await confirmMandate(ctx);
    await ctx.gate.authorize(inputFor(mandate));
    expect(await ctx.gate.authorize(inputFor(mandate, "a-1", { declaredTotalMinor: 100 }))).toEqual({
      kind: "refused",
      reason: "attempt_id_reused",
    });
  });

  it("refuses the same attempt id with a different mandate", async () => {
    const ctx = await setupGate();
    const first = await confirmMandate(ctx);
    const second = await confirmMandate(ctx, { ...TERMS, maxTotalMinor: 15000 });
    await ctx.gate.authorize(inputFor(first));
    expect(await ctx.gate.authorize(inputFor(second))).toEqual({ kind: "refused", reason: "attempt_id_reused" });
  });
});

describe("authorize: a mandate can be used once", () => {
  it("refuses a second attempt while the first is authorized", async () => {
    const ctx = await setupGate();
    const mandate = await confirmMandate(ctx);
    await ctx.gate.authorize(inputFor(mandate, "a-1"));
    expect(await ctx.gate.authorize(inputFor(mandate, "a-2"))).toEqual({
      kind: "refused",
      reason: "mandate_in_use",
      byAttemptId: "a-1",
    });
    expect(ctx.stub.count("createVaultOrder")).toBe(1);
  });

  it("stays in use after a capture", async () => {
    const ctx = await setupGate();
    const mandate = await confirmMandate(ctx);
    await ctx.gate.run(inputFor(mandate, "a-1"));
    expect(ctx.gate.getAttempt("a-1")?.status).toBe("captured");
    expect(await ctx.gate.authorize(inputFor(mandate, "a-2"))).toMatchObject({ kind: "refused", reason: "mandate_in_use" });
  });

  it("is free again after a pre-check block", async () => {
    const ctx = await setupGate();
    const mandate = await confirmMandate(ctx);
    await ctx.gate.authorize(inputFor(mandate, "a-1", { declaredTotalMinor: 100 }));
    expect(ctx.gate.getAttempt("a-1")?.status).toBe("blocked_precheck");
    expect(await ctx.gate.authorize(inputFor(mandate, "a-2"))).toMatchObject({ kind: "ok", attempt: { status: "authorized" } });
  });

  it("is free again after a rejected order", async () => {
    const ctx = await setupGate({
      adapter: {
        // The first attempt is rejected; any other gets an authorization.
        async createVaultOrder(input): Promise<CreateOrderResult> {
          if (input.attemptId === "a-1") return rejected();
          return {
            kind: "created",
            order: {
              orderId: "ORDER-2",
              statusRaw: "COMPLETED",
              state: "completed",
              authorizations: [{ id: "AUTH-2", statusRaw: "CREATED", state: "created" }],
              captures: [],
            },
            authorizationId: "AUTH-2",
          };
        },
      },
    });
    const mandate = await confirmMandate(ctx);
    await ctx.gate.authorize(inputFor(mandate, "a-1"));
    expect(ctx.gate.getAttempt("a-1")?.status).toBe("create_rejected");
    expect(await ctx.gate.authorize(inputFor(mandate, "a-2"))).toMatchObject({ kind: "ok", attempt: { status: "authorized" } });
  });

  it("is free again after the hold is released by a void", async () => {
    const ctx = await setupGate();
    const mandate = await confirmMandate(ctx);
    await ctx.gate.authorize(inputFor(mandate, "a-1"));
    await ctx.gate.revokeMandate(mandate.id);
    await ctx.gate.settle("a-1");
    expect(ctx.gate.getAttempt("a-1")?.status).toBe("voided");
    // The mandate is revoked, so a new attempt is blocked by the pre-check, but
    // not by "in use".
    expect(await ctx.gate.authorize(inputFor(mandate, "a-2"))).toMatchObject({ kind: "ok", attempt: { status: "blocked_precheck" } });
  });

  it("stays in use when the order outcome is unknown", async () => {
    const ctx = await setupGate({ adapter: { createVaultOrder: async () => ({ ...unknown(), orderId: null }) } });
    const mandate = await confirmMandate(ctx);
    await ctx.gate.authorize(inputFor(mandate, "a-1"));
    expect(await ctx.gate.authorize(inputFor(mandate, "a-2"))).toMatchObject({ kind: "refused", reason: "mandate_in_use" });
  });

  it("lets two attempts on one mandate race and sends exactly one order", async () => {
    const ctx = await setupGate();
    const mandate = await confirmMandate(ctx);
    const results = await Promise.all([
      ctx.gate.authorize(inputFor(mandate, "a-1")),
      ctx.gate.authorize(inputFor(mandate, "a-2")),
      ctx.gate.authorize(inputFor(mandate, "a-3")),
    ]);
    expect(results.filter((result) => result.kind === "ok")).toHaveLength(1);
    expect(results.filter((result) => result.kind === "refused")).toHaveLength(2);
    expect(ctx.stub.count("createVaultOrder")).toBe(1);
  });

  it("does not let one mandate's attempt block another mandate", async () => {
    const ctx = await setupGate();
    const first = await confirmMandate(ctx);
    const second = await confirmMandate(ctx, { ...TERMS, maxTotalMinor: 15000 });
    await ctx.gate.authorize(inputFor(first, "a-1"));
    expect(await ctx.gate.authorize(inputFor(second, "a-2"))).toMatchObject({ kind: "ok", attempt: { status: "authorized" } });
  });

  it("repeating the same request is not 'in use' by itself", async () => {
    const ctx = await setupGate();
    const mandate = await confirmMandate(ctx);
    await ctx.gate.authorize(inputFor(mandate, "a-1"));
    expect(await ctx.gate.authorize(inputFor(mandate, "a-1"))).toMatchObject({ kind: "ok", attempt: { attemptId: "a-1" } });
  });
});

describe("audit content", () => {
  it("contains no credentials and only events that pass the schema", async () => {
    const ctx = await setupGate();
    const mandate = await confirmMandate(ctx);
    await ctx.gate.run(inputFor(mandate));
    const text = JSON.stringify(ctx.audit.events);
    for (const forbidden of ["Bearer", "access_token", "client_secret", "Basic "]) expect(text).not.toContain(forbidden);
    expect((await createMemoryAuditLog(ctx.audit.events).readAll()).events).toHaveLength(ctx.audit.events.length);
  });
});
