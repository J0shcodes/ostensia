"use client";

import type { ConfirmedMandate } from "@ostensia/domain";
import { useEffect, useRef, useState } from "react";
import type { CatalogueProduct } from "../lib/api-types.ts";
import { formatLocalInstant } from "../lib/datetime.ts";
import { describeTerms } from "../lib/mandate-form.ts";
import { REFERENCE_NOTE } from "../lib/messages.ts";
import { Callout } from "./callout.tsx";
import { Button } from "./controls.tsx";
import { Icon } from "./icons.tsx";
import { Panel } from "./provenance.tsx";
import styles from "./confirmed-card.module.css";

type Props = {
  readonly mandate: ConfirmedMandate;
  // True when this is a mandate that already existed, chosen after an unclear result.
  readonly existing: boolean;
  readonly products: readonly CatalogueProduct[];
  readonly onAnother: () => void;
};

// A 64-character reference shortened in the middle for reading. The full value is in
// the page for assistive technology and under "Show the full reference".
function shorten(hash: string): string {
  return hash.length <= 12 ? hash : `${hash.slice(0, 4)}…${hash.slice(-4)}`;
}

type CopyState = "idle" | "copied" | "failed";

export function ConfirmedCard({ mandate, existing, products, onAnother }: Props) {
  const target = useRef<HTMLDivElement>(null);
  const [copy, setCopy] = useState<CopyState>("idle");

  // Focus moves to the result, so keyboard and screen-reader users land on it.
  useEffect(() => {
    target.current?.focus();
  }, []);

  const copyReference = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(mandate.hash);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  };

  const description = describeTerms(mandate.terms, products);

  return (
    <div ref={target} tabIndex={-1} className={styles["focusTarget"]}>
      <Panel
        title="Mandate confirmed"
        source="person"
        badges={[{ source: "person" }, { source: "ostensia" }]}
      >
        <div className={styles["stack"]}>
          {existing ? (
            <Callout tone="notice" role="status">
              This is a mandate that already existed with exactly these terms. No new mandate was created.
            </Callout>
          ) : null}

          <dl className={styles["facts"]}>
            <dt>Mandate ID</dt>
            <dd className={styles["mono"]}>{mandate.id}</dd>
            <dt>Status</dt>
            <dd>Confirmed</dd>
            <dt>Confirmed</dt>
            <dd>{formatLocalInstant(mandate.confirmedAt)}</dd>
            <dt>Mandate reference (SHA-256)</dt>
            <dd>
              <div className={styles["reference"]}>
                <code className={styles["mono"]}>
                  <span aria-hidden="true">{shorten(mandate.hash)}</span>
                  <span className="visually-hidden">{mandate.hash}</span>
                </code>
                <Button variant="secondary" onClick={() => void copyReference()}>
                  <Icon name="copy" />
                  Copy
                </Button>
                <span role="status" className={styles["note"]}>
                  {copy === "copied" ? "Copied." : copy === "failed" ? "Could not copy. Open the full reference below." : ""}
                </span>
              </div>
              <details className={styles["full"]}>
                <summary>Show the full reference</summary>
                <code>{mandate.hash}</code>
              </details>
            </dd>
          </dl>

          <p className={styles["note"]}>{REFERENCE_NOTE}</p>

          <div className={styles["stack"]}>
            <h3>Terms</h3>
            <p className={styles["note"]}>{description.headline}</p>
            <ul className={styles["list"]}>
              {description.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>

          <p className={styles["note"]}>Next: propose a cart. This step is not available yet.</p>
          <div className={styles["actions"]}>
            <Button variant="secondary" onClick={onAnother}>
              Create another mandate
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
