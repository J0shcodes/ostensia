"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Attempt } from "../lib/api-types.ts";
import { usd } from "../lib/cart.ts";
import { newestFirst } from "../lib/attempts-order.ts";
import { api } from "../lib/client.ts";
import { formatLocalInstantSeconds } from "../lib/datetime.ts";
import { ATTEMPTS_EMPTY, ATTEMPTS_ERROR, ATTEMPTS_INTRO, ATTEMPTS_TITLE, BUSY, LABELS, LINK_VIEW_RESULT } from "../lib/messages.ts";
import { shorten } from "../lib/shorten.ts";
import { Callout } from "./callout.tsx";
import { Button, ButtonLink } from "./controls.tsx";
import { StatusIndicator } from "./status-indicator.tsx";
import styles from "./attempts-list.module.css";

type Load =
  | { readonly kind: "loading" }
  | { readonly kind: "ok"; readonly attempts: readonly Attempt[] }
  | { readonly kind: "error" };

const resultPath = (attemptId: string): string => `/attempts/${encodeURIComponent(attemptId)}`;

// The list of purchase attempts (guidelines section 13.5). It is a read: it sends nothing,
// so "Check status" here reads the list again and cannot change anything.
export function AttemptsList() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [checking, setChecking] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  const read = async (): Promise<void> => {
    const result = await api.listAttempts();
    setLoad(result.kind === "ok" ? { kind: "ok", attempts: newestFirst(result.body.attempts) } : { kind: "error" });
  };

  useEffect(() => {
    void (async () => {
      const result = await api.listAttempts();
      setLoad(result.kind === "ok" ? { kind: "ok", attempts: newestFirst(result.body.attempts) } : { kind: "error" });
    })();
  }, []);

  useEffect(() => {
    if (load.kind !== "loading") heading.current?.focus();
  }, [load.kind]);

  const check = async (): Promise<void> => {
    setChecking(true);
    await read();
    setChecking(false);
  };

  return (
    <main className={styles["page"]}>
      <div className={styles["intro"]}>
        <h1 ref={heading} tabIndex={-1} className={styles["title"]}>
          {ATTEMPTS_TITLE}
        </h1>
        <p className={styles["lead"]}>{ATTEMPTS_INTRO}</p>
      </div>

      {load.kind === "loading" ? <p role="status">Loading the attempts…</p> : null}

      {load.kind === "error" ? (
        <Callout tone="danger" role="alert">
          <p>{ATTEMPTS_ERROR}</p>
          <div>
            <Button variant="secondary" busy={checking} busyLabel={BUSY.checkingStatus} onClick={() => void check()}>
              {LABELS.checkStatus}
            </Button>
          </div>
        </Callout>
      ) : null}

      {load.kind === "ok" && load.attempts.length === 0 ? (
        <div className={styles["intro"]}>
          <p>{ATTEMPTS_EMPTY}</p>
          <p>
            <Link href="/">Create a mandate</Link>
          </p>
        </div>
      ) : null}

      {load.kind === "ok" && load.attempts.length > 0 ? (
        <ol className={styles["rows"]} aria-label={ATTEMPTS_TITLE}>
          {load.attempts.map((attempt) => (
            <li key={attempt.attemptId} className={styles["row"]}>
              <div className={styles["main"]}>
                <StatusIndicator status={attempt.status} compact />
                <dl className={styles["facts"]}>
                  <div className={styles["fact"]}>
                    <dt>Started</dt>
                    <dd>
                      <time dateTime={attempt.startedAt}>{formatLocalInstantSeconds(attempt.startedAt)}</time>
                    </dd>
                  </div>
                  <div className={styles["fact"]}>
                    <dt>Declared total</dt>
                    <dd>{usd(attempt.proposal.declaredTotalMinor)}</dd>
                  </div>
                  <div className={styles["fact"]}>
                    <dt>Mandate</dt>
                    <dd className={styles["mono"]}>
                      <span aria-hidden="true">{shorten(attempt.mandateId)}</span>
                      <span className="visually-hidden">{attempt.mandateId}</span>
                    </dd>
                  </div>
                </dl>
              </div>
              <div className={styles["actions"]}>
                <ButtonLink href={resultPath(attempt.attemptId)} variant="secondary" ariaLabel={`${LINK_VIEW_RESULT} of attempt ${attempt.attemptId}`}>
                  {LINK_VIEW_RESULT}
                </ButtonLink>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </main>
  );
}
