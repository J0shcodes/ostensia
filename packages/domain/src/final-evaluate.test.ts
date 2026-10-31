import { describe, expect, it } from "vitest";
import type { Decision, Violation } from "./decision.ts";
import { finalEvaluatePurchase, precheckPurchase } from "./evaluate.ts";
import { HASH_A, NOW, baseTerms, deepFreeze, makeMandate, makeObservation, makeProposal } from "./test-fixtures.ts";

const MAX = Number.MAX_SAFE_INTEGER;

function violationsOf(decision: Decision): readonly Violation[] {
  if (decision.decision !== "block") throw new Error("expected a block decision");
  return decision.violations;
}

function codesOf(decision: Decision): string[] {
  return decision.decision === "block" ? decision.violations.map((v) => v.code) : [];
}

// No default parameter: a default would replace an explicit `undefined` with a
// valid observation and hide the case being tested.
const finalOf = (...args: [observed?: unknown]) =>
  finalEvaluatePurchase(makeMandate(), makeProposal(), args.length === 0 ? makeObservation() : args[0], NOW);

describe("final evaluation: allow", () => {
  it("allows a compliant purchase that PayPal reported correctly", () => {
    expect(finalOf()).toEqual({ decision: "allow", computedTotalMinor: 9500 });
  });

  it("gives the same result as the pre-check when the observation matches", () => {
    expect(finalOf()).toEqual(precheckPurchase(makeMandate(), makeProposal(), NOW));
  });

  it("allows the largest total the schema can represent", () => {
    const mandate = makeMandate({
      terms: { ...baseTerms(), maxTotalMinor: MAX, items: [{ productId: "p", maxQuantity: 1, maxUnitPriceMinor: MAX }] },
    });
    const proposal = makeProposal({
      declaredTotalMinor: MAX,
      lines: [{ productId: "p", quantity: 1, unitPriceMinor: MAX }],
    });
    const observed = makeObservation({ amountMinor: MAX });
    expect(finalEvaluatePurchase(mandate, proposal, observed, NOW)).toEqual({
      decision: "allow",
      computedTotalMinor: MAX,
    });
  });
});

describe("final evaluation: observed amount", () => {
  it("blocks when PayPal reports one cent more", () => {
    const decision = finalOf(makeObservation({ amountMinor: 9501 }));
    expect(violationsOf(decision)).toEqual([{ code: "OBSERVED_AMOUNT_MISMATCH", expected: 9500, actual: 9501 }]);
  });

  it("blocks when PayPal reports one cent less", () => {
    const decision = finalOf(makeObservation({ amountMinor: 9499 }));
    expect(violationsOf(decision)).toEqual([{ code: "OBSERVED_AMOUNT_MISMATCH", expected: 9500, actual: 9499 }]);
  });

  it("compares with the computed total, not the declared one", () => {
    // The declared total is wrong, and PayPal reports the same wrong figure.
    const proposal = makeProposal({ declaredTotalMinor: 100 });
    const decision = finalEvaluatePurchase(makeMandate(), proposal, makeObservation({ amountMinor: 100 }), NOW);
    expect(violationsOf(decision)).toEqual([
      { code: "TOTAL_MISMATCH", expected: 9500, actual: 100 },
      { code: "OBSERVED_AMOUNT_MISMATCH", expected: 9500, actual: 100 },
    ]);
  });

  it("skips the amount comparison when the total overflows, and still blocks", () => {
    const mandate = makeMandate({
      terms: { ...baseTerms(), maxTotalMinor: MAX, items: [{ productId: "p", maxQuantity: 2, maxUnitPriceMinor: MAX }] },
    });
    const proposal = makeProposal({
      declaredTotalMinor: 0,
      lines: [{ productId: "p", quantity: 2, unitPriceMinor: MAX }],
    });
    const decision = finalEvaluatePurchase(mandate, proposal, makeObservation({ amountMinor: MAX }), NOW);
    expect(codesOf(decision)).toEqual(["AMOUNT_OVERFLOW"]);
  });
});

describe("final evaluation: observed currency", () => {
  it.each(["EUR", "usd", "USD ", "Usd"])("blocks the currency %j", (currency) => {
    expect(codesOf(finalOf(makeObservation({ currency })))).toEqual(["OBSERVED_CURRENCY_MISMATCH"]);
  });
});

describe("final evaluation: binding", () => {
  it("blocks when PayPal returned no custom_id", () => {
    expect(codesOf(finalOf(makeObservation({ customId: null })))).toEqual(["BINDING_MISMATCH"]);
  });

  it("blocks an empty custom_id", () => {
    expect(codesOf(finalOf(makeObservation({ customId: "" })))).toEqual(["BINDING_MISMATCH"]);
  });

  it("blocks a custom_id that is one character off", () => {
    expect(codesOf(finalOf(makeObservation({ customId: "a".repeat(63) + "b" })))).toEqual(["BINDING_MISMATCH"]);
  });

  it("compares case-sensitively", () => {
    const mandate = makeMandate({ hash: "ab".repeat(32) });
    const upper = makeObservation({ customId: "AB".repeat(32) });
    expect(codesOf(finalEvaluatePurchase(mandate, makeProposal(), upper, NOW))).toEqual(["BINDING_MISMATCH"]);
    const exact = makeObservation({ customId: "ab".repeat(32) });
    expect(finalEvaluatePurchase(mandate, makeProposal(), exact, NOW).decision).toBe("allow");
  });

  it("does not trim whitespace", () => {
    expect(codesOf(finalOf(makeObservation({ customId: ` ${HASH_A}` })))).toEqual(["BINDING_MISMATCH"]);
  });
});

