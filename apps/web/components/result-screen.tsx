"use client";

import type { ConfirmedMandate } from "@ostensia/domain";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { parseAttemptEnvelope } from "../lib/api.ts";
import type { AttemptEnvelope } from "../lib/api-types.ts";
import { RECONCILE_TEXT, paypalWasCalled, presentStatus, reachedPayPal, unsentNotice } from "../lib/attempt-status.ts";
import { api } from "../lib/client.ts";
import { LABELS, SOURCE_NOT_RECORDED, describeAttemptDetail, describeAttemptRefusal } from "../lib/messages.ts";
import { recallCartSource } from "../lib/session-memory.ts";
import { Callout } from "./callout.tsx";
import type { CalloutTone } from "./callout.tsx";
import { CartView } from "./cart-view.tsx";
import { Button } from "./controls.tsx";
import { DecisionPanel } from "./decision-panel.tsx";
import { NextSteps } from "./next-steps.tsx";
import type { Busy } from "./next-steps.tsx";
import { PaymentPanel } from "./payment-panel.tsx";
import { Panel } from "./provenance.tsx";
import type { AttemptLoad, CatalogueState } from "./screen-types.ts";
import { StepIndicator } from "./step-indicator.tsx";
import { UncertainNotice } from "./uncertain-notice.tsx";
import styles from "./result-screen.module.css";

type Notice = { readonly tone: CalloutTone; readonly text: string };
type Uncertain = { readonly detail: string; readonly checking: boolean; readonly couldNotCheck: boolean };

const READ_FAILED_SETTLE =
  "Ostensia could not read the authorization from PayPal Sandbox. Nothing was written. You can settle again.";
const READ_FAILED_RECONCILE = "Ostensia could not read PayPal Sandbox's record. Nothing was changed. Try again.";

// A refusal means the request did nothing. A stopped gate refuses before it starts.
const isRefusal = (status: number, error: string): boolean => status < 500 || error === "gate_faulted";

