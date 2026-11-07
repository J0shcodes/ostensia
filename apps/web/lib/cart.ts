import { formatUsd } from "@ostensia/domain";
import type { PurchaseProposal } from "@ostensia/domain";
import type { CatalogueProduct } from "./api-types.ts";

// A cart in words a person reads. Nothing here decides anything: the gate checks the
// proposal against the mandate. This only says what is in it, so the person can see it
// before and after the check.

export type CartLine = {
  readonly key: string;
  readonly name: string;
  readonly variant: string | null;
  readonly quantity: number;
  readonly unitPrice: string;
  // null when the amount is not a safe integer, so a wrong number is never shown.
  readonly lineTotal: string | null;
};

export type CartView = {
  readonly lines: readonly CartLine[];
  // The total the proposal declares.
  readonly declaredTotal: string;
  // The total of its lines, computed here. null if it cannot be computed safely.
  readonly computedTotal: string | null;
  // True when the declared total and the lines disagree. The gate blocks such a cart
  // (TOTAL_MISMATCH), so the page shows the difference and does not hide it.
  readonly totalsDisagree: boolean;
};

export const usd = (minor: number): string => `${formatUsd(minor)} USD`;

export function describeCart(proposal: PurchaseProposal, products: readonly CatalogueProduct[]): CartView {
  let computed: number | null = 0;
  const lines: CartLine[] = proposal.lines.map((line, index) => {
    const name = products.find((product) => product.productId === line.productId)?.name ?? line.productId;
    const total = line.quantity * line.unitPriceMinor;
    const safe = Number.isSafeInteger(total) ? total : null;
    computed = computed === null || safe === null || !Number.isSafeInteger(computed + safe) ? null : computed + safe;
    return {
      key: `${index}-${line.productId}-${line.variantId ?? ""}`,
      name,
      variant: line.variantId ?? null,
      quantity: line.quantity,
      unitPrice: usd(line.unitPriceMinor),
      lineTotal: safe === null ? null : usd(safe),
    };
  });
  return {
    lines,
    declaredTotal: usd(proposal.declaredTotalMinor),
    computedTotal: computed === null ? null : usd(computed),
    totalsDisagree: computed === null || computed !== proposal.declaredTotalMinor,
  };
}
