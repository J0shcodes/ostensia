"use client";

import type { ConfirmedMandate } from "@ostensia/domain";
import { formatLocalInstant } from "../lib/datetime.ts";
import { CONFIRM_UNCERTAIN } from "../lib/messages.ts";
import { Callout } from "./callout.tsx";
import { Button } from "./controls.tsx";
import { ErrorSummary } from "./error-summary.tsx";
import type { SubmitState } from "./screen-types.ts";
import styles from "./confirm-outcome.module.css";

type Props = {
  readonly submit: SubmitState;
  readonly focusToken: number;
  readonly onUseExisting: (mandate: ConfirmedMandate) => void;
  readonly onCreateAnyway: () => void;
  readonly onCheckAgain: () => void;
};

// What to show when "Confirm mandate" did not simply succeed.
//
// Creating a mandate is not idempotent, so a request with no clear answer must never be
// repeated on the person's behalf: it may have worked. The page checks whether a mandate
// with exactly these terms exists and then lets the person decide. A timeout is not a
// failure (CLAUDE.md section 7).
export function ConfirmOutcome({ submit, focusToken, onUseExisting, onCreateAnyway, onCheckAgain }: Props) {
  if (submit.kind === "refused") {
    return <ErrorSummary title="The mandate was not confirmed" items={[{ text: submit.message }]} focusToken={focusToken} />;
  }
  if (submit.kind !== "uncertain") return null;

  const { check, detail } = submit;
  return (
    <Callout tone="warning" role="alert">
      <div className={styles["stack"]}>
        <p>
          <strong>{CONFIRM_UNCERTAIN}</strong> {detail}
        </p>

        {check.kind === "checking" ? <p role="status">Checking whether a mandate with exactly these terms exists…</p> : null}

        {check.kind === "found" ? (
          <>
            <p>
              A mandate with exactly these terms already exists. It may have been created by the request that did not come back.
            </p>
            <ul className={styles["matches"]}>
              {check.matches.map((mandate) => (
                <li key={mandate.id}>
                  <span className={styles["mono"]}>{mandate.id}</span>, confirmed {formatLocalInstant(mandate.confirmedAt)}{" "}
                  <Button variant="secondary" onClick={() => onUseExisting(mandate)}>
                    Use this mandate
                  </Button>
                </li>
              ))}
            </ul>
            <div className={styles["actions"]}>
              <Button variant="text" onClick={onCreateAnyway}>
                Create a new one anyway
              </Button>
            </div>
          </>
        ) : null}

        {check.kind === "none" ? (
          <>
            <p>No mandate with exactly these terms exists yet, so it was most likely not created.</p>
            <div className={styles["actions"]}>
              <Button variant="secondary" onClick={onCreateAnyway}>
                Try again
              </Button>
            </div>
          </>
        ) : null}

        {check.kind === "could_not_check" ? (
          <>
            <p>Ostensia also could not check the list of mandates. Creating another one now could make a duplicate.</p>
            <div className={styles["actions"]}>
              <Button variant="secondary" onClick={onCheckAgain}>
                Check again
              </Button>
              <Button variant="text" onClick={onCreateAnyway}>
                Create a new one anyway
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </Callout>
  );
}
