import type { Attempt, AttemptEnvelope, DecisionSummary } from "../lib/api-types.ts";
import { Icon } from "./icons.tsx";
import { Panel } from "./provenance.tsx";
import { StatusIndicator } from "./status-indicator.tsx";
import styles from "./attempt-panels.module.css";

function DecisionBlock({
  title,
  note,
  decision,
  lines,
}: {
  readonly title: string;
  readonly note?: string;
  readonly decision: DecisionSummary;
  readonly lines: readonly string[] | null;
}) {
  const allowed = decision.decision === "allow";
  return (
    <div className={styles["block"]}>
      <p className={styles["blockTitle"]}>
        <Icon name={allowed ? "check" : "cross"} />
        <span>
          {title}: {allowed ? "allowed" : "blocked"}
        </span>
      </p>
      {note === undefined ? null : <p className={styles["note"]}>{note}</p>}
      {lines === null || lines.length === 0 ? null : (
        <ul className={styles["list"]}>
          {lines.map((line, index) => (
            <li key={`${index}-${line}`}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Props = {
  readonly envelope: AttemptEnvelope;
  // True when the attempt's status is something Ostensia decided without PayPal, or when
  // no PayPal operation took place: the status indicator belongs here.
  readonly showIndicator: boolean;
};

// What Ostensia decided, in the plain words the API sends (the domain's explanations, not
// an AI's). Solid brand panel: this is Ostensia's own deterministic code (section 7).
export function DecisionPanel({ envelope, showIndicator }: Props) {
  const attempt: Attempt = envelope.attempt;
  return (
    <Panel title="Decision" source="ostensia">
      <div className={styles["stack"]}>
        {attempt.precheck === null ? (
          <p className={styles["note"]}>Not checked yet.</p>
        ) : (
          <DecisionBlock title="Pre-check" decision={attempt.precheck} lines={envelope.explanation.precheck} />
        )}
        {attempt.finalDecision === null ? null : (
          <DecisionBlock
            title="Final check"
            note="Made after Ostensia read the authorization from PayPal Sandbox."
            decision={attempt.finalDecision}
            lines={envelope.explanation.final}
          />
        )}
        {showIndicator ? <StatusIndicator status={attempt.status} /> : null}
      </div>
    </Panel>
  );
}
