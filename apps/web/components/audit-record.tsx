import type { AttemptEnvelope } from "../lib/api-types.ts";
import { buildAuditRecord } from "../lib/audit-record.ts";
import type { AuditEntry } from "../lib/audit-record.ts";
import { formatLocalInstantSeconds, formatUtcInstant } from "../lib/datetime.ts";
import { AUDIT_EMPTY, AUDIT_INTRO, AUDIT_REQUEST_NOTE, AUDIT_TITLE, SOURCE_NOT_RECORDED } from "../lib/messages.ts";
import { CopyValue } from "./copy-value.tsx";
import { Panel } from "./provenance.tsx";
import panels from "./attempt-panels.module.css";
import styles from "./audit-record.module.css";

// One event of the log, in words (guidelines section 13.2). The treatment follows who
// produced it: a request that really went to PayPal Sandbox gets the PayPal rule and badge,
// Ostensia's own records get the Ostensia panel, and a kind of event the page does not know
// gets neither.
function Entry({ entry }: { readonly entry: AuditEntry }) {
  return (
    <Panel
      title={entry.title}
      nested
      headingLevel={3}
      {...(entry.source === "none" ? {} : { source: entry.source })}
    >
      <div className={styles["entry"]}>
        {entry.at === null ? null : (
          <p className={styles["time"]}>
            <time dateTime={entry.at}>{formatLocalInstantSeconds(entry.at)}</time>
            <span className={styles["mono"]}>{formatUtcInstant(entry.at)}</span>
          </p>
        )}
        <p className={panels["note"]}>{entry.line}</p>
        {entry.explanation === null ? null : (
          <ul className={panels["list"]}>
            {entry.explanation.map((line, index) => (
              <li key={`${index}-${line}`}>{line}</li>
            ))}
          </ul>
        )}
        {entry.facts.length === 0 ? null : (
          <dl className={panels["facts"]}>
            {entry.facts.map((fact) => (
              <div key={fact.label} className={panels["fact"]}>
                <dt>{fact.label}</dt>
                <dd>{fact.copy ? <CopyValue label={fact.label} value={fact.value} /> : fact.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {entry.detail === null ? null : <p className={styles["detail"]}>{entry.detail}</p>}
      </div>
    </Panel>
  );
}

// What Ostensia logged for the attempt, oldest first, in the order the log holds it. The
// panel itself is a plain card: it holds entries from different sources, and sources are
// never merged into one panel (guidelines section 7).
export function AuditRecord({ envelope }: { readonly envelope: AttemptEnvelope }) {
  const entries = envelope.events === null ? [] : buildAuditRecord(envelope.events, envelope.explanation);
  return (
    <Panel title={AUDIT_TITLE}>
      <div className={panels["stack"]}>
        <p className={panels["note"]}>{AUDIT_INTRO}</p>
        <p className={panels["note"]}>{AUDIT_REQUEST_NOTE}</p>
        <p className={panels["note"]}>{SOURCE_NOT_RECORDED}</p>
        {entries.length === 0 ? (
          <p className={panels["note"]}>{AUDIT_EMPTY}</p>
        ) : (
          <ol className={styles["entries"]} aria-label={AUDIT_TITLE}>
            {entries.map((entry, index) => (
              <li key={`${index}-${entry.wording}`}>
                <Entry entry={entry} />
              </li>
            ))}
          </ol>
        )}
      </div>
    </Panel>
  );
}
