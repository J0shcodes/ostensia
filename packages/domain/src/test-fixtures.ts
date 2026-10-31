// Shared test data. Not exported from index.ts. All ids, prices and hashes are
// synthetic.
import type { ConfirmedMandate, MandateTerms } from "./mandate.ts";
import type { ObservedPayment } from "./observation.ts";
import type { PurchaseProposal } from "./purchase.ts";

export const HASH_A = "a".repeat(64);
export const NOW = new Date("2026-11-01T12:00:00.000Z");

export function baseTerms(): MandateTerms {
  return {
    currency: "USD",
    maxTotalMinor: 20000,
    expiresAt: "2026-11-02T00:00:00.000Z",
    items: [
      { productId: "jacket", allowedVariantIds: ["jacket-m", "jacket-l"], maxQuantity: 2, maxUnitPriceMinor: 8000 },
      { productId: "gloves", maxQuantity: 3, maxUnitPriceMinor: 2500 },
    ],
  };
}

export function makeMandate(overrides: Partial<ConfirmedMandate> = {}): ConfirmedMandate {
  return {
    id: "mandate-1",
    version: 1,
    terms: baseTerms(),
    intentSummary: "Rain jacket and gloves, up to $200",
    confirmedAt: "2026-11-01T10:00:00.000Z",
    status: "confirmed",
    hash: HASH_A,
    ...overrides,
  };
}

// Baseline total: 7500 + 2000 = 9500 cents.
export function makeProposal(overrides: Partial<PurchaseProposal> = {}): PurchaseProposal {
  return {
    mandateId: "mandate-1",
    currency: "USD",
    declaredTotalMinor: 9500,
    lines: [
      { productId: "jacket", variantId: "jacket-m", quantity: 1, unitPriceMinor: 7500 },
      { productId: "gloves", quantity: 1, unitPriceMinor: 2000 },
    ],
    ...overrides,
  };
}

// What PayPal would report for the baseline purchase.
export function makeObservation(overrides: Partial<ObservedPayment> = {}): ObservedPayment {
  return { amountMinor: 9500, currency: "USD", customId: HASH_A, ...overrides };
}

export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
