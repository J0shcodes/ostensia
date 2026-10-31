import { describe, expect, it } from "vitest";
import type { Decision, Violation } from "./decision.ts";
import { precheckPurchase } from "./evaluate.ts";
import type { PurchaseLine } from "./purchase.ts";
import { NOW, baseTerms, deepFreeze, makeMandate, makeProposal } from "./test-fixtures.ts";

const MAX = Number.MAX_SAFE_INTEGER;

function violationsOf(decision: Decision): readonly Violation[] {
  if (decision.decision !== "block") throw new Error("expected a block decision");
  return decision.violations;
}

function codesOf(decision: Decision): string[] {
  return decision.decision === "block" ? decision.violations.map((v) => v.code) : [];
}

describe("allow", () => {
  it("allows a compliant purchase and returns the computed total", () => {
    expect(precheckPurchase(makeMandate(), makeProposal(), NOW)).toEqual({
      decision: "allow",
      computedTotalMinor: 9500,
    });
  });

  it("allows a purchase that sits exactly on every limit", () => {
    const mandate = makeMandate({
      terms: {
        ...baseTerms(),
        maxTotalMinor: 9500,
        items: [
          { productId: "jacket", allowedVariantIds: ["jacket-m"], maxQuantity: 1, maxUnitPriceMinor: 7500 },
          { productId: "gloves", maxQuantity: 1, maxUnitPriceMinor: 2000 },
        ],
      },
    });
    expect(precheckPurchase(mandate, makeProposal(), NOW)).toEqual({ decision: "allow", computedTotalMinor: 9500 });
  });

  it("allows a variant from the allowed list, and any variant when no list is set", () => {
    const lines: PurchaseLine[] = [
      { productId: "jacket", variantId: "jacket-l", quantity: 1, unitPriceMinor: 7500 },
      { productId: "gloves", variantId: "blue", quantity: 1, unitPriceMinor: 2000 },
    ];
    expect(precheckPurchase(makeMandate(), makeProposal({ lines }), NOW).decision).toBe("allow");
  });

  it("allows the largest total the schema can represent", () => {
    const mandate = makeMandate({
      terms: { ...baseTerms(), maxTotalMinor: MAX, items: [{ productId: "p", maxQuantity: 1, maxUnitPriceMinor: MAX }] },
    });
    const proposal = makeProposal({
      declaredTotalMinor: MAX,
      lines: [{ productId: "p", quantity: 1, unitPriceMinor: MAX }],
    });
    expect(precheckPurchase(mandate, proposal, NOW)).toEqual({ decision: "allow", computedTotalMinor: MAX });
  });
});

describe("total", () => {
  it("blocks one cent over the maximum total", () => {
    const mandate = makeMandate({ terms: { ...baseTerms(), maxTotalMinor: 9499 } });
    const decision = precheckPurchase(mandate, makeProposal(), NOW);
    expect(violationsOf(decision)).toEqual([{ code: "TOTAL_EXCEEDED", limit: 9499, actual: 9500 }]);
  });

  it("uses the computed total when the declared total is lower", () => {
    const decision = precheckPurchase(makeMandate(), makeProposal({ declaredTotalMinor: 100 }), NOW);
    expect(violationsOf(decision)).toEqual([{ code: "TOTAL_MISMATCH", expected: 9500, actual: 100 }]);
  });

  it("blocks a declared total that is higher than the computed total", () => {
    const decision = precheckPurchase(makeMandate(), makeProposal({ declaredTotalMinor: 9501 }), NOW);
    expect(codesOf(decision)).toEqual(["TOTAL_MISMATCH"]);
  });

  it("reports both rules when an over-limit total is under-declared", () => {
    const mandate = makeMandate({ terms: { ...baseTerms(), maxTotalMinor: 9000 } });
    const decision = precheckPurchase(mandate, makeProposal({ declaredTotalMinor: 100 }), NOW);
    expect(codesOf(decision)).toEqual(["TOTAL_EXCEEDED", "TOTAL_MISMATCH"]);
  });
});

