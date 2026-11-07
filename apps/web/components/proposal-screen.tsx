"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { parseAttemptEnvelope } from "../lib/api.ts";
import type { AttemptRequest } from "../lib/api.ts";
import type { Scenario, ShopMode } from "../lib/api-types.ts";
import { newAttemptId } from "../lib/attempt-id.ts";
import { api } from "../lib/client.ts";
import {
  AUTHORIZE_HELP,
  BUSY,
  LABELS,
  LINK_ALL_ATTEMPTS,
  PROPOSAL_INTRO,
  PROPOSAL_TITLE,
  SETTLE_HELP,
  describeAgentFailure,
  describeAttemptDetail,
  describeAttemptRefusal,
  describeSimulatedFailure,
} from "../lib/messages.ts";
import { rememberCartSource } from "../lib/session-memory.ts";
import type { RememberedSource } from "../lib/session-memory.ts";
import { CartView } from "./cart-view.tsx";
import { Callout } from "./callout.tsx";
import { Button } from "./controls.tsx";
import { MandateSummary } from "./mandate-summary.tsx";
import { AgentPanel, SimulatedPanel } from "./proposal-sources.tsx";
import { Panel } from "./provenance.tsx";
import type { AgentState, CartState, CatalogueState, MandateLoad, RunState, SimulatedState } from "./screen-types.ts";
import { StepIndicator } from "./step-indicator.tsx";
import { UncertainNotice } from "./uncertain-notice.tsx";
import styles from "./proposal-screen.module.css";

const attemptPath = (attemptId: string): string => `/attempts/${encodeURIComponent(attemptId)}`;

