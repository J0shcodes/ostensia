import { describe, expect, it } from "vitest";
import type { Decision } from "./decision.ts";
import { VIOLATION_CODES } from "./decision.ts";
import { nextPaymentAction } from "./payment-action.ts";
import type { PaymentAction } from "./payment-action.ts";
import { AUTHORIZATION_STATES } from "./paypal-status.ts";
import type { AuthorizationState } from "./paypal-status.ts";

const ALLOW: Decision = { decision: "allow", computedTotalMinor: 9500 };
const BLOCK: Decision = { decision: "block", violations: [{ code: "MANDATE_REVOKED" }] };

// Only "created" permits a write. This is the table from D-007, written out
// for every combination of decision kind and authorization state.
function expectedAction(kind: "allow" | "block" | "malformed", state: AuthorizationState): PaymentAction {
  if (state !== "created") return "none";
  if (kind === "allow") return "capture";
  if (kind === "block") return "void";
  return "none";
}

describe("nextPaymentAction: the full table", () => {
  const decisions = [
    ["allow", ALLOW],
    ["block", BLOCK],
    ["malformed", { decision: "maybe" }],
  ] as const;

  const cases = decisions.flatMap(([kind, decision]) =>
    AUTHORIZATION_STATES.map((state) => [kind, state, decision] as const),
  );

  it("covers 3 decision kinds times 8 authorization states", () => {
    expect(AUTHORIZATION_STATES).toHaveLength(8);
    expect(cases).toHaveLength(24);
  });

  it.each(cases)("%s decision with authorization %s", (kind, state, decision) => {
    expect(nextPaymentAction(decision, state)).toBe(expectedAction(kind, state));
  });

  it("captures only for an allow with a created authorization", () => {
    expect(nextPaymentAction(ALLOW, "created")).toBe("capture");
  });

  it("voids only for a block with a created authorization", () => {
    expect(nextPaymentAction(BLOCK, "created")).toBe("void");
  });
});

describe("nextPaymentAction: a decision it does not understand", () => {
  const malformed: [string, unknown][] = [
    ["undefined", undefined],
    ["null", null],
    ["a string", "allow"],
    ["a number", 1],
    ["an empty object", {}],
    ["an unknown decision word", { decision: "maybe" }],
    ["an upper-case decision word", { decision: "ALLOW", computedTotalMinor: 9500 }],
    ["an allow with no total", { decision: "allow" }],
    ["an allow with a negative total", { decision: "allow", computedTotalMinor: -1 }],
    ["an allow with a fractional total", { decision: "allow", computedTotalMinor: 95.5 }],
    ["an allow with a string total", { decision: "allow", computedTotalMinor: "9500" }],
    ["an allow with a NaN total", { decision: "allow", computedTotalMinor: Number.NaN }],
    ["an allow with an infinite total", { decision: "allow", computedTotalMinor: Number.POSITIVE_INFINITY }],
    ["an allow with an extra key", { decision: "allow", computedTotalMinor: 9500, violations: [] }],
    ["a block with no violations", { decision: "block", violations: [] }],
    ["a block with no violations key", { decision: "block" }],
    ["a block whose violations is not a list", { decision: "block", violations: "MANDATE_REVOKED" }],
    ["a block with an unknown code", { decision: "block", violations: [{ code: "SOMETHING_NEW" }] }],
    ["a block with a lower-case code", { decision: "block", violations: [{ code: "mandate_revoked" }] }],
    ["a block with a violation that has an extra key", { decision: "block", violations: [{ code: "MANDATE_REVOKED", x: 1 }] }],
    ["a block with a null violation", { decision: "block", violations: [null] }],
    ["a block with an extra key", { decision: "block", violations: [{ code: "MANDATE_REVOKED" }], computedTotalMinor: 1 }],
    ["an array", [ALLOW]],
  ];

  it.each(malformed)("does nothing for %s, whatever the authorization", (_label, decision) => {
    for (const state of AUTHORIZATION_STATES) {
      expect(nextPaymentAction(decision, state)).toBe("none");
    }
  });

  it("accepts a block that carries every known violation code and detail field", () => {
    const decision = {
      decision: "block",
      violations: VIOLATION_CODES.map((code) => ({
        code,
        productId: "p",
        variantId: "v",
        limit: 1,
        expected: 2,
        actual: 3,
      })),
    };
    expect(nextPaymentAction(decision, "created")).toBe("void");
  });
});

describe("nextPaymentAction: an authorization it does not understand", () => {
  const notCreated: [string, unknown][] = [
    ["undefined", undefined],
    ["null", null],
    ["the raw PayPal string", "CREATED"],
    ["a different case", "Created"],
    ["surrounding whitespace", " created"],
    ["an empty string", ""],
    ["a number", 1],
    ["an object", { state: "created" }],
    ["an array", ["created"]],
    ["unknown", "unknown"],
  ];

  it.each(notCreated)("does nothing for %s", (_label, authorization) => {
    expect(nextPaymentAction(ALLOW, authorization)).toBe("none");
    expect(nextPaymentAction(BLOCK, authorization)).toBe("none");
  });
});

describe("nextPaymentAction: purity", () => {
  it("does not modify a frozen decision and gives the same answer twice", () => {
    const decision = Object.freeze({
      decision: "block",
      violations: Object.freeze([Object.freeze({ code: "MANDATE_REVOKED" })]),
    });
    expect(nextPaymentAction(decision, "created")).toBe("void");
    expect(nextPaymentAction(decision, "created")).toBe("void");
  });
});
