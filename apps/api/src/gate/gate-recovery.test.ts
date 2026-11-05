import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CaptureResult, GetOrderResult, VoidResult } from "../paypal/adapter.ts";
import { createFileAuditLog, createMemoryAuditLog } from "./audit-log.ts";
import type { AuditLog } from "./audit-log.ts";
import { AuditCorruptError } from "./events.ts";
import type { AuditEvent } from "./events.ts";
import { createGate } from "./gate.ts";
import {
  T0,
  TERMS,
  confirmMandate,
  createStub,
  eventTypes,
  inputFor,
  notSent,
  rejected,
  setupGate,
  unknown,
} from "./test-support.ts";
import type { Context } from "./test-support.ts";

const writeCalls = (ctx: Context) => ctx.stub.count("captureAuthorization") + ctx.stub.count("voidAuthorization");

// A log that fails when asked to write one kind of event, as a full disk would.
function failingOn(type: AuditEvent["type"]): AuditLog & { readonly events: AuditEvent[] } {
  const inner = createMemoryAuditLog();
  return {
    events: inner.events,
    readAll: () => inner.readAll(),
    async append(event) {
      if (event.type === type) throw new Error("disk full");
      await inner.append(event);
    },
  };
}

describe("a restart rebuilds the same state from the log", () => {
  it("restores mandates and attempts exactly", async () => {
    const ctx = await setupGate();
    const first = await confirmMandate(ctx);
    const second = await confirmMandate(ctx, { ...TERMS, maxTotalMinor: 15000 });
    await ctx.gate.run(inputFor(first, "a-1"));
    await ctx.gate.authorize(inputFor(second, "a-2", { declaredTotalMinor: 100 }));
    await ctx.gate.revokeMandate(second.id);

    const before = { mandates: ctx.gate.listMandates(), attempts: ctx.gate.listAttempts() };
    const restarted = await ctx.restart();
    expect({ mandates: restarted.listMandates(), attempts: restarted.listAttempts() }).toEqual(before);
  });

  it("keeps a revoked mandate revoked", async () => {
    const ctx = await setupGate();
    const mandate = await confirmMandate(ctx);
    await ctx.gate.revokeMandate(mandate.id);
    expect((await ctx.restart()).getMandate(mandate.id)?.status).toBe("revoked");
  });

  it("keeps the single-use rule across a restart", async () => {
    const ctx = await setupGate();
    const mandate = await confirmMandate(ctx);
    await ctx.gate.run(inputFor(mandate, "a-1"));
    const restarted = await ctx.restart();
    expect(await restarted.authorize(inputFor(mandate, "a-2"))).toMatchObject({ kind: "refused", reason: "mandate_in_use" });
  });
});