describe("unit price", () => {
  it("blocks one cent over a product's unit price limit", () => {
    const mandate = makeMandate({
      terms: {
        ...baseTerms(),
        items: [
          { productId: "jacket", allowedVariantIds: ["jacket-m"], maxQuantity: 2, maxUnitPriceMinor: 7499 },
          { productId: "gloves", maxQuantity: 3, maxUnitPriceMinor: 2500 },
        ],
      },
    });
    const decision = precheckPurchase(mandate, makeProposal(), NOW);
    expect(violationsOf(decision)).toEqual([
      { code: "UNIT_PRICE_EXCEEDED", productId: "jacket", limit: 7499, actual: 7500 },
    ]);
  });
});

describe("quantity", () => {
  it("allows a quantity exactly at the limit, spread over several lines", () => {
    const lines: PurchaseLine[] = [
      { productId: "gloves", quantity: 1, unitPriceMinor: 1000 },
      { productId: "gloves", quantity: 2, unitPriceMinor: 1000 },
    ];
    expect(precheckPurchase(makeMandate(), makeProposal({ lines, declaredTotalMinor: 3000 }), NOW).decision).toBe(
      "allow",
    );
  });

  it("blocks one over the limit on a single line", () => {
    const lines: PurchaseLine[] = [{ productId: "gloves", quantity: 4, unitPriceMinor: 1000 }];
    const decision = precheckPurchase(makeMandate(), makeProposal({ lines, declaredTotalMinor: 4000 }), NOW);
    expect(violationsOf(decision)).toEqual([{ code: "QUANTITY_EXCEEDED", productId: "gloves", limit: 3, actual: 4 }]);
  });

  it("sums quantity per product, so splitting a product over lines does not get past the limit", () => {
    const lines: PurchaseLine[] = [
      { productId: "jacket", variantId: "jacket-m", quantity: 1, unitPriceMinor: 5000 },
      { productId: "jacket", variantId: "jacket-m", quantity: 1, unitPriceMinor: 5000 },
      { productId: "jacket", variantId: "jacket-l", quantity: 1, unitPriceMinor: 5000 },
    ];
    const decision = precheckPurchase(makeMandate(), makeProposal({ lines, declaredTotalMinor: 15000 }), NOW);
    expect(violationsOf(decision)).toEqual([{ code: "QUANTITY_EXCEEDED", productId: "jacket", limit: 2, actual: 3 }]);
  });

  it("reports one quantity violation per product", () => {
    const lines: PurchaseLine[] = [
      { productId: "gloves", quantity: 2, unitPriceMinor: 100 },
      { productId: "gloves", quantity: 2, unitPriceMinor: 100 },
      { productId: "jacket", variantId: "jacket-m", quantity: 2, unitPriceMinor: 100 },
      { productId: "jacket", variantId: "jacket-m", quantity: 2, unitPriceMinor: 100 },
    ];
    const decision = precheckPurchase(makeMandate(), makeProposal({ lines, declaredTotalMinor: 800 }), NOW);
    expect(codesOf(decision)).toEqual(["QUANTITY_EXCEEDED", "QUANTITY_EXCEEDED"]);
  });
});

describe("products and variants", () => {
  it("blocks a product that is not in the mandate", () => {
    const lines: PurchaseLine[] = [...makeProposal().lines, { productId: "hat", quantity: 1, unitPriceMinor: 100 }];
    const decision = precheckPurchase(makeMandate(), makeProposal({ lines, declaredTotalMinor: 9600 }), NOW);
    expect(violationsOf(decision)).toEqual([{ code: "PRODUCT_NOT_ALLOWED", productId: "hat" }]);
  });

  it("blocks a missing variant when the mandate lists allowed variants", () => {
    const lines: PurchaseLine[] = [{ productId: "jacket", quantity: 1, unitPriceMinor: 7500 }];
    const decision = precheckPurchase(makeMandate(), makeProposal({ lines, declaredTotalMinor: 7500 }), NOW);
    expect(violationsOf(decision)).toEqual([{ code: "VARIANT_NOT_ALLOWED", productId: "jacket" }]);
  });

  it("blocks a variant that is not in the allowed list", () => {
    const lines: PurchaseLine[] = [{ productId: "jacket", variantId: "jacket-xl", quantity: 1, unitPriceMinor: 7500 }];
    const decision = precheckPurchase(makeMandate(), makeProposal({ lines, declaredTotalMinor: 7500 }), NOW);
    expect(violationsOf(decision)).toEqual([
      { code: "VARIANT_NOT_ALLOWED", productId: "jacket", variantId: "jacket-xl" },
    ]);
  });

  it("matches product and variant ids exactly, including case", () => {
    const lines: PurchaseLine[] = [{ productId: "Jacket", variantId: "jacket-m", quantity: 1, unitPriceMinor: 100 }];
    const decision = precheckPurchase(makeMandate(), makeProposal({ lines, declaredTotalMinor: 100 }), NOW);
    expect(codesOf(decision)).toEqual(["PRODUCT_NOT_ALLOWED"]);
  });
});

