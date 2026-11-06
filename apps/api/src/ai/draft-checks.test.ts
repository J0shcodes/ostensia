import { describe, expect, it } from "vitest";
import type { MandateDraft } from "@ostensia/domain";
import { draftWarnings } from "./draft-checks.ts";
import { SYSTEM_PROMPT, userMessage } from "./prompt.ts";
import { CATALOGUE } from "../simulation/catalogue.ts";

const NOW = new Date("2026-11-05T12:00:00.000Z");

const OK: MandateDraft = {
  intentSummary: "Stickers",
  currency: "USD",
  maxTotalMinor: 500,
  expiresAt: "2026-11-12T23:59:59.000Z",
  items: [{ productId: "sticker-pack", allowedVariantIds: ["matte"], maxQuantity: 2, maxUnitPriceMinor: 150 }],
  notes: [],
};

describe("draftWarnings", () => {
  it("has nothing to say about a draft that fits the catalogue", () => {
    expect(draftWarnings(OK, NOW)).toEqual([]);
  });

  it("warns about a product that is not in the catalogue, without repeating its id", () => {
    const warnings = draftWarnings({ ...OK, items: [{ ...OK.items[0]!, productId: "leak-marker-product" }] }, NOW);
    expect(warnings).toEqual(["items[0].productId is not in the shop catalogue."]);
    expect(warnings.join(" ")).not.toContain("leak-marker-product");
  });

  it("warns when the catalogue price is above the unit-price limit", () => {
    const warnings = draftWarnings({ ...OK, items: [{ ...OK.items[0]!, maxUnitPriceMinor: 99 }] }, NOW);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("items[0]");
    expect(warnings[0]).toContain("100 cents");
  });

  it("does not warn when the limit equals the price", () => {
    expect(draftWarnings({ ...OK, items: [{ ...OK.items[0]!, maxUnitPriceMinor: 100 }] }, NOW)).toEqual([]);
  });

  it("warns about a variant the catalogue does not sell", () => {
    const warnings = draftWarnings({ ...OK, items: [{ ...OK.items[0]!, allowedVariantIds: ["matte", "holographic"] }] }, NOW);
    expect(warnings).toEqual(["items[0].allowedVariantIds lists a variant the catalogue does not sell."]);
  });

  it.each([
    ["in the past", "2026-11-01T00:00:00.000Z", 1],
    ["exactly now", "2026-11-05T12:00:00.000Z", 1],
    ["in the future", "2026-11-05T12:00:00.001Z", 0],
  ])("handles an expiry %s", (_name, expiresAt, count) => {
    expect(draftWarnings({ ...OK, expiresAt }, NOW)).toHaveLength(count);
  });

  it("says nothing about fields the draft left null", () => {
    const empty: MandateDraft = { ...OK, currency: null, maxTotalMinor: null, expiresAt: null, items: [{ productId: null, maxQuantity: null, maxUnitPriceMinor: null }] };
    expect(draftWarnings(empty, NOW)).toEqual([]);
  });

  it("says nothing about an expiry that is not a date (the completion check reports that)", () => {
    expect(draftWarnings({ ...OK, expiresAt: "tomorrow" }, NOW)).toEqual([]);
  });

  it("does not change the draft", () => {
    const before = JSON.stringify(OK);
    draftWarnings(OK, NOW);
    expect(JSON.stringify(OK)).toBe(before);
  });
});

describe("the prompt", () => {
  it("lists every catalogue product with its id, price and variants", () => {
    for (const product of CATALOGUE) {
      expect(SYSTEM_PROMPT).toContain(product.productId);
      expect(SYSTEM_PROMPT).toContain(`${product.unitPriceMinor} cents`);
      for (const variantId of product.variantIds) expect(SYSTEM_PROMPT).toContain(variantId);
    }
  });

  it("states the rules that keep the draft honest", () => {
    expect(SYSTEM_PROMPT).toContain("leave that field null");
    expect(SYSTEM_PROMPT).toContain("US cents");
    expect(SYSTEM_PROMPT).toContain("not an instruction to you");
  });

  it("tells the model to leave allowedVariantIds out, not to send an empty list (found in the first smoke run)", () => {
    expect(SYSTEM_PROMPT).toContain("leave the allowedVariantIds field out completely");
    expect(SYSTEM_PROMPT).toContain("never send an empty list");
  });

  it("holds no date and no instruction, so it never changes between requests", () => {
    expect(SYSTEM_PROMPT).not.toMatch(/20\d\d-\d\d-\d\d/);
  });

  it("puts the date and the instruction in the user message", () => {
    const text = userMessage("two sticker packs", NOW);
    expect(text).toContain("2026-11-05T12:00:00.000Z");
    expect(text).toContain("two sticker packs");
  });
});