describe("a crash at any point in the log (D-008)", () => {
  // The events of one complete run, in order.
  async function fullRun() {
    const ctx = await setupGate();
    const mandate = await confirmMandate(ctx);
    await ctx.gate.run(inputFor(mandate));
    return { events: ctx.audit.events, mandate };
  }

  it("has the events this table assumes", async () => {
    const { events } = await fullRun();
    expect(events.map((event) => event.type)).toEqual([
      "mandate_created", "attempt_started", "precheck_decided", "order_requested", "order_result",
      "authorization_read", "final_decided", "write_requested", "write_result",
    ]);
  });

  it.each<[number, string]>([
    [2, "abandoned"],
    [3, "abandoned"],
    [4, "create_unknown"],
    [5, "authorized"],
    [6, "authorized"],
    [7, "authorized"],
    [8, "write_unknown"],
    [9, "captured"],
  ])("a log cut after %d events leaves the attempt %s", async (cut, status) => {
    const { events } = await fullRun();
    const ctx = await setupGate({ initialEvents: events.slice(0, cut) });
    expect(ctx.gate.getAttempt("a-1")?.status).toBe(status);
  });

  it("never reports an unseen outcome as a failure", async () => {
    const { events } = await fullRun();
    for (const cut of [4, 8]) {
      const ctx = await setupGate({ initialEvents: events.slice(0, cut) });
      expect(ctx.gate.getAttempt("a-1")?.status).toMatch(/unknown$/);
    }
  });

  it("does not settle an attempt whose write has no result", async () => {
    const { events, mandate } = await fullRun();
    const ctx = await setupGate({ initialEvents: events.slice(0, 8) });
    await ctx.gate.settle("a-1");
    await ctx.gate.run(inputFor(mandate));
    expect(ctx.stub.calls).toHaveLength(0);
  });

  it("does not create a second order for an order request with no result", async () => {
    const { events, mandate } = await fullRun();
    const ctx = await setupGate({ initialEvents: events.slice(0, 4) });
    expect(await ctx.gate.run(inputFor(mandate))).toMatchObject({ kind: "ok", attempt: { status: "create_unknown" } });
    expect(ctx.stub.calls).toHaveLength(0);
    // And the mandate stays in use: PayPal may hold an authorization for it.
    expect(await ctx.gate.authorize(inputFor(mandate, "a-2"))).toMatchObject({ kind: "refused", reason: "mandate_in_use" });
  });

  it("frees the mandate after an attempt that never reached PayPal", async () => {
    const { events, mandate } = await fullRun();
    const ctx = await setupGate({ initialEvents: events.slice(0, 3) });
    expect(ctx.gate.getAttempt("a-1")?.status).toBe("abandoned");
    expect(await ctx.gate.authorize(inputFor(mandate, "a-2"))).toMatchObject({ kind: "ok", attempt: { status: "authorized" } });
  });

  it("settles an attempt that was authorized before the crash, without a new order", async () => {
    const { events, mandate } = await fullRun();
    const ctx = await setupGate({ initialEvents: events.slice(0, 5) });
    ctx.stub.authorizations.set("AUTH-a-1", { state: "created", amountMinor: 7200, currency: "USD", customId: mandate.hash, orderId: "ORDER-a-1", captureId: null });
    expect(await ctx.gate.run(inputFor(mandate))).toMatchObject({ kind: "ok", attempt: { status: "captured" } });
    expect(ctx.stub.names()).toEqual(["getAuthorization", "captureAuthorization"]);
  });
});

describe("a log that does not make sense", () => {
  it("refuses to start when an event refers to an attempt that never began", async () => {
    const ctx = await setupGate();
    const mandate = await confirmMandate(ctx);
    await ctx.gate.run(inputFor(mandate));
    const broken = ctx.audit.events.filter((event) => event.type !== "attempt_started");
    const stub = createStub();
    await expect(createGate({ adapter: stub.adapter, audit: createMemoryAuditLog(broken), now: () => T0 })).rejects.toBeInstanceOf(
      AuditCorruptError,
    );
    expect(stub.calls).toHaveLength(0);
  });
});

