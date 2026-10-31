import { describe, expect, it } from "vitest";
import type { ConfirmedMandate, MandateItem } from "./mandate.ts";
import { finalEvaluatePurchase, precheckPurchase } from "./evaluate.ts";
import type { PurchaseLine, PurchaseProposal } from "./purchase.ts";
import { NOW, makeMandate, makeObservation } from "./test-fixtures.ts";

// Differential test: the evaluator is compared with a second, deliberately
// simple implementation that uses BigInt, so it cannot share an overflow or
// rounding mistake with the real one. The cases come from a seeded generator,
// so every run is the same.

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function oracleAllows(mandate: ConfirmedMandate, proposal: PurchaseProposal, nowMs: number): boolean {
  if (proposal.mandateId !== mandate.id) return false;
  if (mandate.status !== "confirmed") return false;
  if (!(Date.parse(mandate.terms.expiresAt) > nowMs)) return false;
  if (proposal.currency !== "USD") return false;
  if (proposal.lines.length === 0) return false;

  let total = 0n;
  const quantities = new Map<string, bigint>();
  for (const line of proposal.lines) {
    const item = mandate.terms.items.find((candidate) => candidate.productId === line.productId);
    if (item === undefined) return false;
    if (item.allowedVariantIds !== undefined) {
      if (line.variantId === undefined || !item.allowedVariantIds.includes(line.variantId)) return false;
    }
    if (BigInt(line.unitPriceMinor) > BigInt(item.maxUnitPriceMinor)) return false;
    quantities.set(line.productId, (quantities.get(line.productId) ?? 0n) + BigInt(line.quantity));
    total += BigInt(line.unitPriceMinor) * BigInt(line.quantity);
  }
  for (const [productId, quantity] of quantities) {
    const item = mandate.terms.items.find((candidate) => candidate.productId === productId);
    if (item === undefined || quantity > BigInt(item.maxQuantity)) return false;
  }
  if (total > MAX_SAFE) return false;
  if (total > BigInt(mandate.terms.maxTotalMinor)) return false;
  return BigInt(proposal.declaredTotalMinor) === total;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Random = () => number;
const int = (rand: Random, min: number, max: number): number => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(rand: Random, values: readonly T[]): T => values[int(rand, 0, values.length - 1)] as T;

function generateCase(rand: Random): { mandate: ConfirmedMandate; proposal: PurchaseProposal } {
  const items: MandateItem[] = ["p1", "p2", "p3"].slice(0, int(rand, 1, 3)).map((productId) => ({
    productId,
    ...(rand() < 0.4 ? { allowedVariantIds: ["v1", "v2"] } : {}),
    maxQuantity: int(rand, 1, 4),
    maxUnitPriceMinor: rand() < 0.05 ? Number.MAX_SAFE_INTEGER : int(rand, 1, 5000),
  }));

  const mandate = makeMandate({
    status: rand() < 0.05 ? "revoked" : "confirmed",
    terms: {
      currency: "USD",
      maxTotalMinor: rand() < 0.05 ? Number.MAX_SAFE_INTEGER : int(rand, 1, 20000),
      expiresAt: rand() < 0.1 ? "2026-10-31T00:00:00.000Z" : "2026-11-02T00:00:00.000Z",
      items,
    },
  });

  const lines: PurchaseLine[] = Array.from({ length: int(rand, 0, 4) }, () => {
    const item = rand() < 0.08 ? undefined : pick(rand, items);
    const productId = item?.productId ?? "zz";
    const variantId =
      item?.allowedVariantIds !== undefined
        ? rand() < 0.8
          ? pick(rand, ["v1", "v2"])
          : pick(rand, [undefined, "v3"])
        : rand() < 0.3
          ? "v1"
          : undefined;
    const maxUnit = item === undefined || item.maxUnitPriceMinor > 1_000_000 ? 5000 : item.maxUnitPriceMinor;
    const unitPriceMinor =
      rand() < 0.05 ? pick(rand, [Number.MAX_SAFE_INTEGER, 2 ** 52, 5_000_000_000_000_000]) : int(rand, 0, maxUnit + 1);
    return {
      productId,
      ...(variantId === undefined ? {} : { variantId }),
      quantity: int(rand, 1, (item?.maxQuantity ?? 4) + 1),
      unitPriceMinor,
    };
  });

  const exactTotal = lines.reduce((sum, line) => sum + BigInt(line.unitPriceMinor) * BigInt(line.quantity), 0n);
  const declaredTotalMinor =
    exactTotal > MAX_SAFE
      ? int(rand, 0, 20000)
      : rand() < 0.85
        ? Number(exactTotal)
        : Math.max(0, Number(exactTotal) + pick(rand, [-1, 1, 100]));

  const proposal: PurchaseProposal = {
    mandateId: rand() < 0.05 ? "other" : "mandate-1",
    currency: rand() < 0.05 ? "EUR" : "USD",
    declaredTotalMinor,
    lines,
  };
  return { mandate, proposal };
}

describe("precheckPurchase against a BigInt reference", () => {
  it("agrees on allow versus block for 2000 seeded cases", () => {
    const rand = mulberry32(20261101);
    let allows = 0;
    let blocks = 0;
    for (let index = 0; index < 2000; index++) {
      const { mandate, proposal } = generateCase(rand);
      const expected = oracleAllows(mandate, proposal, NOW.getTime());
      const actual = precheckPurchase(mandate, proposal, NOW).decision === "allow";
      expect(actual, `case ${index}: ${JSON.stringify({ mandate: mandate.terms, proposal })}`).toBe(expected);
      if (expected) allows++;
      else blocks++;
    }
    // Both outcomes must be common, or the comparison proves little.
    expect(allows).toBeGreaterThan(100);
    expect(blocks).toBeGreaterThan(100);
  });
});

describe("finalEvaluatePurchase against the same reference", () => {
  it("allows exactly when the reference allows and the observation matches, for 2000 seeded cases", () => {
    const rand = mulberry32(20261101);
    let allows = 0;
    for (let index = 0; index < 2000; index++) {
      const { mandate, proposal } = generateCase(rand);
      const expected = oracleAllows(mandate, proposal, NOW.getTime());
      // When the reference allows, the declared total equals the exact total,
      // so it is also the amount PayPal should report.
      const matching = makeObservation({ amountMinor: proposal.declaredTotalMinor });
      const label = `case ${index}: ${JSON.stringify({ mandate: mandate.terms, proposal })}`;

      expect(finalEvaluatePurchase(mandate, proposal, matching, NOW).decision === "allow", label).toBe(expected);

      if (!expected) continue;
      allows++;
      const mutations = [
        makeObservation({ amountMinor: proposal.declaredTotalMinor + 1 }),
        makeObservation({ amountMinor: proposal.declaredTotalMinor, currency: "EUR" }),
        makeObservation({ amountMinor: proposal.declaredTotalMinor, customId: null }),
        makeObservation({ amountMinor: proposal.declaredTotalMinor, customId: "b".repeat(64) }),
      ];
      for (const mutated of mutations) {
        expect(finalEvaluatePurchase(mandate, proposal, mutated, NOW).decision, label).toBe("block");
      }
    }
    expect(allows).toBeGreaterThan(100);
  });
});
