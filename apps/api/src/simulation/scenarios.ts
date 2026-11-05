import type { ConfirmedMandate, MandateItem, PurchaseLine, PurchaseProposal } from "@ostensia/domain";
import { CATALOGUE } from "./catalogue.ts";
import type { CatalogueProduct } from "./catalogue.ts";

// The simulated shopping agent (D-012). Given a confirmed mandate and the
// synthetic catalogue it builds one proposal for one scenario. It is plain,
// deterministic code: it makes no decision about whether the proposal is allowed.
// The deterministic evaluator in the domain package decides that, as for any
// proposal.
//
// A scenario that cannot be built from this mandate and this catalogue is
// reported as such. The agent never quietly builds a different proposal.

export const SCENARIOS = [
  "compliant",
  "over_unit_price",
  "over_quantity",
  "wrong_variant",
  "unlisted_product",
  "over_total",
] as const;
export type Scenario = (typeof SCENARIOS)[number];

export type ScenarioResult =
  | { readonly kind: "ok"; readonly proposal: PurchaseProposal }
  | { readonly kind: "cannot_build"; readonly reason: string };

type Pair = { readonly item: MandateItem; readonly product: CatalogueProduct };

// Mandate items that are also in the catalogue, in the mandate's order.
function pairs(mandate: ConfirmedMandate): Pair[] {
  const found: Pair[] = [];
  for (const item of mandate.terms.items) {
    const product = CATALOGUE.find((candidate) => candidate.productId === item.productId);
    if (product !== undefined) found.push({ item, product });
  }
  return found;
}

// A variant the mandate allows and the catalogue sells. Without a restriction,
// the first catalogue variant is used.
function allowedVariant(item: MandateItem, product: CatalogueProduct): string | undefined {
  if (item.allowedVariantIds === undefined) return product.variantIds[0];
  return product.variantIds.find((variantId) => item.allowedVariantIds?.includes(variantId));
}

function line(product: CatalogueProduct, variantId: string, quantity: number): PurchaseLine {
  return { productId: product.productId, variantId, quantity, unitPriceMinor: product.unitPriceMinor };
}

// The declared total is always the true total of the lines, so a scenario
// triggers only the violation it is named for (a mismatched declared total is a
// separate rule, TOTAL_MISMATCH).
function proposalOf(mandate: ConfirmedMandate, lines: PurchaseLine[]): PurchaseProposal {
  const total = lines.reduce((sum, each) => sum + each.unitPriceMinor * each.quantity, 0);
  return { mandateId: mandate.id, currency: mandate.terms.currency, declaredTotalMinor: total, lines };
}

const cannot = (reason: string): ScenarioResult => ({ kind: "cannot_build", reason });

export function buildScenario(mandate: ConfirmedMandate, scenario: Scenario): ScenarioResult {
  const candidates = pairs(mandate);
  const { maxTotalMinor } = mandate.terms;

  switch (scenario) {
    case "compliant": {
      for (const { item, product } of candidates) {
        const variantId = allowedVariant(item, product);
        if (variantId === undefined || product.unitPriceMinor > item.maxUnitPriceMinor) continue;
        if (product.unitPriceMinor > maxTotalMinor) continue;
        return { kind: "ok", proposal: proposalOf(mandate, [line(product, variantId, 1)]) };
      }
      return cannot("No catalogue product fits this mandate: its price, variant and total limits all have to allow one unit.");
    }

    case "over_unit_price": {
      for (const { item, product } of candidates) {
        const variantId = allowedVariant(item, product);
        if (variantId === undefined || product.unitPriceMinor <= item.maxUnitPriceMinor) continue;
        return { kind: "ok", proposal: proposalOf(mandate, [line(product, variantId, 1)]) };
      }
      return cannot("Every catalogue product on this mandate is priced within its unit-price limit.");
    }

    case "over_quantity": {
      for (const { item, product } of candidates) {
        const variantId = allowedVariant(item, product);
        if (variantId === undefined || product.unitPriceMinor > item.maxUnitPriceMinor) continue;
        return { kind: "ok", proposal: proposalOf(mandate, [line(product, variantId, item.maxQuantity + 1)]) };
      }
      return cannot("No catalogue product on this mandate can be bought within its unit-price limit.");
    }

    case "wrong_variant": {
      for (const { item, product } of candidates) {
        if (item.allowedVariantIds === undefined) continue;
        const variantId = product.variantIds.find((candidate) => !item.allowedVariantIds?.includes(candidate));
        if (variantId === undefined || product.unitPriceMinor > item.maxUnitPriceMinor) continue;
        return { kind: "ok", proposal: proposalOf(mandate, [line(product, variantId, 1)]) };
      }
      return cannot("No mandate item restricts its variants in a way that leaves a catalogue variant outside the list.");
    }

    case "unlisted_product": {
      const listed = new Set(mandate.terms.items.map((item) => item.productId));
      const product = CATALOGUE.find((candidate) => !listed.has(candidate.productId));
      const variantId = product?.variantIds[0];
      if (product === undefined || variantId === undefined) {
        return cannot("The mandate already lists every catalogue product.");
      }
      return { kind: "ok", proposal: proposalOf(mandate, [line(product, variantId, 1)]) };
    }

    case "over_total": {
      // Each line stays within its own limits, so only the mandate's total is
      // exceeded. Every buildable product is bought at its largest quantity.
      const lines: PurchaseLine[] = [];
      for (const { item, product } of candidates) {
        const variantId = allowedVariant(item, product);
        if (variantId === undefined || product.unitPriceMinor > item.maxUnitPriceMinor) continue;
        lines.push(line(product, variantId, item.maxQuantity));
      }
      const proposal = proposalOf(mandate, lines);
      if (lines.length === 0 || proposal.declaredTotalMinor <= maxTotalMinor) {
        return cannot("Buying every catalogue product on this mandate at its largest quantity does not exceed the total limit.");
      }
      return { kind: "ok", proposal };
    }
  }
}
