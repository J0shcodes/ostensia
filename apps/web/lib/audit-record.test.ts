import { describe, expect, it } from "vitest";
import type { AttemptEnvelope, AttemptEventSummary } from "./api-types.ts";
import { AUDIT_WORDING, buildAuditRecord } from "./audit-record.ts";

const AT = "2026-11-07T14:03:21.000Z";
const NO_EXPLANATION: AttemptEnvelope["explanation"] = { precheck: null, final: null };

const event = (type: string, extra: Partial<AttemptEventSummary> = {}): AttemptEventSummary => ({
  type,
  outcome: null,
  detail: null,
  at: AT,
  ...extra,
});

const only = (e: AttemptEventSummary, explanation: AttemptEnvelope["explanation"] = NO_EXPLANATION) => {
  const entries = buildAuditRecord([e], explanation);
  expect(entries).toHaveLength(1);
  const entry = entries[0];
  if (entry === undefined) throw new Error("no entry");
  return entry;
};

describe("the audit record", () => {
  it("keeps the order of the log and shows every event, with its time", () => {
    const events = [event("attempt_started"), event("order_requested", { at: "2026-11-07T14:03:22.000Z" }), event("no_action", { authorizationState: "voided", at: "2026-11-07T14:03:19.000Z" })];
    const entries = buildAuditRecord(events, NO_EXPLANATION);
    expect(entries.map((entry) => entry.wording)).toEqual(["attempt_started", "order_requested", "no_action"]);
    // The log is not sorted by the page, even when the times are not in order.
    expect(entries.map((entry) => entry.at)).toEqual([AT, "2026-11-07T14:03:22.000Z", "2026-11-07T14:03:19.000Z"]);
  });

  it("shows an empty record as an empty list", () => {
    expect(buildAuditRecord([], NO_EXPLANATION)).toEqual([]);
  });

  it("says an event with no time has no time", () => {
    const { at: _at, ...withoutTime } = event("attempt_started");
    expect(only(withoutTime).at).toBeNull();
  });

  describe("decisions", () => {
    it.each([
      ["precheck_decided", "allow", "Pre-check: allowed"],
      ["precheck_decided", "block", "Pre-check: blocked"],
      ["final_decided", "allow", "Final check: allowed"],
      ["final_decided", "block", "Final check: blocked"],
    ] as const)("%s with %s is titled %s and comes from Ostensia", (type, decision, title) => {
      const entry = only(event(type, { decision }));
      expect(entry.title).toBe(title);
      expect(entry.source).toBe("ostensia");
    });

    it("attaches the API's explanation to the latest pre-check and the latest final check only", () => {
      const events = [
        event("attempt_started"),
        event("precheck_decided", { decision: "allow" }),
        event("final_decided", { decision: "allow" }),
        event("final_decided", { decision: "block" }),
      ];
      const entries = buildAuditRecord(events, { precheck: ["Within the mandate."], final: ["The mandate was revoked."] });
      expect(entries.map((entry) => entry.explanation)).toEqual([null, ["Within the mandate."], null, ["The mandate was revoked."]]);
    });

    it("attaches nothing when the API sent no words", () => {
      expect(only(event("precheck_decided", { decision: "allow" }), { precheck: [], final: null }).explanation).toBeNull();
    });

    it("reports a decision without an outcome as unrecognised, not as allowed or blocked", () => {
      expect(only(event("precheck_decided")).wording).toBe("unknown");
    });
  });

  describe("PayPal requests", () => {
    it("describes a request recorded before it was sent as Ostensia's own record", () => {
      expect(only(event("order_requested"))).toMatchObject({ source: "ostensia", title: "About to create the PayPal order" });
      expect(only(event("write_requested", { action: "capture" }))).toMatchObject({ source: "ostensia", title: "About to capture" });
      expect(only(event("write_requested", { action: "void" }))).toMatchObject({ source: "ostensia", title: "About to void" });
    });

    it.each([
      ["created", "paypal", "Order created"],
      ["anomaly", "paypal", "Order needs a person"],
      ["rejected", "paypal", "Order refused"],
      ["unknown", "paypal", "No answer to the order request"],
      ["not_sent", "ostensia", "Order not sent"],
    ] as const)("an order that ended %s is from %s: %s", (outcome, source, title) => {
      expect(only(event("order_result", { outcome }))).toMatchObject({ source, title });
    });

    it("lists the order and authorization ids with a Copy control", () => {
      const entry = only(event("order_result", { outcome: "created", orderId: "ORDER1234567", authorizationId: "AUTH1234567" }));
      expect(entry.facts).toEqual([
        { label: "Order ID", value: "ORDER1234567", copy: true },
        { label: "Authorization ID", value: "AUTH1234567", copy: true },
      ]);
    });

    it("leaves out an id that was not returned", () => {
      expect(only(event("order_result", { outcome: "rejected", orderId: null, authorizationId: null })).facts).toEqual([]);
    });

    it.each([
      ["captured", "capture", "paypal", "Captured"],
      ["capture_pending", "capture", "paypal", "Capture pending"],
      ["voided", "void", "paypal", "Voided"],
      ["refused", "void", "paypal", "Already settled"],
      ["rejected", "capture", "paypal", "Rejected by PayPal"],
      ["unknown", "capture", "paypal", "No answer to the capture request"],
      ["unknown", "void", "paypal", "No answer to the void request"],
      ["not_sent", "capture", "ostensia", "Capture not sent"],
      ["not_sent", "void", "ostensia", "Void not sent"],
    ] as const)("a write that ended %s (%s) is from %s: %s", (outcome, action, source, title) => {
      expect(only(event("write_result", { outcome, action }))).toMatchObject({ source, title });
    });

    it("lists the capture id", () => {
      expect(only(event("write_result", { outcome: "captured", action: "capture", captureId: "CAP12345678" })).facts).toEqual([
        { label: "Capture ID", value: "CAP12345678", copy: true },
      ]);
    });

    it("shows the gate's detail exactly as written, and nothing when there is none", () => {
      expect(only(event("write_result", { outcome: "rejected", action: "capture", detail: "http_422: INSTRUMENT_DECLINED" })).detail).toBe("http_422: INSTRUMENT_DECLINED");
      expect(only(event("write_result", { outcome: "captured", action: "capture", detail: "" })).detail).toBeNull();
    });

    it("does not give a write result without an action a title that names one", () => {
      expect(only(event("write_result", { outcome: "captured" })).wording).toBe("unknown");
    });
  });

  describe("reading the authorization", () => {
    it("shows what PayPal reported, the amount, and the reference that was stored with the payment", () => {
      const entry = only(
        event("authorization_read", { authorization: { statusRaw: "CREATED", amountMinor: 950, customId: "ostensia:abc123" } }),
      );
      expect(entry).toMatchObject({ source: "paypal", title: "Authorization read", line: "PayPal reports the authorization as CREATED." });
      expect(entry.facts).toEqual([
        { label: "Amount", value: "$9.50 USD", copy: false },
        { label: "Reference stored with the payment", value: "ostensia:abc123", copy: true },
      ]);
    });

    it("leaves out an amount or a reference that PayPal did not report", () => {
      const entry = only(event("authorization_read", { authorization: { statusRaw: "CREATED", amountMinor: null, customId: null } }));
      expect(entry.facts).toEqual([]);
    });

    it("never says the stored reference proves anything", () => {
      const labels = AUDIT_WORDING["authorization_read"];
      const text = JSON.stringify(labels).toLowerCase();
      expect(text).not.toMatch(/prove|verified|consent|identity/);
    });

    it("reports an authorization read with no facts as unrecognised", () => {
      expect(only(event("authorization_read")).wording).toBe("unknown");
    });

    it("treats a read that failed before reaching PayPal as Ostensia's, and one that failed after as PayPal's", () => {
      expect(only(event("settle_read_failed", { detail: "token_failed" }))).toMatchObject({
        wording: "settle_read_failed:no_access",
        source: "ostensia",
        title: "Could not reach PayPal Sandbox",
      });
      expect(only(event("settle_read_failed", { detail: "http_503" }))).toMatchObject({
        wording: "settle_read_failed",
        source: "paypal",
        title: "Could not read the authorization",
      });
    });

    it("says what the authorization was when nothing was sent", () => {
      expect(only(event("no_action", { authorizationState: "voided" }))).toMatchObject({
        title: "Nothing sent",
        line: "The authorization was voided, so Ostensia sent nothing.",
        source: "ostensia",
      });
    });
  });

  describe("reading PayPal's record again", () => {
    it.each(["captured", "voided", "conflict", "unchanged"])("a %s result is a PayPal read with the approved line", (result) => {
      const entry = only(event("reconciled", { result }));
      expect(entry.source).toBe("paypal");
      expect(entry.title).toBe("PayPal's record read");
      expect(entry.line.length).toBeGreaterThan(10);
      expect(entry.wording).toBe(`reconciled:${result}`);
    });

    it("reports an unfamiliar result as unrecognised", () => {
      expect(only(event("reconciled", { result: "settled" })).wording).toBe("unknown");
    });
  });

  describe("the other records", () => {
    it("describes the start of an attempt and a failed mandate check as Ostensia's own", () => {
      expect(only(event("attempt_started"))).toMatchObject({ source: "ostensia", title: "Attempt started" });
      expect(only(event("integrity_failed", { decision: "block" }))).toMatchObject({ source: "ostensia", title: "Mandate reference check failed" });
    });

    it("shows an event of a kind it does not know, with its type, and gives it no badge", () => {
      const entry = only(event("something_new"));
      expect(entry).toMatchObject({ wording: "unknown", source: "none", title: "Unrecognised event" });
      expect(entry.line).toBe("Ostensia does not know this kind of record: something_new.");
    });

    it("does not hide mandate events, which the API does not send for an attempt but may one day", () => {
      expect(only(event("mandate_revoked")).title).toBe("Unrecognised event");
    });
  });

  describe("the wording table", () => {
    it("has no placeholder the code does not fill in", () => {
      for (const [key, row] of Object.entries(AUDIT_WORDING)) {
        for (const match of `${row.title} ${row.line}`.matchAll(/\{([A-Za-z]+)\}/g)) {
          expect(["status", "state", "action", "Action", "type"], key).toContain(match[1]);
        }
      }
    });

    it("never claims what the guidelines prohibit", () => {
      const text = Object.values(AUDIT_WORDING)
        .map((row) => `${row.title} ${row.line}`)
        .join(" ")
        .toLowerCase();
      expect(text).not.toMatch(/ai approved|ai paid|paypal enforce|production-ready|real money|released immediately|proves/);
    });
  });
});