// Step 3: what happened to a purchase attempt (guidelines section 12.3). The attempt lives
// on the server and is read from there, so a refresh or a shared link shows the same
// thing. Every action is one request, sent once; a request with no clear answer is read
// back with "Check status", and nothing is sent again on the person's behalf.
export function ResultScreen({ attemptId }: { readonly attemptId: string }) {
  const [load, setLoad] = useState<AttemptLoad>({ kind: "loading" });
  const [mandate, setMandate] = useState<ConfirmedMandate | null>(null);
  const [catalogue, setCatalogue] = useState<CatalogueState>({ kind: "loading" });
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [uncertain, setUncertain] = useState<Uncertain | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);

  // Focus moves to the heading once the attempt shows, and again after each request.
  useEffect(() => {
    if (load.kind === "ok") heading.current?.focus();
  }, [load.kind, focusTick]);

  const refresh = useCallback(async (): Promise<boolean> => {
    const result = await api.getAttempt(attemptId);
    if (result.kind === "ok") {
      setLoad({ kind: "ok", envelope: result.body });
      return true;
    }
    return false;
  }, [attemptId]);

  useEffect(() => {
    void (async () => {
      const result = await api.getAttempt(attemptId);
      if (result.kind === "ok") setLoad({ kind: "ok", envelope: result.body });
      else if (result.kind === "api_error" && result.status === 404) setLoad({ kind: "not_found" });
      else setLoad({ kind: "error" });
    })();
    void (async () => {
      const result = await api.getCatalogue();
      setCatalogue(result.kind === "ok" ? { kind: "ok", catalogue: result.body } : { kind: "error" });
    })();
  }, [attemptId]);

  const mandateId = load.kind === "ok" ? load.envelope.attempt.mandateId : null;
  useEffect(() => {
    if (mandateId === null) return;
    void (async () => {
      const result = await api.getMandate(mandateId);
      if (result.kind === "ok") setMandate(result.body.mandate);
    })();
  }, [mandateId]);

  const apply = (envelope: AttemptEnvelope): void => setLoad({ kind: "ok", envelope });

  const finish = (): void => {
    setBusy(null);
    setFocusTick((tick) => tick + 1);
  };

  const unclear = (detail: string): void => setUncertain({ detail, checking: false, couldNotCheck: false });

  const settle = async (): Promise<void> => {
    setBusy("settle");
    setNotice(null);
    setUncertain(null);
    const result = await api.settleAttempt(attemptId);
    if (result.kind === "ok") {
      apply(result.body);
      await refresh();
    } else if (result.kind === "api_error" && result.error === "read_failed" && parseAttemptEnvelope(result.body) !== null) {
      const envelope = parseAttemptEnvelope(result.body);
      if (envelope !== null) apply(envelope);
      setNotice({ tone: "warning", text: READ_FAILED_SETTLE });
      await refresh();
    } else if (result.kind === "api_error" && isRefusal(result.status, result.error)) {
      setNotice({ tone: "danger", text: describeAttemptRefusal(result.error) });
    } else {
      unclear(describeAttemptDetail(result));
    }
    finish();
  };

  const reconcile = async (): Promise<void> => {
    setBusy("reconcile");
    setNotice(null);
    setUncertain(null);
    const result = await api.reconcileAttempt(attemptId);
    if (result.kind === "ok") {
      apply(result.body);
      const outcome = result.body.outcome;
      setNotice({ tone: outcome === "conflict" ? "danger" : outcome === "captured" ? "success" : "notice", text: RECONCILE_TEXT[outcome] });
      await refresh();
    } else if (result.kind === "api_error" && result.error === "read_failed" && parseAttemptEnvelope(result.body) !== null) {
      setNotice({ tone: "warning", text: READ_FAILED_RECONCILE });
    } else if (result.kind === "api_error" && isRefusal(result.status, result.error)) {
      setNotice({ tone: "danger", text: describeAttemptRefusal(result.error) });
    } else {
      unclear(describeAttemptDetail(result));
    }
    finish();
  };

  const revoke = async (): Promise<void> => {
    if (mandateId === null) return;
    setBusy("revoke");
    setNotice(null);
    setUncertain(null);
    const result = await api.revokeMandate(mandateId);
    if (result.kind === "ok") {
      setMandate(result.body.mandate);
      setConfirmRevoke(false);
      setNotice({ tone: "notice", text: "Mandate revoked. Settling now will block the cart and void the authorization." });
      await refresh();
    } else if (result.kind === "api_error" && isRefusal(result.status, result.error)) {
      setConfirmRevoke(false);
      setNotice({ tone: "danger", text: describeAttemptRefusal(result.error) });
    } else {
      setConfirmRevoke(false);
      unclear(describeAttemptDetail(result));
    }
    finish();
  };

  // A read only: it shows what the server now holds and sends nothing.
  const checkStatus = async (): Promise<void> => {
    setBusy("status");
    setUncertain((current) => (current === null ? null : { ...current, checking: true, couldNotCheck: false }));
    const [ok] = await Promise.all([refresh(), mandateId === null ? Promise.resolve() : api.getMandate(mandateId).then((r) => (r.kind === "ok" ? setMandate(r.body.mandate) : undefined))]);
    if (ok) {
      setUncertain(null);
      setNotice({ tone: "notice", text: "Checked. This is the state Ostensia holds now." });
    } else {
      setUncertain((current) => ({ detail: current?.detail ?? "", checking: false, couldNotCheck: true }));
    }
    finish();
  };

  const products = catalogue.kind === "ok" ? catalogue.catalogue.products : [];

  return (
    <main className={styles["page"]}>
      <div className={styles["intro"]}>
        <h1 ref={heading} tabIndex={-1} className={styles["title"]}>
          Purchase result
        </h1>
      </div>
      <StepIndicator
        current={2}
        hrefs={["/", load.kind === "ok" ? `/mandates/${encodeURIComponent(load.envelope.attempt.mandateId)}` : undefined]}
      />

      {load.kind === "loading" ? <p role="status">Loading the attempt…</p> : null}

      {load.kind === "not_found" ? (
        <Callout tone="danger" role="alert">
          <p>Ostensia does not know this attempt. It may have been made before the API last restarted without its log.</p>
          <p>
            <Link href="/">Create a mandate</Link>
          </p>
        </Callout>
      ) : null}

      {load.kind === "error" ? (
        <Callout tone="danger" role="alert">
          <p>Ostensia could not load this attempt. Nothing was changed.</p>
          <div>
            <Button variant="secondary" onClick={() => void checkStatus()}>
              {LABELS.checkStatus}
            </Button>
          </div>
        </Callout>
      ) : null}

      {load.kind === "ok" ? <Attempt envelope={load.envelope} attemptId={attemptId} products={products} mandate={mandate} busy={busy} confirmRevoke={confirmRevoke} notice={notice} uncertain={uncertain} onSettle={() => void settle()} onReconcile={() => void reconcile()} onAskRevoke={() => setConfirmRevoke(true)} onKeep={() => setConfirmRevoke(false)} onRevoke={() => void revoke()} onCheckStatus={() => void checkStatus()} /> : null}
    </main>
  );
}

