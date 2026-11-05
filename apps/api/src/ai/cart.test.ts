import { describe, expect, it } from "vitest";
import { ConfirmedMandateSchema, PurchaseProposalSchema } from "@ostensia/domain";
import type { ConfirmedMandate } from "@ostensia/domain";
import { hashMandate } from "../mandate-hash.ts";
import { CATALOGUE } from "../simulation/catalogue.ts";
import { buildProposal } from "./cart.ts";
import type { CartLine } from "./cart.ts";

const base = {
  id: "m-1",
  version: 1 as const,
  terms: {
    currency: "USD" as const,
    maxTotalMinor: 1000,
    expiresAt: "2026-11-12T00:00:00.000Z",
    items: [{ productId: "sticker-pack", maxQuantity: 5, maxUnitPriceMinor: 150 }],
  },
};
const MANDATE: ConfirmedMandate = ConfirmedMandateSchema.parse({
  ...base,
  intentSummary: "Stickers",
  confirmedAt: "2026-11-05T00:00:00.000Z",
  status: "confirmed",
  hash: hashMandate(base as ConfirmedMandate),
});

function ok(cart: readonly CartLine[]) {
  const result = buildProposal(MANDATE, cart);
  if (result.kind !== "ok") throw new Error(`expected ok, got ${result.reason}`);
  return result.proposal;
}

describe("buildProposal", () => {
  it("prices every line from the catalogue and totals them itself", () => {
    const proposal = ok([
      { productId: "sticker-pack", variantId: "matte", quantity: 3 },
      { productId: "ceramic-mug", variantId: "blue", quantity: 2 },
    ]);
    expect(proposal).toEqual({
      mandateId: "m-1",
      currency: "USD",
      declaredTotalMinor: 3 * 100 + 2 * 1200,
      lines: [
        { productId: "sticker-pack", variantId: "matte", quantity: 3, unitPriceMinor: 100 },
        { productId: "ceramic-mug", variantId: "blue", quantity: 2, unitPriceMinor: 1200 },
      ],
    });
  });

  it("ignores any price the agent sends", () => {
    const sneaky = [{ productId: "ceramic-mug", variantId: "blue", quantity: 1, unitPriceMinor: 1, priceMinor: 1, total: 1 }];
    const proposal = ok(sneaky);
    expect(proposal.lines).toEqual([{ productId: "ceramic-mug", variantId: "blue", quantity: 1, unitPriceMinor: 1200 }]);
    expect(proposal.declaredTotalMinor).toBe(1200);
  });

  it("produces a proposal the domain accepts, for every product and variant in the catalogue", () => {
    for (const product of CATALOGUE) {
      for (const variantId of product.variantIds) {
        const proposal = ok([{ productId: product.productId, variantId, quantity: 1 }]);
        expect(PurchaseProposalSchema.safeParse(proposal).success).toBe(true);
        expect(proposal.declaredTotalMinor).toBe(product.unitPriceMinor);
      }
    }
  });

  it("keeps two lines for the same product as two lines", () => {
    const proposal = ok([
      { productId: "sticker-pack", variantId: "matte", quantity: 1 },
      { productId: "sticker-pack", variantId: "gloss", quantity: 1 },
    ]);
    expect(proposal.lines).toHaveLength(2);
    expect(proposal.declaredTotalMinor).toBe(200);
  });

  it("does not change the cart it is given", () => {
    const cart = [{ productId: "sticker-pack", variantId: "matte", quantity: 2 }];
    const before = JSON.stringify(cart);
    ok(cart);
    expect(JSON.stringify(cart)).toBe(before);
  });

  describe("a cart that does not fit the shop is invalid and is never corrected", () => {
    it.each([
      ["an empty cart", [], "empty_cart"],
      ["an unknown product", [{ productId: "jacket", variantId: "matte", quantity: 1 }], "unknown_product"],
      ["a variant of another product", [{ productId: "sticker-pack", variantId: "blue", quantity: 1 }], "variant_not_sold"],
      ["an unknown variant", [{ productId: "sticker-pack", variantId: "holographic", quantity: 1 }], "variant_not_sold"],
      ["a quantity of zero", [{ productId: "sticker-pack", variantId: "matte", quantity: 0 }], "bad_quantity"],
      ["a negative quantity", [{ productId: "sticker-pack", variantId: "matte", quantity: -1 }], "bad_quantity"],
      ["a fractional quantity", [{ productId: "sticker-pack", variantId: "matte", quantity: 1.5 }], "bad_quantity"],
      ["a quantity above the bound", [{ productId: "sticker-pack", variantId: "matte", quantity: 1_000_001 }], "bad_quantity"],
      ["a quantity that is not a number", [{ productId: "sticker-pack", variantId: "matte", quantity: "2" as unknown as number }], "bad_quantity"],
    ])("%s", (_name, cart, reason) => {
      expect(buildProposal(MANDATE, cart)).toEqual({ kind: "invalid", reason });
    });

    it("rejects the whole cart when one line is bad", () => {
      const result = buildProposal(MANDATE, [
        { productId: "sticker-pack", variantId: "matte", quantity: 1 },
        { productId: "ceramic-mug", variantId: "matte", quantity: 1 },
      ]);
      expect(result).toEqual({ kind: "invalid", reason: "variant_not_sold" });
    });
  });
});
