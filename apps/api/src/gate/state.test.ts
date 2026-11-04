import type { ConfirmedMandate, Decision, PurchaseProposal } from "@ostensia/domain";
import { describe, expect, it } from "vitest";
import { AuditCorruptError } from "./events.ts";
import type { AuditEvent } from "./events.ts";
import { applyEvent, consumesMandate, emptyState, finalizeReplay } from "./state.ts";
import type { AttemptStatus, GateState } from "./state.ts";

const AT = "2026-11-02T12:00:00.000Z";
const HASH = "a".repeat(64);

const MANDATE: ConfirmedMandate = {
  id: "m-1",
  version: 1,
  terms: {
    currency: "USD",
    maxTotalMinor: 20000,
    expiresAt: "2026-11-03T00:00:00.000Z",
    items: [{ productId: "jacket", maxQuantity: 2, maxUnitPriceMinor: 8000 }],
  },
  intentSummary: "A jacket",
  confirmedAt: AT,
  status: "confirmed",
  hash: HASH,
};

const PROPOSAL: PurchaseProposal = {
  mandateId: "m-1",
  currency: "USD",
  declaredTotalMinor: 7200,
  lines: [{ productId: "jacket", quantity: 1, unitPriceMinor: 7200 }],
};

const ALLOW: Decision = { decision: "allow", computedTotalMinor: 7200 };
const BLOCK: Decision = { decision: "block", violations: [{ code: "MANDATE_REVOKED" }] };

const e = {
  mandate: (): AuditEvent => ({ v: 1, at: AT, type: "mandate_created", mandate: MANDATE }),
  started: (): AuditEvent => ({ v: 1, at: AT, type: "attempt_started", attemptId: "a-1", mandateId: "m-1", proposal: PROPOSAL }),
  precheck: (decision: Decision): AuditEvent => ({ v: 1, at: AT, type: "precheck_decided", attemptId: "a-1", decision }),
  orderRequested: (): AuditEvent => ({ v: 1, at: AT, type: "order_requested", attemptId: "a-1" }),
  orderResult: (outcome: "created" | "anomaly" | "rejected" | "unknown" | "not_sent"): AuditEvent => ({
    v: 1,
    at: AT,
    type: "order_result",
    attemptId: "a-1",
    outcome,
    orderId: outcome === "rejected" || outcome === "not_sent" ? null : "o-1",
    authorizationId: outcome === "created" ? "auth-1" : null,
    detail: outcome,
  }),
  writeRequested: (action: "capture" | "void"): AuditEvent => ({ v: 1, at: AT, type: "write_requested", attemptId: "a-1", action }),
  writeResult: (
    action: "capture" | "void",
    outcome: "captured" | "capture_pending" | "voided" | "refused" | "rejected" | "unknown" | "not_sent",
  ): AuditEvent => ({ v: 1, at: AT, type: "write_result", attemptId: "a-1", action, outcome, captureId: outcome === "captured" ? "c-1" : null, detail: outcome }),
};

function replay(...events: AuditEvent[]): GateState {
  const state = emptyState();
  for (const event of events) applyEvent(state, event);
  finalizeReplay(state);
  return state;
}

const statusOf = (state: GateState): AttemptStatus | undefined => state.attempts.get("a-1")?.status;

describe("applyEvent: mandates", () => {
  it("stores a created mandate", () => {
    expect(replay(e.mandate()).mandates.get("m-1")).toEqual(MANDATE);
  });

  it("revoking changes only the status, never the terms or the hash", () => {
    const state = replay(e.mandate(), { v: 1, at: AT, type: "mandate_revoked", mandateId: "m-1" });
    const stored = state.mandates.get("m-1");
    expect(stored?.status).toBe("revoked");
    expect(stored?.terms).toEqual(MANDATE.terms);
    expect(stored?.hash).toBe(HASH);
  });
});