type AttemptProps = {
  readonly envelope: AttemptEnvelope;
  readonly attemptId: string;
  readonly products: readonly { readonly productId: string; readonly name: string; readonly unitPriceMinor: number; readonly variantIds: readonly string[] }[];
  readonly mandate: ConfirmedMandate | null;
  readonly busy: Busy;
  readonly confirmRevoke: boolean;
  readonly notice: Notice | null;
  readonly uncertain: Uncertain | null;
  readonly onSettle: () => void;
  readonly onReconcile: () => void;
  readonly onAskRevoke: () => void;
  readonly onKeep: () => void;
  readonly onRevoke: () => void;
  readonly onCheckStatus: () => void;
};

function Attempt({ envelope, attemptId, products, mandate, busy, confirmRevoke, notice, uncertain, onSettle, onReconcile, onAskRevoke, onKeep, onRevoke, onCheckStatus }: AttemptProps) {
  const { attempt } = envelope;
  const called = paypalWasCalled(attempt, envelope.events);
  const presentation = presentStatus(attempt.status);
  // The indicator sits in the decision panel when Ostensia decided on its own, or when
  // PayPal was never reached; otherwise it sits in the payment panel.
  const indicatorInDecision = presentation.panel === "decision" || !reachedPayPal(attempt.status);
  const remembered = recallCartSource(attemptId);
  const unsent = unsentNotice(attempt, envelope.events);

  return (
    <>
      <DecisionPanel envelope={envelope} showIndicator={indicatorInDecision} />
      <PaymentPanel envelope={envelope} called={called} />

      <NextSteps
        status={attempt.status}
        mandate={mandate}
        busy={busy}
        confirmRevoke={confirmRevoke}
        onSettle={onSettle}
        onReconcile={onReconcile}
        onAskRevoke={onAskRevoke}
        onKeep={onKeep}
        onRevoke={onRevoke}
        onCheckStatus={onCheckStatus}
      >
        {uncertain === null ? null : (
          <UncertainNotice
            detail={uncertain.detail}
            checking={uncertain.checking}
            missing={false}
            couldNotCheck={uncertain.couldNotCheck}
            onCheckStatus={onCheckStatus}
          />
        )}
        {notice === null ? null : (
          <Callout tone={notice.tone} role="status">
            {notice.text}
          </Callout>
        )}
        {unsent === null || notice !== null ? null : <Callout tone="warning">{unsent}</Callout>}
      </NextSteps>

      <Panel title="Cart" {...(remembered === null ? {} : { source: remembered.source })} {...(remembered?.source === "ai" ? { badges: [{ source: "ai" as const, label: "AI-generated proposal" }] } : {})}>
        <div className={styles["stack"]}>
          <p className={styles["note"]}>As proposed.</p>
          {remembered === null ? (
            <p className={styles["note"]}>{SOURCE_NOT_RECORDED}</p>
          ) : (
            <p className={styles["note"]}>
              {remembered.label} (as labelled when proposed)
            </p>
          )}
          <CartView proposal={attempt.proposal} products={products} />
        </div>
      </Panel>

      <p className={styles["note"]}>
        Attempt ID <span className={styles["mono"]}>{attempt.attemptId}</span>
      </p>
    </>
  );
}
