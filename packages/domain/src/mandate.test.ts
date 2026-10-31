import { describe, expect, it } from "vitest";
import { ConfirmedMandateSchema, MandateDraftSchema, MandateTermsSchema } from "./mandate.ts";
import { MAX_ITEMS_PER_MANDATE, MAX_QUANTITY } from "./primitives.ts";
import { baseTerms, makeMandate } from "./test-fixtures.ts";

// Builds an invalid mandate by changing a deep copy of a valid one.
function mutated(change: (mandate: any) => void): unknown {
  const mandate = JSON.parse(JSON.stringify(makeMandate()));
  change(mandate);
  return mandate;
}

describe("ConfirmedMandateSchema", () => {
  it("accepts a valid mandate and keeps it unchanged", () => {
    const result = ConfirmedMandateSchema.safeParse(makeMandate());
    expect(result.success).toBe(true);
    expect(result.data).toEqual(makeMandate());
  });

  it("does not add keys for omitted optional fields", () => {
    const parsed = ConfirmedMandateSchema.parse(makeMandate());
    const gloves = parsed.terms.items[1];
    expect(gloves).toBeDefined();
    expect("allowedVariantIds" in (gloves as object)).toBe(false);
  });

  it.each([
    ["an unknown top-level key", (m: any) => (m.extra = 1)],
    ["an unknown key in terms", (m: any) => (m.terms.extra = 1)],
    ["an unknown key in an item", (m: any) => (m.terms.items[0].extra = 1)],
    ["version 2", (m: any) => (m.version = 2)],
    ["a missing hash", (m: any) => delete m.hash],
    ["an uppercase hash", (m: any) => (m.hash = "A".repeat(64))],
    ["a short hash", (m: any) => (m.hash = "a".repeat(63))],
    ["a status that is not confirmed or revoked", (m: any) => (m.status = "pending")],
    ["currency EUR", (m: any) => (m.terms.currency = "EUR")],
    ["lowercase currency", (m: any) => (m.terms.currency = "usd")],
    ["maxTotalMinor 0", (m: any) => (m.terms.maxTotalMinor = 0)],
    ["a fractional maxTotalMinor", (m: any) => (m.terms.maxTotalMinor = 100.5)],
    ["a string maxTotalMinor", (m: any) => (m.terms.maxTotalMinor = "20000")],
    ["no items", (m: any) => (m.terms.items = [])],
    ["too many items", (m: any) => (m.terms.items = Array.from({ length: MAX_ITEMS_PER_MANDATE + 1 }, (_, i) => ({ productId: `p${i}`, maxQuantity: 1, maxUnitPriceMinor: 1 })))],
    ["duplicate productIds", (m: any) => (m.terms.items[1].productId = "jacket")],
    ["an empty allowedVariantIds list", (m: any) => (m.terms.items[0].allowedVariantIds = [])],
    ["duplicate allowedVariantIds", (m: any) => (m.terms.items[0].allowedVariantIds = ["jacket-m", "jacket-m"])],
    ["maxQuantity 0", (m: any) => (m.terms.items[0].maxQuantity = 0)],
    ["maxQuantity above the bound", (m: any) => (m.terms.items[0].maxQuantity = MAX_QUANTITY + 1)],
    ["maxUnitPriceMinor 0", (m: any) => (m.terms.items[0].maxUnitPriceMinor = 0)],
    ["a productId with a space", (m: any) => (m.terms.items[0].productId = "rain jacket")],
    ["an empty productId", (m: any) => (m.terms.items[0].productId = "")],
    ["a non-ASCII productId", (m: any) => (m.terms.items[0].productId = "jäcket")],
    ["an overlong id", (m: any) => (m.id = "a".repeat(129))],
    ["an empty intentSummary", (m: any) => (m.intentSummary = "")],
    ["an expiry with an offset", (m: any) => (m.terms.expiresAt = "2026-11-02T00:00:00+01:00")],
    ["an expiry without a time zone", (m: any) => (m.terms.expiresAt = "2026-11-02T00:00:00")],
    ["a date-only expiry", (m: any) => (m.terms.expiresAt = "2026-11-02")],
    ["an impossible expiry date", (m: any) => (m.terms.expiresAt = "2026-02-30T00:00:00Z")],
    ["a non-date expiry", (m: any) => (m.terms.expiresAt = "tomorrow")],
    ["a numeric expiry", (m: any) => (m.terms.expiresAt = 1793577600000)],
  ])("rejects %s", (_name, change) => {
    expect(ConfirmedMandateSchema.safeParse(mutated(change)).success).toBe(false);
  });

  it("accepts the largest allowed bounds", () => {
    const mandate = makeMandate({
      terms: {
        ...baseTerms(),
        maxTotalMinor: Number.MAX_SAFE_INTEGER,
        items: [{ productId: "p", maxQuantity: MAX_QUANTITY, maxUnitPriceMinor: Number.MAX_SAFE_INTEGER }],
      },
    });
    expect(ConfirmedMandateSchema.safeParse(mandate).success).toBe(true);
  });
});

describe("MandateTermsSchema", () => {
  it("accepts the base terms", () => {
    expect(MandateTermsSchema.safeParse(baseTerms()).success).toBe(true);
  });
});

describe("MandateDraftSchema", () => {
  const draft = {
    intentSummary: "A rain jacket under $80",
    currency: "USD",
    maxTotalMinor: 8000,
    items: [{ productId: "jacket", maxQuantity: 1, maxUnitPriceMinor: 8000 }],
    expiresAt: "2026-11-02T00:00:00Z",
    notes: [],
  };

  it("accepts a complete draft", () => {
    expect(MandateDraftSchema.safeParse(draft).success).toBe(true);
  });

  it("accepts null for every value the instruction did not state", () => {
    const sparse = {
      intentSummary: "Something warm",
      currency: null,
      maxTotalMinor: null,
      items: [{ productId: null, maxQuantity: null, maxUnitPriceMinor: null }],
      expiresAt: null,
      notes: ["No budget was given."],
    };
    expect(MandateDraftSchema.safeParse(sparse).success).toBe(true);
  });

  it.each([
    ["an unknown key", { ...draft, extra: 1 }],
    ["a missing field", { ...draft, notes: undefined }],
    ["currency EUR", { ...draft, currency: "EUR" }],
    ["a negative total", { ...draft, maxTotalMinor: -1 }],
    ["a fractional total", { ...draft, maxTotalMinor: 80.5 }],
    ["too many notes", { ...draft, notes: Array.from({ length: 21 }, () => "x") }],
  ])("rejects %s", (_name, value) => {
    expect(MandateDraftSchema.safeParse(value).success).toBe(false);
  });

  it("is not accepted as a confirmed mandate", () => {
    expect(ConfirmedMandateSchema.safeParse(draft).success).toBe(false);
  });
});