// Step 2: choose a cart and have Ostensia check it (guidelines section 12.2). A cart comes
// from the simulated shop or from the AI agent; either way it is only a proposal. The
// gate, on the server, decides whether it is allowed (CLAUDE.md section 7).
//
// The attempt id is made here, before anything is sent. If the answer is lost, the same
// request with the same id is the same attempt on the server, so "Try again" cannot make
// a second one. Nothing is ever sent again on the person's behalf.
export function ProposalScreen({ mandateId }: { readonly mandateId: string }) {
  const router = useRouter();

  const [mandate, setMandate] = useState<MandateLoad>({ kind: "loading" });
  const [catalogue, setCatalogue] = useState<CatalogueState>({ kind: "loading" });
  const [scenario, setScenario] = useState<Scenario>("compliant");
  const [mode, setMode] = useState<ShopMode>("informed");
  const [task, setTask] = useState("");
  const [simulated, setSimulated] = useState<SimulatedState>({ kind: "idle" });
  const [agent, setAgent] = useState<AgentState>({ kind: "idle" });
  const [agentOff, setAgentOff] = useState(false);
  const [cart, setCart] = useState<CartState>({ kind: "none" });
  const [run, setRun] = useState<RunState>({ kind: "idle" });

  const loadMandate = useCallback(async (): Promise<void> => {
    setMandate({ kind: "loading" });
    const result = await api.getMandate(mandateId);
    if (result.kind === "ok") setMandate({ kind: "ok", mandate: result.body.mandate });
    else if (result.kind === "api_error" && result.status === 404) setMandate({ kind: "not_found" });
    else setMandate({ kind: "error" });
  }, [mandateId]);

  const loadCatalogue = useCallback(async (): Promise<void> => {
    const result = await api.getCatalogue();
    setCatalogue(result.kind === "ok" ? { kind: "ok", catalogue: result.body } : { kind: "error" });
  }, []);

  useEffect(() => {
    void loadMandate();
    void loadCatalogue();
  }, [loadMandate, loadCatalogue]);

  const revoked = mandate.kind === "ok" && mandate.mandate.status === "revoked";
  const sourceReason = revoked ? "This mandate is revoked." : undefined;

  const buildSimulated = async (): Promise<void> => {
    setSimulated({ kind: "loading" });
    const result = await api.simulatedProposal(mandateId, scenario);
    if (result.kind !== "ok") {
      setSimulated({ kind: "failed", failure: describeSimulatedFailure(result) });
      return;
    }
    // Building a cart replaces the one on the table, and the other source's answer no
    // longer describes it.
    setSimulated({ kind: "idle" });
    setAgent({ kind: "idle" });
    setRun({ kind: "idle" });
    setCart({ kind: "ready", source: "simulated", label: result.body.label, proposal: result.body.proposal });
  };

  const askAgent = async (): Promise<void> => {
    setAgent({ kind: "loading" });
    const result = await api.agentProposal(mandateId, mode, task);
    if (result.kind !== "ok") {
      const failure = describeAgentFailure(result);
      // "Not configured" does not change until the API restarts with a key.
      if (failure.tone === "off") setAgentOff(true);
      setAgent({ kind: "failed", failure });
      return;
    }
    const { proposal, declinedReason, modeNote, rationale, label } = result.body;
    if (proposal === null) {
      // A decline is an answer, not an error. The cart already on the table stays.
      setAgent({ kind: "declined", modeNote, rationale, reason: declinedReason ?? "" });
      return;
    }
    setAgent({ kind: "answered", modeNote, rationale });
    setSimulated({ kind: "idle" });
    setRun({ kind: "idle" });
    setCart({ kind: "ready", source: "ai", label, proposal });
  };

  const send = async (request: AttemptRequest, source: RememberedSource): Promise<void> => {
    setRun({ kind: "running", settleNow: request.settleNow });
    const result = await api.createAttempt(request);

    if (result.kind === "ok") {
      rememberCartSource(request.attemptId, source);
      router.push(attemptPath(request.attemptId));
      return;
    }

    if (result.kind === "api_error") {
      // The authorization was created, then reading it back failed. The attempt exists
      // and nothing was written, so the result page is the right place to be.
      if (result.error === "read_failed" && parseAttemptEnvelope(result.body) !== null) {
        rememberCartSource(request.attemptId, source);
        router.push(attemptPath(request.attemptId));
        return;
      }
      // A refusal means the request did nothing. A stopped gate refuses before it starts.
      if (result.status < 500 || result.error === "gate_faulted") {
        if (result.error === "mandate_in_use") {
          const by = result.body["byAttemptId"];
          setRun({ kind: "in_use", byAttemptId: typeof by === "string" ? by : "" });
          return;
        }
        setRun({ kind: "refused", message: describeAttemptRefusal(result.error) });
        return;
      }
    }

    // No clear answer: it is not known to have failed.
    setRun({ kind: "uncertain", request, source, detail: describeAttemptDetail(result), check: "idle" });
  };

  const submit = (settleNow: boolean): void => {
    if (cart.kind !== "ready") return;
    const request: AttemptRequest = { attemptId: newAttemptId(), mandateId, proposal: cart.proposal, settleNow };
    void send(request, { source: cart.source, label: cart.label });
  };

  const checkStatus = async (): Promise<void> => {
    if (run.kind !== "uncertain") return;
    const current = run;
    setRun({ ...current, check: "checking" });
    const result = await api.getAttempt(current.request.attemptId);
    if (result.kind === "ok") {
      rememberCartSource(current.request.attemptId, current.source);
      router.push(attemptPath(current.request.attemptId));
      return;
    }
    // A missing attempt means the request never reached the gate: nothing was sent.
    setRun({ ...current, check: result.kind === "api_error" && result.status === 404 ? "missing" : "could_not_check" });
  };

  const tryAgain = (): void => {
    if (run.kind === "uncertain") void send(run.request, run.source);
  };

  const products = catalogue.kind === "ok" ? catalogue.catalogue.products : [];
  const actionsOff = run.kind === "running" || run.kind === "uncertain" || revoked;
  const actionsReason = revoked
    ? "This mandate is revoked."
    : run.kind === "uncertain"
      ? "Resolve the notice above first."
      : undefined;

  return (
    <main className={styles["page"]}>
      <div className={styles["intro"]}>
        <h1>{PROPOSAL_TITLE}</h1>
        <p className={styles["lead"]}>{PROPOSAL_INTRO}</p>
      </div>
      <StepIndicator current={1} hrefs={["/"]} />

      {mandate.kind === "loading" ? <p role="status">Loading the mandate…</p> : null}

      {mandate.kind === "not_found" ? (
        <Callout tone="danger" role="alert">
          <p>Ostensia does not know this mandate. It may have been created before the API last restarted.</p>
          <p>
            <Link href="/">Create a mandate</Link>
          </p>
        </Callout>
      ) : null}

      {mandate.kind === "error" ? (
        <Callout tone="danger" role="alert">
          <p>Ostensia could not load this mandate. Nothing was sent to PayPal.</p>
          <div>
            <Button variant="secondary" onClick={() => void loadMandate()}>
              {LABELS.tryAgain}
            </Button>
          </div>
        </Callout>
      ) : null}

      {mandate.kind === "ok" ? (
        <>
          <MandateSummary mandate={mandate.mandate} products={products} />

          <div className={styles["sources"]}>
            <SimulatedPanel
              scenario={scenario}
              onScenario={setScenario}
              state={simulated}
              disabledReason={sourceReason}
              onBuild={() => void buildSimulated()}
            />
            <AgentPanel
              mode={mode}
              onMode={setMode}
              task={task}
              onTask={setTask}
              state={agent}
              off={agentOff}
              disabledReason={sourceReason}
              onAsk={() => void askAgent()}
            />
          </div>

          {cart.kind === "ready" ? (
            <Panel
              title="Proposed cart"
              source={cart.source}
              {...(cart.source === "ai" ? { badges: [{ source: "ai" as const, label: "AI-generated proposal" }] } : {})}
            >
              <div className={styles["stack"]}>
                <p className={styles["note"]}>{cart.label}</p>
                <CartView proposal={cart.proposal} products={products} />

                {run.kind === "uncertain" ? (
                  <UncertainNotice
                    detail={run.detail}
                    checking={run.check === "checking"}
                    missing={run.check === "missing"}
                    couldNotCheck={run.check === "could_not_check"}
                    onCheckStatus={() => void checkStatus()}
                    onTryAgain={tryAgain}
                  />
                ) : null}
                {run.kind === "refused" ? (
                  <Callout tone="danger" role="alert">
                    {run.message}
                  </Callout>
                ) : null}
                {run.kind === "in_use" ? (
                  <Callout tone="warning" role="alert">
                    <p>{describeAttemptRefusal("mandate_in_use")}</p>
                    {run.byAttemptId === "" ? null : (
                      <p>
                        <Link href={attemptPath(run.byAttemptId)}>See the attempt that is using it</Link>
                      </p>
                    )}
                  </Callout>
                ) : null}

                <div className={styles["actions"]}>
                  <div className={styles["action"]}>
                    <Button
                      busy={run.kind === "running" && !run.settleNow}
                      busyLabel={BUSY.checking}
                      disabled={actionsOff}
                      onClick={() => submit(false)}
                    >
                      {LABELS.authorize}
                    </Button>
                    <p className={styles["help"]}>{AUTHORIZE_HELP}</p>
                  </div>
                  <div className={styles["action"]}>
                    <Button
                      variant="secondary"
                      busy={run.kind === "running" && run.settleNow}
                      busyLabel={BUSY.checking}
                      disabled={actionsOff}
                      onClick={() => submit(true)}
                    >
                      {LABELS.settleNow}
                    </Button>
                    <p className={styles["help"]}>{SETTLE_HELP}</p>
                  </div>
                </div>
                {actionsReason === undefined ? null : <p className={styles["help"]}>{actionsReason}</p>}
              </div>
            </Panel>
          ) : null}
        </>
      ) : null}

      <p className={styles["note"]}>
        <Link href="/attempts">{LINK_ALL_ATTEMPTS}</Link>
      </p>
    </main>
  );
}
