import { describe, expect, it } from "vitest";
import { ConfirmedMandateSchema, precheckPurchase } from "@ostensia/domain";
import type { ConfirmedMandate, ViolationCode } from "@ostensia/domain";
import { hashMandate } from "../mandate-hash.ts";
import { CATALOGUE } from "./catalogue.ts";
import { SCENARIOS, buildScenario } from "./scenarios.ts";
import type { Scenario } from "./scenarios.ts";

// The scenarios are checked against the real evaluator: each must produce
// exactly the outcome it is named for. The agent itself decides nothing.

const NOW = new Date("2026-11-02T12:00:00.000Z");

function mandateOf(terms: Record<string, unknown>): ConfirmedMandate {
  const base = { id: "m-1", version: 1 as const, terms };
  const mandate = ConfirmedMandateSchema.parse({
    ...base,
    intentSummary: "Stickers and a pin",
    confirmedAt: "2026-11-02T11:00:00.000Z",
    status: "confirmed",
    hash: hashMandate(base as ConfirmedMandate),
  });
  return mandate;
}

const TERMS = {
  currency: "USD",
  maxTotalMinor: 250,
  expiresAt: "2026-11-03T00:00:00.000Z",
  items: [
    { productId: "sticker-pack", allowedVariantIds: ["matte"], maxQuantity: 3, maxUnitPriceMinor: 150 },
    { productId: "enamel-pin", maxQuantity: 1, maxUnitPriceMinor: 200 },
  ],
};

const EXPECTED: Record<Exclude<Scenario, "compliant">, ViolationCode> = {
  over_unit_price: "UNIT_PRICE_EXCEEDED",
  over_quantity: "QUANTITY_EXCEEDED",
  wrong_variant: "VARIANT_NOT_ALLOWED",
  unlisted_product: "PRODUCT_NOT_ALLOWED",
  over_total: "TOTAL_EXCEEDED",
};

describe("the synthetic catalogue", () => {
  it("has distinct products whose prices and variants are plausible", () => {
    expect(new Set(CATALOGUE.map((product) => product.productId)).size).toBe(CATALOGUE.length);
    for (const product of CATALOGUE) {
      expect(Number.isInteger(product.unitPriceMinor)).toBe(true);
      expect(product.unitPriceMinor).toBeGreaterThanOrEqual(100);
      expect(product.unitPriceMinor).toBeLessThanOrEqual(1500);
      expect(product.variantIds.length).toBeGreaterThan(0);
    }
  });
});

describe("buildScenario", () => {
  const mandate = mandateOf(TERMS);

  it("lists every scenario once", () => {
    expect(new Set(SCENARIOS).size).toBe(SCENARIOS.length);
  });

  it("builds a compliant proposal that the pre-check allows, for one unit", () => {
    const result = buildScenario(mandate, "compliant");
    if (result.kind !== "ok") throw new Error(result.reason);
    expect(result.proposal.lines).toEqual([
      { productId: "sticker-pack", variantId: "matte", quantity: 1, unitPriceMinor: 100 },
    ]);
    expect(precheckPurchase(mandate, result.proposal, NOW)).toEqual({ decision: "allow", computedTotalMinor: 100 });
  });

  it.each(Object.entries(EXPECTED))("builds %s, which the pre-check blocks with %s", (scenario, code) => {
    const result = buildScenario(mandate, scenario as Scenario);
    if (result.kind !== "ok") throw new Error(result.reason);
    const decision = precheckPurchase(mandate, result.proposal, NOW);
    expect(decision.decision).toBe("block");
    if (decision.decision === "block") expect(decision.violations.map((violation) => violation.code)).toContain(code);
  });

  it("states the true total of the lines in every proposal", () => {
    for (const scenario of SCENARIOS) {
      const result = buildScenario(mandate, scenario);
      if (result.kind !== "ok") throw new Error(result.reason);
      const total = result.proposal.lines.reduce((sum, line) => sum + line.unitPriceMinor * line.quantity, 0);
      expect(result.proposal.declaredTotalMinor).toBe(total);
      expect(result.proposal.mandateId).toBe(mandate.id);
    }
  });

  it("is deterministic", () => {
    for (const scenario of SCENARIOS) {
      expect(buildScenario(mandate, scenario)).toEqual(buildScenario(mandate, scenario));
    }
  });

  it("takes only products and prices from the catalogue", () => {
    for (const scenario of SCENARIOS) {
      const result = buildScenario(mandate, scenario);
      if (result.kind !== "ok") throw new Error(result.reason);
      for (const line of result.proposal.lines) {
        const product = CATALOGUE.find((candidate) => candidate.productId === line.productId);
        expect(product?.unitPriceMinor).toBe(line.unitPriceMinor);
        expect(product?.variantIds).toContain(line.variantId);
      }
    }
  });

  describe("when a scenario cannot be built", () => {
    it("says why instead of building a different proposal", () => {
      const cheapOnly = mandateOf({
        ...TERMS,
        items: [{ productId: "sticker-pack", maxQuantity: 1, maxUnitPriceMinor: 5000 }],
      });
      for (const scenario of ["over_unit_price", "wrong_variant", "over_total"] as const) {
        const result = buildScenario(cheapOnly, scenario);
        expect(result.kind).toBe("cannot_build");
      }
    });

    it("cannot build a compliant purchase when no listed product fits the limits", () => {
      const tooTight = mandateOf({ ...TERMS, items: [{ productId: "sticker-pack", maxQuantity: 1, maxUnitPriceMinor: 50 }] });
      expect(buildScenario(tooTight, "compliant").kind).toBe("cannot_build");
      const noRoom = mandateOf({ ...TERMS, maxTotalMinor: 50 });
      expect(buildScenario(noRoom, "compliant").kind).toBe("cannot_build");
    });

    it("cannot build for a mandate whose products are not in the catalogue", () => {
      const foreign = mandateOf({ ...TERMS, items: [{ productId: "jacket", maxQuantity: 1, maxUnitPriceMinor: 8000 }] });
      for (const scenario of ["compliant", "over_unit_price", "over_quantity", "wrong_variant", "over_total"] as const) {
        expect(buildScenario(foreign, scenario).kind).toBe("cannot_build");
      }
    });

    it("cannot build an unlisted product when the mandate lists the whole catalogue", () => {
      const everything = mandateOf({
        ...TERMS,
        items: CATALOGUE.map((product) => ({ productId: product.productId, maxQuantity: 1, maxUnitPriceMinor: 5000 })),
      });
      expect(buildScenario(everything, "unlisted_product").kind).toBe("cannot_build");
    });
  });
});