describe("mandate-level rules", () => {
  it("blocks a revoked mandate", () => {
    const decision = precheckPurchase(makeMandate({ status: "revoked" }), makeProposal(), NOW);
    expect(codesOf(decision)).toEqual(["MANDATE_REVOKED"]);
  });

  it("blocks a proposal that names a different mandate", () => {
    const decision = precheckPurchase(makeMandate(), makeProposal({ mandateId: "mandate-2" }), NOW);
    expect(codesOf(decision)).toEqual(["MANDATE_MISMATCH"]);
  });

  it.each(["EUR", "usd", "USDX"])("blocks currency %s", (currency) => {
    const decision = precheckPurchase(makeMandate(), makeProposal({ currency }), NOW);
    expect(codesOf(decision)).toEqual(["CURRENCY_MISMATCH"]);
  });

  it("blocks an empty purchase", () => {
    const decision = precheckPurchase(makeMandate(), makeProposal({ lines: [], declaredTotalMinor: 0 }), NOW);
    expect(codesOf(decision)).toEqual(["EMPTY_PURCHASE"]);
  });

  it("lists mandate-level violations in a fixed order", () => {
    const decision = precheckPurchase(
      makeMandate({ status: "revoked" }),
      makeProposal({ mandateId: "mandate-2", currency: "EUR", lines: [], declaredTotalMinor: 0 }),
      new Date("2026-11-03T00:00:00.000Z"),
    );
    expect(codesOf(decision)).toEqual([
      "MANDATE_MISMATCH",
      "MANDATE_REVOKED",
      "MANDATE_EXPIRED",
      "CURRENCY_MISMATCH",
      "EMPTY_PURCHASE",
    ]);
  });
});

describe("expiry", () => {
  const expiry = new Date("2026-11-02T00:00:00.000Z");

  it("allows one millisecond before the expiry", () => {
    expect(precheckPurchase(makeMandate(), makeProposal(), new Date(expiry.getTime() - 1)).decision).toBe("allow");
  });

  it("blocks at exactly the expiry", () => {
    expect(codesOf(precheckPurchase(makeMandate(), makeProposal(), expiry))).toEqual(["MANDATE_EXPIRED"]);
  });

  it("blocks after the expiry", () => {
    expect(codesOf(precheckPurchase(makeMandate(), makeProposal(), new Date(expiry.getTime() + 1)))).toEqual([
      "MANDATE_EXPIRED",
    ]);
  });
});

describe("overflow", () => {
  it("blocks when one line's total leaves the safe range", () => {
    const mandate = makeMandate({
      terms: { ...baseTerms(), maxTotalMinor: MAX, items: [{ productId: "p", maxQuantity: 2, maxUnitPriceMinor: MAX }] },
    });
    const proposal = makeProposal({
      declaredTotalMinor: 0,
      lines: [{ productId: "p", quantity: 2, unitPriceMinor: 2 ** 52 }],
    });
    expect(violationsOf(precheckPurchase(mandate, proposal, NOW))).toEqual([{ code: "AMOUNT_OVERFLOW" }]);
  });

  it("blocks when the sum of lines leaves the safe range", () => {
    const mandate = makeMandate({
      terms: { ...baseTerms(), maxTotalMinor: MAX, items: [{ productId: "p", maxQuantity: 2, maxUnitPriceMinor: MAX }] },
    });
    const proposal = makeProposal({
      declaredTotalMinor: 0,
      lines: [
        { productId: "p", quantity: 1, unitPriceMinor: 5_000_000_000_000_000 },
        { productId: "p", quantity: 1, unitPriceMinor: 5_000_000_000_000_000 },
      ],
    });
    expect(violationsOf(precheckPurchase(mandate, proposal, NOW))).toEqual([{ code: "AMOUNT_OVERFLOW" }]);
  });
});

