import type { PurchaseProposal } from "@ostensia/domain";
import type { CatalogueProduct } from "../lib/api-types.ts";
import { describeCart } from "../lib/cart.ts";
import { Callout } from "./callout.tsx";
import styles from "./cart-view.module.css";

// A cart as a list (guidelines section 12.2). Below 640px each line stacks: the name, then
// the quantity and price, then the line total. Money is in tabular figures.
export function CartView({ proposal, products }: { readonly proposal: PurchaseProposal; readonly products: readonly CatalogueProduct[] }) {
  const view = describeCart(proposal, products);
  return (
    <div className={styles["cart"]}>
      {view.lines.length === 0 ? (
        <p className={styles["empty"]}>The cart is empty.</p>
      ) : (
        <ul className={styles["lines"]}>
          {view.lines.map((line) => (
            <li key={line.key} className={styles["line"]}>
              <span className={styles["what"]}>
                <span className={styles["name"]}>{line.name}</span>
                {line.variant === null ? null : <span className={styles["variant"]}>{line.variant}</span>}
              </span>
              <span className={styles["priced"]}>
                {line.quantity} × {line.unitPrice}
              </span>
              <span className={styles["amount"]}>{line.lineTotal ?? "Not available"}</span>
            </li>
          ))}
        </ul>
      )}
      <p className={styles["totalRow"]}>
        <span>Total</span>
        <span className={styles["amount"]}>{view.declaredTotal}</span>
      </p>
      {view.totalsDisagree ? (
        <Callout tone="warning">
          The total the cart declares does not match its lines
          {view.computedTotal === null ? "" : ` (the lines add up to ${view.computedTotal})`}. Ostensia's check will block it.
        </Callout>
      ) : null}
    </div>
  );
}
