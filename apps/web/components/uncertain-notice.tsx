"use client";

import { ATTEMPT_MISSING, ATTEMPT_UNCERTAIN, BUSY, LABELS } from "../lib/messages.ts";
import { Callout } from "./callout.tsx";
import { Button } from "./controls.tsx";
import styles from "./uncertain-notice.module.css";

type Props = {
  // What the page does know about why there was no clear answer (guidelines section 12.4).
  readonly detail: string;
  // Reading the attempt is in progress.
  readonly checking: boolean;
  // The attempt was looked up and does not exist, so nothing was sent.
  readonly missing: boolean;
  // The lookup itself did not come back.
  readonly couldNotCheck: boolean;
  readonly onCheckStatus: () => void;
  // Only offered after the attempt was found not to exist: sending the same request again
  // is then safe, because the same attempt id makes it the same attempt (D-022).
  readonly onTryAgain?: (() => void) | undefined;
};

// A request about a purchase attempt that did not come back clearly. It may have reached
// PayPal Sandbox, so nothing is sent again unless the person chooses: "Check status" is a
// read, and "Try again" appears only once the attempt is known not to exist.
export function UncertainNotice({ detail, checking, missing, couldNotCheck, onCheckStatus, onTryAgain }: Props) {
  return (
    <Callout tone="warning" role="alert">
      <div className={styles["stack"]}>
        <p>
          <strong>{ATTEMPT_UNCERTAIN}</strong> {detail}
        </p>
        {missing ? <p role="status">{ATTEMPT_MISSING}</p> : null}
        {couldNotCheck ? <p role="status">Ostensia also could not check the attempt. Check again in a moment.</p> : null}
        <div className={styles["actions"]}>
          {missing && onTryAgain !== undefined ? (
            <Button variant="secondary" onClick={onTryAgain}>
              {LABELS.tryAgain}
            </Button>
          ) : null}
          <Button variant={missing && onTryAgain !== undefined ? "text" : "secondary"} busy={checking} busyLabel={BUSY.checkingStatus} onClick={onCheckStatus}>
            {LABELS.checkStatus}
          </Button>
        </div>
      </div>
    </Callout>
  );
}
