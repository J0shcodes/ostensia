import { describe, expect, it } from "vitest";
import { ATTEMPT_STATUSES } from "./api-types.ts";
import type { AttemptEventSummary, AttemptStatus } from "./api-types.ts";
import { RECONCILE_TEXT, STATUS_PRESENTATION, paypalWasCalled, presentStatus, reachedPayPal, unsentNotice } from "./attempt-status.ts";

const event = (type: string, outcome: string | null = null, detail: string | null = null): AttemptEventSummary => ({ type, outcome, detail });
const at = (status: AttemptStatus) => ({ status });

describe("the status table", () => {
  it("has a presentation for every status the gate can produce, and no other", () => {
    expect(Object.keys(STATUS_PRESENTATION).sort()).toEqual([...ATTEMPT_STATUSES].sort());
  });

  it("gives every status a label and a line, so none is shown blank", () => {
    for (const status of ATTEMPT_STATUSES) {
      const shown = presentStatus(status);
      expect(shown.label.trim(), status).not.toBe("");
      expect(shown.line.trim(), status).not.toBe("");
    }
  });

  it("offers settle and revoke only while funds are on hold", () => {
    const withSettle = ATTEMPT_STATUSES.filter((status) => presentStatus(status).actions.includes("settle"));
    const withRevoke = ATTEMPT_STATUSES.filter((status) => presentStatus(status).actions.includes("revoke"));
    expect(withSettle).toEqual(["authorized"]);
    expect(withRevoke).toEqual(["authorized"]);
  });

  it("offers reconcile for exactly the statuses the API reconciles", () => {
    // apps/api/src/gate/gate.ts: write_unknown, capture_pending and write_refused.
    const withReconcile = ATTEMPT_STATUSES.filter((status) => presentStatus(status).actions.includes("reconcile"));
    expect(withReconcile.sort()).toEqual(["capture_pending", "write_refused", "write_unknown"]);
  });

  it("offers nothing for the four statuses the API gives no way forward from (TD-034)", () => {
    for (const status of ["create_unknown", "anomaly", "write_rejected", "conflict"] as const) {
      expect(presentStatus(status).actions, status).toEqual([]);
    }
  });

  it("never shows an unknown outcome as a failure", () => {
    for (const status of ["create_unknown", "write_unknown"] as const) {
      expect(presentStatus(status).tone, status).toBe("warning");
      expect(presentStatus(status).line.toLowerCase(), status).not.toMatch(/failed|rejected/);
    }
  });

  it("uses the approved hold, capture and void wording and never promises an immediate release", () => {
    expect(presentStatus("authorized").line).toBe("PayPal authorized the payment: the buyer's funds are on hold; no money has moved.");
    expect(presentStatus("captured").line).toBe("Payment captured in PayPal Sandbox.");
    expect(presentStatus("voided").line).toContain("When the hold leaves the buyer's balance is up to PayPal.");
    for (const status of ATTEMPT_STATUSES) expect(presentStatus(status).line.toLowerCase(), status).not.toMatch(/released immediately|refunded|funds returned/);
  });
});

describe("whether PayPal was reached", () => {
  it("is no for the statuses the gate reaches without a PayPal call", () => {
    for (const status of ["started", "prechecked", "blocked_precheck", "integrity_failed", "abandoned"] as const) {
      expect(reachedPayPal(status), status).toBe(false);
      expect(paypalWasCalled(at(status), [event("order_result", "created")]), status).toBe(false);
    }
  });

  it("is yes for a created order, a read of the authorization and a write", () => {
    expect(paypalWasCalled(at("authorized"), [event("order_requested"), event("order_result", "created")])).toBe(true);
    expect(paypalWasCalled(at("voided"), [event("authorization_read"), event("write_result", "voided")])).toBe(true);
    expect(paypalWasCalled(at("write_unknown"), [event("write_result", "unknown")])).toBe(true);
    expect(paypalWasCalled(at("create_rejected"), [event("order_result", "rejected")])).toBe(true);
  });

  it("is no when the only request never left (no token, nothing payable)", () => {
    expect(paypalWasCalled(at("create_rejected"), [event("order_requested"), event("order_result", "not_sent")])).toBe(false);
  });

  it("treats a read that failed before a token as not called, and other failed reads as called", () => {
    expect(paypalWasCalled(at("authorized"), [event("order_result", "created"), event("settle_read_failed", null, "token_rejected")])).toBe(true);
    expect(paypalWasCalled(at("authorized"), [event("settle_read_failed", null, "token_rejected")])).toBe(false);
    expect(paypalWasCalled(at("authorized"), [event("settle_read_failed", null, "reason=timeout status=none")])).toBe(true);
  });

  it("is cautious without events: a status past the gate's own checks counts as reached", () => {
    expect(paypalWasCalled(at("captured"), null)).toBe(true);
    expect(paypalWasCalled(at("blocked_precheck"), null)).toBe(false);
  });
});

describe("a request that went nowhere while funds are on hold", () => {
  it("explains a settle whose read of the authorization failed", () => {
    const events = [event("order_result", "created"), event("settle_read_failed", null, "reason=timeout")];
    expect(unsentNotice(at("authorized"), events)).toMatch(/could not read the authorization/);
  });

  it("explains a write that was never sent", () => {
    const events = [event("authorization_read"), event("final_decided"), event("write_requested"), event("write_result", "not_sent")];
    expect(unsentNotice(at("authorized"), events)).toMatch(/could not send the request/);
  });

  it("says nothing when the latest event is an ordinary one, or the attempt is not on hold", () => {
    expect(unsentNotice(at("authorized"), [event("order_result", "created")])).toBeNull();
    expect(unsentNotice(at("captured"), [event("write_result", "not_sent")])).toBeNull();
    expect(unsentNotice(at("authorized"), null)).toBeNull();
    expect(unsentNotice(at("authorized"), [])).toBeNull();
  });

  it("looks only at the latest relevant event, so an earlier failure does not linger", () => {
    const events = [event("settle_read_failed", null, "x"), event("authorization_read"), event("final_decided"), event("write_requested"), event("write_result", "captured")];
    expect(unsentNotice(at("authorized"), events)).toBeNull();
  });
});

describe("reading PayPal's record", () => {
  it("has words for every outcome, and conflict asks for a person", () => {
    expect(Object.keys(RECONCILE_TEXT).sort()).toEqual(["captured", "conflict", "not_applicable", "unchanged", "voided"]);
    expect(RECONCILE_TEXT.conflict).toContain("A person needs to look at it.");
  });
});
