import type { ConfirmedMandate } from "@ostensia/domain";
import type { CatalogueProduct } from "../lib/api-types.ts";
import { describeTerms } from "../lib/mandate-form.ts";
import { Callout } from "./callout.tsx";
import { Panel } from "./provenance.tsx";
import styles from "./mandate-summary.module.css";

// The mandate the cart is checked against, in plain words (guidelines section 12.2). The
// terms are the person's: they confirmed them, so the panel says so.
export function MandateSummary({ mandate, products }: { readonly mandate: ConfirmedMandate; readonly products: readonly CatalogueProduct[] }) {
  const description = describeTerms(mandate.terms, products);
  const revoked = mandate.status === "revoked";
  return (
    <Panel title="Your mandate" source="person">
      <div className={styles["stack"]}>
        {revoked ? (
          <Callout tone="warning">This mandate is revoked. Any purchase against it will be blocked.</Callout>
        ) : null}
        <p>{description.headline}</p>
        <ul className={styles["list"]}>
          {description.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <dl className={styles["facts"]}>
          <dt>Mandate ID</dt>
          <dd className={styles["mono"]}>{mandate.id}</dd>
          <dt>Status</dt>
          <dd>{revoked ? "Revoked" : "Confirmed"}</dd>
        </dl>
      </div>
    </Panel>
  );
}
