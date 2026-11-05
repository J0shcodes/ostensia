import { QuantitySchema } from "@ostensia/domain";
import type { ConfirmedMandate, PurchaseLine, PurchaseProposal } from "@ostensia/domain";
import { CATALOGUE } from "../simulation/catalogue.ts";

// Turns the shopping agent's cart into a purchase proposal (D-025). The agent
// chooses products, variants and quantities. It never states a price: every
// unit price and the total come from the catalogue here, so an agent cannot
// misstate an amount.
//
// A cart that does not fit the shop is invalid and is never corrected. The
// result is an ordinary PurchaseProposal; the gate decides whether it is allowed.

export type CartLine = {
  readonly productId: string;
  readonly variantId: string;
  readonly quantity: number;
};

export type CartResult =
  | { readonly kind: "ok"; readonly proposal: PurchaseProposal }
  | {
      readonly kind: "invalid";
      readonly reason: "empty_cart" | "unknown_product" | "variant_not_sold" | "bad_quantity";
    };

export function buildProposal(mandate: ConfirmedMandate, cart: readonly CartLine[]): CartResult {
  if (cart.length === 0) return { kind: "invalid", reason: "empty_cart" };

  const lines: PurchaseLine[] = [];
  for (const entry of cart) {
    const product = CATALOGUE.find((candidate) => candidate.productId === entry.productId);
    if (product === undefined) return { kind: "invalid", reason: "unknown_product" };
    if (!product.variantIds.includes(entry.variantId)) return { kind: "invalid", reason: "variant_not_sold" };
    if (!QuantitySchema.safeParse(entry.quantity).success) return { kind: "invalid", reason: "bad_quantity" };
    lines.push({
      productId: product.productId,
      variantId: entry.variantId,
      quantity: entry.quantity,
      unitPriceMinor: product.unitPriceMinor,
    });
  }

  const total = lines.reduce((sum, line) => sum + line.unitPriceMinor * line.quantity, 0);
  return {
    kind: "ok",
    proposal: { mandateId: mandate.id, currency: mandate.terms.currency, declaredTotalMinor: total, lines },
  };
}