describe("final evaluation: repeats the pre-check rules", () => {
  it("blocks a mandate revoked after authorization", () => {
    const decision = finalEvaluatePurchase(makeMandate({ status: "revoked" }), makeProposal(), makeObservation(), NOW);
    expect(codesOf(decision)).toEqual(["MANDATE_REVOKED"]);
  });

  it("blocks a mandate that expired between the pre-check and the final evaluation", () => {
    const later = new Date("2026-11-02T00:00:01.000Z");
    expect(precheckPurchase(makeMandate(), makeProposal(), NOW).decision).toBe("allow");
    const decision = finalEvaluatePurchase(makeMandate(), makeProposal(), makeObservation(), later);
    expect(codesOf(decision)).toEqual(["MANDATE_EXPIRED"]);
  });

  it("blocks exactly at the expiry instant", () => {
    const atExpiry = new Date("2026-11-02T00:00:00.000Z");
    const decision = finalEvaluatePurchase(makeMandate(), makeProposal(), makeObservation(), atExpiry);
    expect(codesOf(decision)).toEqual(["MANDATE_EXPIRED"]);
  });

  it("allows one millisecond before expiry", () => {
    const justBefore = new Date("2026-11-01T23:59:59.999Z");
    expect(finalEvaluatePurchase(makeMandate(), makeProposal(), makeObservation(), justBefore).decision).toBe("allow");
  });

  it("lists policy violations before observed violations", () => {
    const mandate = makeMandate({ status: "revoked" });
    const observed = makeObservation({ amountMinor: 1, currency: "EUR", customId: null });
    expect(codesOf(finalEvaluatePurchase(mandate, makeProposal(), observed, NOW))).toEqual([
      "MANDATE_REVOKED",
      "OBSERVED_AMOUNT_MISMATCH",
      "OBSERVED_CURRENCY_MISMATCH",
      "BINDING_MISMATCH",
    ]);
  });
});

describe("final evaluation: invalid input", () => {
  it.each<[string, unknown]>([
    ["undefined", undefined],
    ["null", null],
    ["a string", "95.00"],
    ["an empty object", {}],
    ["a missing customId", { amountMinor: 9500, currency: "USD" }],
    ["a fractional amount", makeObservation({ amountMinor: 95.5 })],
    ["a negative amount", makeObservation({ amountMinor: -1 })],
    ["an amount that is a string", { ...makeObservation(), amountMinor: "9500" }],
    ["a numeric customId", { ...makeObservation(), customId: 123 }],
    ["an empty currency", makeObservation({ currency: "" })],
    ["an unknown key", { ...makeObservation(), extra: true }],
  ])("blocks with OBSERVATION_INVALID for %s", (_label, observed) => {
    expect(violationsOf(finalOf(observed))).toEqual([{ code: "OBSERVATION_INVALID" }]);
  });

  it("reports every kind of invalid input together, in a fixed order", () => {
    const decision = finalEvaluatePurchase(null, null, null, "not a date");
    expect(codesOf(decision)).toEqual(["MANDATE_INVALID", "PROPOSAL_INVALID", "OBSERVATION_INVALID", "CLOCK_INVALID"]);
  });

  it("still reports an invalid mandate when the observation is fine", () => {
    expect(codesOf(finalEvaluatePurchase(null, makeProposal(), makeObservation(), NOW))).toEqual(["MANDATE_INVALID"]);
  });

  it.each<[string, unknown]>([
    ["undefined", undefined],
    ["a number", NOW.getTime()],
    ["an invalid Date", new Date("nope")],
  ])("blocks with CLOCK_INVALID for %s", (_label, now) => {
    expect(codesOf(finalEvaluatePurchase(makeMandate(), makeProposal(), makeObservation(), now))).toEqual([
      "CLOCK_INVALID",
    ]);
  });

  it("does not let the pre-check require an observation", () => {
    expect(precheckPurchase(makeMandate(), makeProposal(), NOW).decision).toBe("allow");
  });
});

describe("final evaluation: purity", () => {
  it("does not modify frozen inputs and returns the same result twice", () => {
    const mandate = deepFreeze(makeMandate());
    const proposal = deepFreeze(makeProposal());
    const observed = deepFreeze(makeObservation({ amountMinor: 1 }));
    const first = finalEvaluatePurchase(mandate, proposal, observed, NOW);
    const second = finalEvaluatePurchase(mandate, proposal, observed, NOW);
    expect(second).toEqual(first);
    expect(first.decision).toBe("block");
  });
});
