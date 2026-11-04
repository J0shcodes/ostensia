import { AUTHORIZATION_STATES } from "@ostensia/domain";
import { describe, expect, it } from "vitest";
import { reconcileOutcome } from "./reconcile-rule.ts";
import type { ReconcileOutcome } from "./reconcile-rule.ts";

// Every combination of intended action and authorization state, written out.
// Only matching evidence settles an attempt; the opposite settlement is a
// conflict; everything else is left for a person.

const EXPECTED: Record<string, Record<string, ReconcileOutcome>> = {
  capture: {
    created: "unchanged",
    captured: "captured",
    partially_captured: "unchanged",
    voided: "conflict",
    denied: "unchanged",
    pending: "unchanged",
    expired: "unchanged",
    unknown: "unchanged",
  },
  void: {
    created: "unchanged",
    captured: "conflict",
    partially_captured: "conflict",
    voided: "voided",
    denied: "unchanged",
    pending: "unchanged",
    expired: "unchanged",
    unknown: "unchanged",
  },
};

describe("reconcileOutcome: the full table", () => {
  it("covers every authorization state", () => {
    for (const action of Object.keys(EXPECTED)) {
      expect(Object.keys(EXPECTED[action] ?? {}).sort()).toEqual([...AUTHORIZATION_STATES].sort());
    }
  });

  for (const action of ["capture", "void"] as const) {
    for (const state of AUTHORIZATION_STATES) {
      it(`intended ${action}, authorization ${state}`, () => {
        expect(reconcileOutcome(action, state, ["completed"])).toBe(EXPECTED[action]?.[state]);
      });
    }
  }

  it("concludes nothing when no action was intended", () => {
    for (const state of AUTHORIZATION_STATES) {
      expect(reconcileOutcome(null, state, ["completed"])).toBe("unchanged");
    }
  });
});

describe("reconcileOutcome: captures", () => {
  it("accepts a captured authorization when every capture is completed", () => {
    expect(reconcileOutcome("capture", "captured", ["completed", "completed"])).toBe("captured");
  });

  it("accepts a captured authorization with no captures listed", () => {
    expect(reconcileOutcome("capture", "captured", [])).toBe("captured");
  });

  it.each([["pending"], ["unknown"], ["declined"]])("does not conclude while a capture is %s", (state) => {
    expect(reconcileOutcome("capture", "captured", ["completed", state])).toBe("unchanged");
  });

  it("ignores capture states for a void", () => {
    expect(reconcileOutcome("void", "voided", ["pending"])).toBe("voided");
  });
});