describe("applyEvent: the attempt path", () => {
  it.each<[string, AuditEvent[], AttemptStatus]>([
    ["a started attempt that never finished", [e.mandate(), e.started()], "abandoned"],
    ["a pre-check block", [e.mandate(), e.started(), e.precheck(BLOCK)], "blocked_precheck"],
    ["a pre-check allow that never reached PayPal", [e.mandate(), e.started(), e.precheck(ALLOW)], "abandoned"],
    ["an order request with no result", [e.mandate(), e.started(), e.precheck(ALLOW), e.orderRequested()], "create_unknown"],
    ["a created order", [e.mandate(), e.started(), e.precheck(ALLOW), e.orderRequested(), e.orderResult("created")], "authorized"],
    ["an anomaly", [e.mandate(), e.started(), e.precheck(ALLOW), e.orderRequested(), e.orderResult("anomaly")], "anomaly"],
    ["a rejected order", [e.mandate(), e.started(), e.precheck(ALLOW), e.orderRequested(), e.orderResult("rejected")], "create_rejected"],
    ["a not-sent order", [e.mandate(), e.started(), e.precheck(ALLOW), e.orderRequested(), e.orderResult("not_sent")], "create_rejected"],
    ["an unknown order outcome", [e.mandate(), e.started(), e.precheck(ALLOW), e.orderRequested(), e.orderResult("unknown")], "create_unknown"],
  ])("%s ends as %s", (_label, events, expected) => {
    expect(statusOf(replay(...events))).toBe(expected);
  });

  const authorized = [e.mandate(), e.started(), e.precheck(ALLOW), e.orderRequested(), e.orderResult("created")];

  it.each<[string, AuditEvent[], AttemptStatus]>([
    ["a capture request with no result", [e.writeRequested("capture")], "write_unknown"],
    ["a void request with no result", [e.writeRequested("void")], "write_unknown"],
    ["a captured result", [e.writeRequested("capture"), e.writeResult("capture", "captured")], "captured"],
    ["a pending capture", [e.writeRequested("capture"), e.writeResult("capture", "capture_pending")], "capture_pending"],
    ["a voided result", [e.writeRequested("void"), e.writeResult("void", "voided")], "voided"],
    ["a refused write", [e.writeRequested("capture"), e.writeResult("capture", "refused")], "write_refused"],
    ["a rejected write", [e.writeRequested("capture"), e.writeResult("capture", "rejected")], "write_rejected"],
    ["an unknown write result", [e.writeRequested("void"), e.writeResult("void", "unknown")], "write_unknown"],
    ["a write that was never sent", [e.writeRequested("capture"), e.writeResult("capture", "not_sent")], "authorized"],
  ])("after authorizing, %s ends as %s", (_label, events, expected) => {
    expect(statusOf(replay(...authorized, ...events))).toBe(expected);
  });

  it("remembers the intended action and the capture id", () => {
    const state = replay(...authorized, e.writeRequested("capture"), e.writeResult("capture", "captured"));
    const attempt = state.attempts.get("a-1");
    expect(attempt?.intendedAction).toBe("capture");
    expect(attempt?.captureId).toBe("c-1");
    expect(attempt?.authorizationId).toBe("auth-1");
  });

  it("clears the intended action when a write was never sent", () => {
    const state = replay(...authorized, e.writeRequested("capture"), e.writeResult("capture", "not_sent"));
    expect(state.attempts.get("a-1")?.intendedAction).toBeNull();
  });

  it("an integrity failure at authorize ends the attempt; at settle it only records the decision", () => {
    const decision: Decision = { decision: "block", violations: [{ code: "MANDATE_HASH_MISMATCH" }] };
    const atAuthorize = replay(e.mandate(), e.started(), { v: 1, at: AT, type: "integrity_failed", attemptId: "a-1", stage: "authorize", decision });
    expect(statusOf(atAuthorize)).toBe("integrity_failed");
    const atSettle = replay(...authorized, { v: 1, at: AT, type: "integrity_failed", attemptId: "a-1", stage: "settle", decision });
    expect(statusOf(atSettle)).toBe("authorized");
    expect(atSettle.attempts.get("a-1")?.finalDecision).toEqual(decision);
  });

  it("no_action ends the attempt", () => {
    const state = replay(...authorized, { v: 1, at: AT, type: "no_action", attemptId: "a-1", authorizationState: "captured" });
    expect(statusOf(state)).toBe("no_action");
  });
});

describe("applyEvent: reconciled", () => {
  const unknownWrite = [
    e.mandate(),
    e.started(),
    e.precheck(ALLOW),
    e.orderRequested(),
    e.orderResult("created"),
    e.writeRequested("capture"),
    e.writeResult("capture", "unknown"),
  ];
  const reconciled = (result: "captured" | "voided" | "conflict" | "unchanged"): AuditEvent => ({
    v: 1,
    at: AT,
    type: "reconciled",
    attemptId: "a-1",
    authorizationState: "captured",
    captureStates: [],
    result,
  });

  it.each<["captured" | "voided" | "conflict", AttemptStatus]>([
    ["captured", "captured"],
    ["voided", "voided"],
    ["conflict", "conflict"],
  ])("a %s result moves the attempt to %s", (result, expected) => {
    expect(statusOf(replay(...unknownWrite, reconciled(result)))).toBe(expected);
  });

  it("an unchanged result leaves the attempt as it was", () => {
    expect(statusOf(replay(...unknownWrite, reconciled("unchanged")))).toBe("write_unknown");
  });

  it("is not undone by the replay clean-up that follows it", () => {
    // write_requested ... reconciled(captured): the request has a result.
    const state = replay(
      e.mandate(), e.started(), e.precheck(ALLOW), e.orderRequested(), e.orderResult("created"),
      e.writeRequested("capture"), reconciled("captured"),
    );
    expect(statusOf(state)).toBe("captured");
  });
});

describe("applyEvent: a log that makes no sense", () => {
  it.each<[string, AuditEvent[]]>([
    ["an attempt for a mandate that was never created", [e.started()]],
    ["a precheck for an attempt that never started", [e.mandate(), e.precheck(ALLOW)]],
    ["an order result for an attempt that never started", [e.mandate(), e.orderResult("created")]],
    ["a write request for an attempt that never started", [e.mandate(), e.writeRequested("capture")]],
    ["a revoke for a mandate that was never created", [{ v: 1, at: AT, type: "mandate_revoked", mandateId: "m-1" }]],
  ])("throws AuditCorruptError for %s", (_label, events) => {
    expect(() => replay(...events)).toThrow(AuditCorruptError);
  });
});

describe("consumesMandate", () => {
  const free: AttemptStatus[] = ["blocked_precheck", "integrity_failed", "create_rejected", "voided", "abandoned"];
  const used: AttemptStatus[] = [
    "started", "prechecked", "creating", "create_unknown", "anomaly", "authorized", "writing", "captured",
    "capture_pending", "write_refused", "write_rejected", "write_unknown", "no_action", "conflict",
  ];

  it.each(free)("%s leaves the mandate free", (status) => {
    expect(consumesMandate(status)).toBe(false);
  });

  it.each(used)("%s uses the mandate up", (status) => {
    expect(consumesMandate(status)).toBe(true);
  });

  it("classifies every status", () => {
    expect(free.length + used.length).toBe(19);
  });
});