describe("the log cannot be written (fail closed)", () => {
  it("sends no capture when the write request cannot be recorded, and settles after a restart", async () => {
    const audit = failingOn("write_requested");
    const ctx = await setupGate({ audit });
    const mandate = await confirmMandate(ctx);
    await expect(ctx.gate.run(inputFor(mandate))).rejects.toThrow("disk full");
    expect(writeCalls(ctx)).toBe(0);

    // The authorization and the decision were recorded, the request was not.
    const restarted = await createGate({ adapter: ctx.stub.adapter, audit: createMemoryAuditLog(audit.events), now: () => T0 });
    expect(restarted.getAttempt("a-1")?.status).toBe("authorized");
  });

  it("treats a capture whose result cannot be recorded as unknown, never as failed, and never repeats it", async () => {
    const audit = failingOn("write_result");
    const ctx = await setupGate({ audit });
    const mandate = await confirmMandate(ctx);
    await expect(ctx.gate.run(inputFor(mandate))).rejects.toThrow("disk full");
    expect(ctx.stub.count("captureAuthorization")).toBe(1);

    const restarted = await createGate({ adapter: ctx.stub.adapter, audit: createMemoryAuditLog(audit.events), now: () => T0 });
    expect(restarted.getAttempt("a-1")?.status).toBe("write_unknown");
    await restarted.settle("a-1");
    await restarted.run(inputFor(mandate));
    expect(ctx.stub.count("captureAuthorization")).toBe(1);
  });

  it("treats an order whose result cannot be recorded as unknown", async () => {
    const audit = failingOn("order_result");
    const ctx = await setupGate({ audit });
    const mandate = await confirmMandate(ctx);
    await expect(ctx.gate.authorize(inputFor(mandate))).rejects.toThrow("disk full");
    expect(ctx.stub.count("createVaultOrder")).toBe(1);

    const restarted = await createGate({ adapter: ctx.stub.adapter, audit: createMemoryAuditLog(audit.events), now: () => T0 });
    expect(restarted.getAttempt("a-1")?.status).toBe("create_unknown");
  });

  it("sends no order when the order request cannot be recorded", async () => {
    const ctx = await setupGate({ audit: failingOn("order_requested") });
    const mandate = await confirmMandate(ctx);
    await expect(ctx.gate.authorize(inputFor(mandate))).rejects.toThrow("disk full");
    expect(ctx.stub.calls).toHaveLength(0);
  });

  it("stops everything after the first failure", async () => {
    const ctx = await setupGate({ audit: failingOn("precheck_decided") });
    const mandate = await confirmMandate(ctx);
    await expect(ctx.gate.authorize(inputFor(mandate))).rejects.toThrow("disk full");

    const refused = { kind: "refused", reason: "gate_faulted" };
    expect(await ctx.gate.authorize(inputFor(mandate, "a-2"))).toEqual(refused);
    expect(await ctx.gate.run(inputFor(mandate, "a-3"))).toEqual(refused);
    expect(await ctx.gate.settle("a-1")).toEqual(refused);
    expect(await ctx.gate.reconcile("a-1")).toEqual(refused);
    expect(await ctx.gate.revokeMandate(mandate.id)).toEqual(refused);
    expect(await ctx.gate.createMandate({ terms: {}, intentSummary: "x" })).toEqual(refused);
    // Reading is still possible.
    expect(ctx.gate.getMandate(mandate.id)).not.toBeNull();
    expect(ctx.stub.calls).toHaveLength(0);
  });

  it("fails to create a mandate when the log cannot be written, and keeps no trace of it", async () => {
    const ctx = await setupGate({ audit: failingOn("mandate_created") });
    await expect(ctx.gate.createMandate({ terms: { currency: "USD", maxTotalMinor: 1, expiresAt: "2026-11-03T00:00:00.000Z", items: [{ productId: "p", maxQuantity: 1, maxUnitPriceMinor: 1 }] }, intentSummary: "x" })).rejects.toThrow(
      "disk full",
    );
    expect(ctx.gate.listMandates()).toEqual([]);
  });
});

describe("persistence in a real file", () => {
  let directory = "";
  afterEach(async () => {
    if (directory !== "") await rm(directory, { recursive: true, force: true });
  });

  it("survives a restart, and a torn last line is reported and repaired", async () => {
    directory = await mkdtemp(join(tmpdir(), "ostensia-gate-"));
    const path = join(directory, "data", "audit.jsonl");
    const stub = createStub();
    const gateOver = () => createGate({ adapter: stub.adapter, audit: createFileAuditLog(path), now: () => T0, newId: () => "m-file" });

    const first = await gateOver();
    const created = await first.createMandate({
      terms: { currency: "USD", maxTotalMinor: 20000, expiresAt: "2026-11-03T00:00:00.000Z", items: [{ productId: "jacket", maxQuantity: 2, maxUnitPriceMinor: 8000 }] },
      intentSummary: "A jacket",
    });
    if (created.kind !== "ok") throw new Error("expected a mandate");
    await first.run(inputFor(created.mandate));

    // The process dies while writing one more event.
    await appendFile(path, '{"v":1,"at":"2026-11-02T12:00:00.000Z","type":"order_req', "utf8");

    const second = await gateOver();
    expect(second.warnings).toHaveLength(1);
    expect(second.getAttempt("a-1")?.status).toBe("captured");
    expect(second.getMandate("m-file")?.status).toBe("confirmed");

    // The repaired log accepts new events and replays cleanly.
    await second.revokeMandate("m-file");
    const third = await gateOver();
    expect(third.warnings).toEqual([]);
    expect(third.getMandate("m-file")?.status).toBe("revoked");
  });
});

