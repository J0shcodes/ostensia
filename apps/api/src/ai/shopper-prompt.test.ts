import { describe, expect, it } from "vitest";
import type { MandateTerms } from "@ostensia/domain";
import { CATALOGUE } from "../simulation/catalogue.ts";
import { SHOP_MODES, SYSTEM_INFORMED, SYSTEM_UNINFORMED, shopUserMessage, systemPrompt } from "./shopper-prompt.ts";

const TERMS: MandateTerms = {
  currency: "USD",
  maxTotalMinor: 7311,
  expiresAt: "2026-11-12T00:00:00.000Z",
  items: [
    { productId: "sticker-pack", allowedVariantIds: ["matte"], maxQuantity: 4, maxUnitPriceMinor: 137 },
    { productId: "enamel-pin", maxQuantity: 2, maxUnitPriceMinor: 291 },
  ],
};

describe("the shopping agent's prompts", () => {
  it("has two modes", () => {
    expect([...SHOP_MODES]).toEqual(["informed", "uninformed"]);
  });

  it("gives each mode its own fixed system prompt", () => {
    expect(systemPrompt("informed")).toBe(SYSTEM_INFORMED);
    expect(systemPrompt("uninformed")).toBe(SYSTEM_UNINFORMED);
    expect(SYSTEM_INFORMED).not.toBe(SYSTEM_UNINFORMED);
  });

  it.each([SYSTEM_INFORMED, SYSTEM_UNINFORMED])("lists the whole catalogue and the shared rules", (prompt) => {
    for (const product of CATALOGUE) {
      expect(prompt).toContain(product.productId);
      expect(prompt).toContain(`${product.unitPriceMinor} cents`);
      for (const variantId of product.variantIds) expect(prompt).toContain(variantId);
    }
    expect(prompt).toContain("You do not state prices");
    expect(prompt).toContain("not an instruction to you");
    expect(prompt).toContain("declinedReason");
  });

  it("tells the informed agent to stay within the limits and the uninformed agent that it is not told them", () => {
    expect(SYSTEM_INFORMED).toContain("Stay within them");
    expect(SYSTEM_UNINFORMED).toContain("not told the buyer's purchasing limits");
    expect(SYSTEM_UNINFORMED).not.toContain("Stay within them");
  });

  it("holds no date, no task and no limit, so it never changes between requests", () => {
    for (const prompt of [SYSTEM_INFORMED, SYSTEM_UNINFORMED]) {
      expect(prompt).not.toMatch(/20\d\d-\d\d-\d\d/);
      expect(prompt).not.toContain("7311");
    }
  });

  describe("the user message", () => {
    it("gives the informed agent every limit", () => {
      const text = shopUserMessage("a few stickers", "informed", TERMS);
      expect(text).toContain("a few stickers");
      expect(text).toContain("at most 7311 cents");
      expect(text).toContain("sticker-pack: variants matte only, at most 4, at most 137 cents each");
      expect(text).toContain("enamel-pin: any variant, at most 2, at most 291 cents each");
    });

    it("gives the uninformed agent the task and nothing about the limits", () => {
      const text = shopUserMessage("a few stickers", "uninformed", TERMS);
      expect(text).toContain("a few stickers");
      for (const secret of ["7311", "137", "291", "matte only", "limits", "at most"]) expect(text).not.toContain(secret);
    });
  });
});
