import type { MandateDraft } from "@ostensia/domain";
import { CATALOGUE } from "../simulation/catalogue.ts";

// Plain, deterministic checks on an AI draft, shown next to it as warnings. They
// help a person notice a draft that cannot work with the shop's catalogue. They
// never change the draft and never block it: the person decides, and the gate
// enforces the confirmed mandate later.
//
// Ids are not repeated in the text, because they are the model's words.
export function draftWarnings(draft: MandateDraft, now: Date): string[] {
  const warnings: string[] = [];

  draft.items.forEach((item, index) => {
    if (item.productId === null) return;
    const product = CATALOGUE.find((candidate) => candidate.productId === item.productId);
    if (product === undefined) {
      warnings.push(`items[${index}].productId is not in the shop catalogue.`);
      return;
    }
    if (item.maxUnitPriceMinor !== null && product.unitPriceMinor > item.maxUnitPriceMinor) {
      warnings.push(
        `items[${index}]: the catalogue price (${product.unitPriceMinor} cents) is above the unit-price limit, so this item could not be bought.`,
      );
    }
    if (item.allowedVariantIds?.some((variantId) => !product.variantIds.includes(variantId))) {
      warnings.push(`items[${index}].allowedVariantIds lists a variant the catalogue does not sell.`);
    }
  });

  if (draft.expiresAt !== null) {
    const expiry = Date.parse(draft.expiresAt);
    if (!Number.isNaN(expiry) && expiry <= now.getTime()) warnings.push("expiresAt is not in the future.");
  }

  return warnings;
}