describe("fail closed: invalid input", () => {
  const garbage: [string, unknown][] = [
    ["undefined", undefined],
    ["null", null],
    ["an empty object", {}],
    ["an array", []],
    ["a string", "mandate"],
    ["a number", 42],
    ["a boolean", true],
    ["a function", () => 1],
    ["a symbol", Symbol("x")],
  ];

  it.each(garbage)("blocks a mandate that is %s", (_name, value) => {
    expect(codesOf(precheckPurchase(value, makeProposal(), NOW))).toEqual(["MANDATE_INVALID"]);
  });

  it.each(garbage)("blocks a proposal that is %s", (_name, value) => {
    expect(codesOf(precheckPurchase(makeMandate(), value, NOW))).toEqual(["PROPOSAL_INVALID"]);
  });

  it.each<[string, unknown]>([
    ["undefined", undefined],
    ["null", null],
    ["an ISO string", "2026-11-01T12:00:00Z"],
    ["a timestamp number", NOW.getTime()],
    ["an invalid Date", new Date(Number.NaN)],
    ["a Date lookalike", { getTime: () => NOW.getTime() }],
    ["an empty object", {}],
  ])("blocks a clock that is %s", (_name, value) => {
    expect(codesOf(precheckPurchase(makeMandate(), makeProposal(), value))).toEqual(["CLOCK_INVALID"]);
  });

  it("reports all three kinds of invalid input together", () => {
    expect(codesOf(precheckPurchase(undefined, null, "now"))).toEqual([
      "MANDATE_INVALID",
      "PROPOSAL_INVALID",
      "CLOCK_INVALID",
    ]);
  });

  it("blocks a mandate with an unknown key, even though everything else is valid", () => {
    expect(codesOf(precheckPurchase({ ...makeMandate(), note: "extra" }, makeProposal(), NOW))).toEqual([
      "MANDATE_INVALID",
    ]);
  });

  it("blocks a mandate that is missing its hash", () => {
    const { hash: _hash, ...withoutHash } = makeMandate();
    expect(codesOf(precheckPurchase(withoutHash, makeProposal(), NOW))).toEqual(["MANDATE_INVALID"]);
  });

  it("blocks a proposal that carries a string where a number belongs", () => {
    const proposal = { ...makeProposal(), declaredTotalMinor: "9500" };
    expect(codesOf(precheckPurchase(makeMandate(), proposal, NOW))).toEqual(["PROPOSAL_INVALID"]);
  });

  it("blocks a circular object without throwing", () => {
    const cycle: Record<string, unknown> = {};
    cycle["self"] = cycle;
    expect(codesOf(precheckPurchase(cycle, cycle, NOW))).toEqual(["MANDATE_INVALID", "PROPOSAL_INVALID"]);
  });

  it("never returns allow for any combination of invalid inputs", () => {
    const clocks: unknown[] = [undefined, null, "2026-11-01", Number.NaN, new Date(Number.NaN)];
    for (const mandate of garbage) {
      for (const proposal of garbage) {
        for (const clock of clocks) {
          expect(precheckPurchase(mandate[1], proposal[1], clock).decision).toBe("block");
        }
      }
    }
  });
});

describe("purity", () => {
  it("is deterministic", () => {
    const first = precheckPurchase(makeMandate(), makeProposal({ declaredTotalMinor: 1 }), NOW);
    const second = precheckPurchase(makeMandate(), makeProposal({ declaredTotalMinor: 1 }), NOW);
    expect(second).toEqual(first);
  });

  it("does not change its inputs", () => {
    const mandate = deepFreeze(makeMandate());
    const proposal = deepFreeze(makeProposal({ declaredTotalMinor: 1 }));
    const snapshot = JSON.stringify({ mandate, proposal });
    precheckPurchase(mandate, proposal, NOW);
    expect(JSON.stringify({ mandate, proposal })).toBe(snapshot);
  });
});
