import type { AttemptEnvelope } from "../lib/api-types.ts";
import { presentStatus, reachedPayPal } from "../lib/attempt-status.ts";
import { usd } from "../lib/cart.ts";
import { NOT_SENT_TO_PAYPAL, NO_ORDER_SENT } from "../lib/messages.ts";
import { CopyValue } from "./copy-value.tsx";
import { Panel } from "./provenance.tsx";
import { StatusIndicator } from "./status-indicator.tsx";
import styles from "./attempt-panels.module.css";

type Props = {
  readonly envelope: AttemptEnvelope;
  // Whether a PayPal Sandbox operation really took place (see paypalWasCalled).
  readonly called: boolean;
};

// What PayPal Sandbox reported. The "PayPal Sandbox" treatment (a 3px rule and the badge)
// is used only when PayPal was called (guidelines section 7). An attempt that never got
// to PayPal shows one plain line instead.
export function PaymentPanel({ envelope, called }: Props) {
  const { attempt } = envelope;
  const presentation = presentStatus(attempt.status);

  if (!reachedPayPal(attempt.status)) {
    // The status line of a blocked attempt already says nothing was sent; do not say it twice.
    return presentation.line.includes(NOT_SENT_TO_PAYPAL) ? null : <p className={styles["note"]}>{NOT_SENT_TO_PAYPAL}</p>;
  }

  const facts: { readonly label: string; readonly value: string; readonly copy: boolean }[] = [];
  if (attempt.orderId !== null) facts.push({ label: "Order ID", value: attempt.orderId, copy: true });
  if (attempt.authorizationId !== null) facts.push({ label: "Authorization ID", value: attempt.authorizationId, copy: true });
  if (attempt.captureId !== null) facts.push({ label: "Capture ID", value: attempt.captureId, copy: true });

  return (
    <Panel title="Payment" {...(called ? { source: "paypal" as const } : {})}>
      <div className={styles["stack"]}>
        <StatusIndicator status={attempt.status} />
        {called ? null : <p className={styles["note"]}>{NO_ORDER_SENT}</p>}
        {attempt.authorization === null ? null : (
          <p className={styles["note"]}>
            PayPal reports the authorization as {attempt.authorization.statusRaw}
            {attempt.authorization.amountMinor === null ? "" : `, ${usd(attempt.authorization.amountMinor)}`}.
          </p>
        )}
        {facts.length === 0 ? null : (
          <dl className={styles["facts"]}>
            {facts.map((fact) => (
              <div key={fact.label} className={styles["fact"]}>
                <dt>{fact.label}</dt>
                <dd>{fact.copy ? <CopyValue label={fact.label} value={fact.value} /> : fact.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </Panel>
  );
}
