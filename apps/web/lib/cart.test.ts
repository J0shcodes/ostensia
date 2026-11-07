import { describe, expect, it } from "vitest";
import { describeCart, usd } from "./cart.ts";

const PRODUCTS = [
  { productId: "ceramic-mug", name: "Ceramic mug", unitPriceMinor: 1200, variantIds: ["white", "blue"] },
  { productId: "sticker-pack", name: "Sticker pack", unitPriceMinor: 100, variantIds: ["matte", "gloss"] },
];

const proposal = (lines: { productId: string; variantId?: string; quantity: number; unitPriceMinor: number }[], declaredTotalMinor: number) => ({
  mandateId: "m-1",
  currency: "USD",
  declaredTotalMinor,
  lines,
});

describe("describeCart", () => {
  it("names each line from the catalogue and prices it in whole cents", () => {
    const view = describeCart(
      proposal(
        [
          { productId: "ceramic-mug", variantId: "blue", quantity: 2, unitPriceMinor: 1200 },
          { productId: "sticker-pack", quantity: 3, unitPriceMinor: 100 },
        ],
        2700,
      ),
      PRODUCTS,
    );
    expect(view.lines.map((line) => [line.name, line.variant, line.quantity, line.unitPrice, line.lineTotal])).toEqual([
      ["Ceramic mug", "blue", 2, "$12.00 USD", "$24.00 USD"],
      ["Sticker pack", null, 3, "$1.00 USD", "$3.00 USD"],
    ]);
    expect(view.declaredTotal).toBe("$27.00 USD");
    expect(view.computedTotal).toBe("$27.00 USD");
    expect(view.totalsDisagree).toBe(false);
  });

  it("falls back to the product id for a product the catalogue does not list", () => {
    const view = describeCart(proposal([{ productId: "leather-wallet", quantity: 1, unitPriceMinor: 5000 }], 5000), PRODUCTS);
    expect(view.lines[0]?.name).toBe("leather-wallet");
  });

  it("shows when the declared total and the lines disagree, and does not hide either number", () => {
    const view = describeCart(proposal([{ productId: "sticker-pack", quantity: 2, unitPriceMinor: 100 }], 500), PRODUCTS);
    expect(view.declaredTotal).toBe("$5.00 USD");
    expect(view.computedTotal).toBe("$2.00 USD");
    expect(view.totalsDisagree).toBe(true);
  });

  it("describes an empty cart", () => {
    const view = describeCart(proposal([], 0), PRODUCTS);
    expect(view.lines).toEqual([]);
    expect(view.computedTotal).toBe("$0.00 USD");
    expect(view.totalsDisagree).toBe(false);
  });

  it("never shows a wrong number when a total is too large to compute safely", () => {
    const view = describeCart(proposal([{ productId: "sticker-pack", quantity: 9_000_000_000, unitPriceMinor: 9_000_000_000 }], 5), PRODUCTS);
    expect(view.lines[0]?.lineTotal).toBeNull();
    expect(view.computedTotal).toBeNull();
    expect(view.totalsDisagree).toBe(true);
  });

  it("keeps a unique key for two lines of the same product", () => {
    const view = describeCart(
      proposal(
        [
          { productId: "sticker-pack", variantId: "matte", quantity: 1, unitPriceMinor: 100 },
          { productId: "sticker-pack", variantId: "gloss", quantity: 1, unitPriceMinor: 100 },
        ],
        200,
      ),
      PRODUCTS,
    );
    expect(new Set(view.lines.map((line) => line.key)).size).toBe(2);
  });
});

describe("usd", () => {
  it("writes money as $12.34 USD with thousands separators", () => {
    expect(usd(1234)).toBe("$12.34 USD");
    expect(usd(0)).toBe("$0.00 USD");
    expect(usd(123456789)).toBe("$1,234,567.89 USD");
  });
});