describe("reconcile: only reads, and concludes only from evidence", () => {
  // A capture that PayPal performed but whose answer we never saw.
  function captureLost(holder: { ctx?: Context }, after: "captured" | "created" | "voided") {
    return {
      async captureAuthorization({ authorizationId }: { authorizationId: string }): Promise<CaptureResult> {
        const auth = holder.ctx?.stub.authorizations.get(authorizationId);
        if (auth) {
          auth.state = after;
          if (after === "captured") auth.captureId = "CAPTURE-LOST";
        }
        return unknown("timeout");
      },
    };
  }

  async function lostCapture(after: "captured" | "created" | "voided") {
    const holder: { ctx?: Context } = {};
    const ctx = await setupGate({ adapter: captureLost(holder, after) });
    holder.ctx = ctx;
    const mandate = await confirmMandate(ctx);
    await ctx.gate.run(inputFor(mandate));
    expect(ctx.gate.getAttempt("a-1")?.status).toBe("write_unknown");
    return { ctx, mandate };
  }

  it("moves a lost capture to captured when PayPal shows it captured", async () => {
    const { ctx } = await lostCapture("captured");
    const writes = writeCalls(ctx);
    const result = await ctx.gate.reconcile("a-1");
    expect(result).toMatchObject({ kind: "ok", outcome: "captured", attempt: { status: "captured" } });
    expect(writeCalls(ctx)).toBe(writes);
    expect(ctx.stub.names().slice(-2)).toEqual(["getAuthorization", "getOrder"]);
    expect(ctx.audit.events.at(-1)).toMatchObject({ type: "reconciled", result: "captured", captureStates: ["completed"] });
  });

  it("keeps the conclusion across a restart", async () => {
    const { ctx } = await lostCapture("captured");
    await ctx.gate.reconcile("a-1");
    expect((await ctx.restart()).getAttempt("a-1")?.status).toBe("captured");
  });

  it("leaves the attempt unknown when PayPal still shows the authorization open", async () => {
    const { ctx } = await lostCapture("created");
    expect(await ctx.gate.reconcile("a-1")).toMatchObject({ outcome: "unchanged", attempt: { status: "write_unknown" } });
    expect(ctx.stub.count("captureAuthorization")).toBe(1);
  });

  it("reports a conflict when PayPal shows it voided although a capture was intended", async () => {
    const { ctx } = await lostCapture("voided");
    expect(await ctx.gate.reconcile("a-1")).toMatchObject({ outcome: "conflict", attempt: { status: "conflict" } });
  });

  it("settles a refused capture from the authorization's real state", async () => {
    const ctx = await setupGate({
      adapter: {
        async captureAuthorization({ authorizationId }): Promise<CaptureResult> {
          const auth = ctx.stub.authorizations.get(authorizationId);
          if (auth) { auth.state = "captured"; auth.captureId = "CAPTURE-EARLIER"; }
          return { kind: "already_terminal", issue: "PREVIOUSLY_CAPTURED", status: 422, debugId: null };
        },
      },
    });
    const mandate = await confirmMandate(ctx);
    await ctx.gate.run(inputFor(mandate));
    expect(ctx.gate.getAttempt("a-1")?.status).toBe("write_refused");
    expect(await ctx.gate.reconcile("a-1")).toMatchObject({ outcome: "captured", attempt: { status: "captured" } });
  });

  it("does not conclude while a capture is still pending", async () => {
    const pendingOrder: GetOrderResult = {
      kind: "ok",
      order: { orderId: "ORDER-a-1", statusRaw: "COMPLETED", state: "completed", authorizations: [], captures: [{ id: "C", statusRaw: "PENDING", state: "pending" }] },
    };
    const holder: { ctx?: Context } = {};
    const ctx = await setupGate({ adapter: { ...captureLost(holder, "captured"), getOrder: async () => pendingOrder } });
    holder.ctx = ctx;
    const mandate = await confirmMandate(ctx);
    await ctx.gate.run(inputFor(mandate));
    expect(await ctx.gate.reconcile("a-1")).toMatchObject({ outcome: "unchanged", attempt: { status: "write_unknown" } });
  });

  describe("a void whose answer was lost", () => {
    async function lostVoid(after: "voided" | "created" | "captured") {
      const holder: { ctx?: Context } = {};
      const ctx = await setupGate({
        adapter: {
          async voidAuthorization({ authorizationId }): Promise<VoidResult> {
            const auth = holder.ctx?.stub.authorizations.get(authorizationId);
            if (auth) auth.state = after;
            return unknown("void_unconfirmed");
          },
        },
      });
      holder.ctx = ctx;
      const mandate = await confirmMandate(ctx);
      await ctx.gate.authorize(inputFor(mandate));
      await ctx.gate.revokeMandate(mandate.id);
      await ctx.gate.settle("a-1");
      expect(ctx.gate.getAttempt("a-1")?.status).toBe("write_unknown");
      return ctx;
    }

    it.each<["voided" | "created" | "captured", string, string]>([
      ["voided", "voided", "voided"],
      ["created", "unchanged", "write_unknown"],
      ["captured", "conflict", "conflict"],
    ])("PayPal shows %s: outcome %s, attempt %s", async (after, outcome, status) => {
      const ctx = await lostVoid(after);
      expect(await ctx.gate.reconcile("a-1")).toMatchObject({ kind: "ok", outcome, attempt: { status } });
      expect(ctx.stub.count("voidAuthorization")).toBe(1);
      expect(ctx.stub.count("captureAuthorization")).toBe(0);
    });
  });

  describe("when there is nothing to reconcile", () => {
    it("does nothing for an attempt that is already settled, still waiting, or never reached PayPal", async () => {
      const ctx = await setupGate();
      const mandate = await confirmMandate(ctx);
      await ctx.gate.authorize(inputFor(mandate, "a-1", { declaredTotalMinor: 100 }));
      await ctx.gate.authorize(inputFor(mandate, "a-2"));
      expect(await ctx.gate.reconcile("a-1")).toMatchObject({ outcome: "not_applicable", attempt: { status: "blocked_precheck" } });
      expect(await ctx.gate.reconcile("a-2")).toMatchObject({ outcome: "not_applicable", attempt: { status: "authorized" } });
      await ctx.gate.settle("a-2");
      expect(await ctx.gate.reconcile("a-2")).toMatchObject({ outcome: "not_applicable", attempt: { status: "captured" } });
      expect(ctx.stub.names()).toEqual(["createVaultOrder", "getAuthorization", "captureAuthorization"]);
    });

    it("cannot look for an order it has no id for", async () => {
      const ctx = await setupGate({ adapter: { createVaultOrder: async () => ({ ...unknown(), orderId: null }) } });
      const mandate = await confirmMandate(ctx);
      await ctx.gate.authorize(inputFor(mandate));
      expect(await ctx.gate.reconcile("a-1")).toMatchObject({ outcome: "not_applicable", attempt: { status: "create_unknown" } });
      expect(ctx.stub.names()).toEqual(["createVaultOrder"]);
    });

    it("refuses an unknown attempt", async () => {
      const ctx = await setupGate();
      expect(await ctx.gate.reconcile("nope")).toEqual({ kind: "refused", reason: "attempt_not_found" });
    });
  });

  describe("when reading fails", () => {
    it.each([
      ["not found", { kind: "not_found" as const }, "authorization_not_found"],
      ["unknown", unknown("server_error"), "reason=server_error status=none"],
      ["rejected", rejected(403), "status=403 error=SYNTHETIC issues=SYNTHETIC_ISSUE"],
      ["not sent", notSent(), "token_unavailable"],
    ])("the authorization read is %s: the attempt is left as it was", async (_label, failure, detail) => {
      const holder: { ctx?: Context } = {};
      const ctx = await setupGate({ adapter: { ...captureLost(holder, "captured") } });
      holder.ctx = ctx;
      const mandate = await confirmMandate(ctx);
      await ctx.gate.run(inputFor(mandate));
      const events = ctx.audit.events.length;

      const stub = createStub({ getAuthorization: async () => failure });
      const other = await createGate({ adapter: stub.adapter, audit: ctx.audit, now: () => T0 });
      expect(await other.reconcile("a-1")).toMatchObject({ kind: "read_failed", detail, attempt: { status: "write_unknown" } });
      expect(ctx.audit.events).toHaveLength(events);
      expect(stub.count("captureAuthorization") + stub.count("voidAuthorization")).toBe(0);
    });

    it("the order read fails for a capture: nothing is concluded", async () => {
      const holder: { ctx?: Context } = {};
      const ctx = await setupGate({ adapter: { ...captureLost(holder, "captured"), getOrder: async () => unknown() } });
      holder.ctx = ctx;
      const mandate = await confirmMandate(ctx);
      await ctx.gate.run(inputFor(mandate));
      expect(await ctx.gate.reconcile("a-1")).toMatchObject({ kind: "read_failed", attempt: { status: "write_unknown" } });
      expect(eventTypes(ctx)).not.toContain("reconciled");
    });
  });

  it("never sends a write, whatever it finds", async () => {
    for (const after of ["captured", "created", "voided"] as const) {
      const { ctx } = await lostCapture(after);
      const writes = writeCalls(ctx);
      await ctx.gate.reconcile("a-1");
      await ctx.gate.reconcile("a-1");
      expect(writeCalls(ctx)).toBe(writes);
    }
  });
});
