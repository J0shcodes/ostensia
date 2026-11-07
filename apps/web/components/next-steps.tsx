"use client";

import type { ReactNode } from "react";
import type { ConfirmedMandate } from "@ostensia/domain";
import type { AttemptStatus } from "../lib/api-types.ts";
import { presentStatus } from "../lib/attempt-status.ts";
import { BUSY, LABELS, REVOKE_WARNING } from "../lib/messages.ts";
import { Callout } from "./callout.tsx";
import { Button } from "./controls.tsx";
import { Panel } from "./provenance.tsx";
import styles from "./next-steps.module.css";

export type Busy = "settle" | "reconcile" | "revoke" | "status" | null;

type Props = {
  readonly status: AttemptStatus;
  readonly mandate: ConfirmedMandate | null;
  readonly busy: Busy;
  readonly confirmRevoke: boolean;
  // Notices from the last request, and the unclear-answer notice, shown above the buttons.
  readonly children: ReactNode;
  readonly onSettle: () => void;
  readonly onReconcile: () => void;
  readonly onAskRevoke: () => void;
  readonly onKeep: () => void;
  readonly onRevoke: () => void;
  readonly onCheckStatus: () => void;
};

// Statuses the API gives no way to continue from (TD-034). The page says so and does not
// invent an action.
const NEEDS_A_PERSON: ReadonlySet<AttemptStatus> = new Set<AttemptStatus>(["create_unknown", "anomaly", "write_rejected", "conflict"]);

const WORKING: ReadonlySet<AttemptStatus> = new Set<AttemptStatus>(["started", "prechecked", "creating", "writing"]);

// What a person can do next, from the attempt's status (guidelines section 12.5). The page
// offers only what the gate allows for that status; the gate still decides.
export function NextSteps({ status, mandate, busy, confirmRevoke, children, onSettle, onReconcile, onAskRevoke, onKeep, onRevoke, onCheckStatus }: Props) {
  const { actions } = presentStatus(status);
  const revoked = mandate?.status === "revoked";
  const idle = busy === null;

  return (
    <Panel title="Next steps">
      <div className={styles["stack"]}>
        {children}

        {actions.length === 0 && !WORKING.has(status) ? (
          <p className={styles["note"]}>
            Nothing more can be done from here.
            {NEEDS_A_PERSON.has(status) ? " A person needs to look at PayPal's record." : ""}
          </p>
        ) : null}

        {WORKING.has(status) ? (
          <div className={styles["group"]}>
            <Button variant="secondary" busy={busy === "status"} busyLabel={BUSY.checkingStatus} disabled={!idle} onClick={onCheckStatus}>
              {LABELS.checkStatus}
            </Button>
          </div>
        ) : null}

        {actions.includes("settle") ? (
          <div className={styles["group"]}>
            {revoked ? (
              <Callout tone="notice">This mandate is revoked. Settling now will block the cart and void the authorization.</Callout>
            ) : null}
            <Button busy={busy === "settle"} busyLabel={BUSY.settling} disabled={!idle} onClick={onSettle}>
              {LABELS.settle}
            </Button>
            <p className={styles["help"]}>
              Ostensia reads the authorization from PayPal Sandbox, checks the cart and the mandate again, then captures the payment or voids the authorization.
            </p>
          </div>
        ) : null}

        {actions.includes("reconcile") ? (
          <div className={styles["group"]}>
            <Button variant="secondary" busy={busy === "reconcile"} busyLabel={BUSY.checking} disabled={!idle} onClick={onReconcile}>
              {LABELS.reconcile}
            </Button>
            <p className={styles["help"]}>This only reads PayPal Sandbox. It never captures or voids anything.</p>
          </div>
        ) : null}

        {actions.includes("revoke") && !revoked ? (
          <div className={styles["group"]}>
            {confirmRevoke ? (
              <Callout tone="warning" role="alert">
                <div className={styles["stack"]}>
                  <p>{REVOKE_WARNING}</p>
                  <div className={styles["row"]}>
                    <Button variant="destructive" busy={busy === "revoke"} busyLabel={BUSY.revoking} disabled={!idle} onClick={onRevoke}>
                      {LABELS.revoke}
                    </Button>
                    <Button variant="secondary" disabled={!idle} onClick={onKeep}>
                      {LABELS.keep}
                    </Button>
                  </div>
                </div>
              </Callout>
            ) : (
              <Button variant="destructive" disabled={!idle} onClick={onAskRevoke}>
                {LABELS.revoke}
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
