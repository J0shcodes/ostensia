"use client";

import { useEffect, useState } from "react";
import { SCENARIOS, SHOP_MODES } from "../lib/api-types.ts";
import type { Scenario, ShopMode } from "../lib/api-types.ts";
import {
  AGENT_MODE_INFORMED,
  AGENT_MODE_UNINFORMED,
  AGENT_NOTE,
  AGENT_OFF_NOTICE,
  BUSY,
  LABELS,
  MAX_INSTRUCTION_LENGTH,
  SCENARIO_TEXT,
} from "../lib/messages.ts";
import { Callout } from "./callout.tsx";
import { Button, Choice, TextArea } from "./controls.tsx";
import { Field, FieldGroup } from "./field.tsx";
import { Panel } from "./provenance.tsx";
import type { AgentState, SimulatedState } from "./screen-types.ts";
import styles from "./proposal-sources.module.css";

type SimulatedProps = {
  readonly scenario: Scenario;
  readonly onScenario: (scenario: Scenario) => void;
  readonly state: SimulatedState;
  // Why the button is off (for example a revoked mandate), shown beside it in words.
  readonly disabledReason: string | undefined;
  readonly onBuild: () => void;
};

// The simulated shop (D-012): a synthetic catalogue and fixed scenarios. Dotted border and
// the "Simulated shop" badge, so it is never mistaken for a real merchant.
export function SimulatedPanel({ scenario, onScenario, state, disabledReason, onBuild }: SimulatedProps) {
  const loading = state.kind === "loading";
  return (
    <Panel title="Simulated shop" source="simulated">
      <div className={styles["stack"]}>
        <FieldGroup id="scenario" legend="Scenario">
          {SCENARIOS.map((name) => (
            <Choice
              key={name}
              type="radio"
              name="scenario"
              value={name}
              checked={scenario === name}
              onChange={() => onScenario(name)}
            >
              <span className={styles["choiceText"]}>
                <span className={styles["choiceName"]}>{SCENARIO_TEXT[name].name}</span>
                <span className={styles["choiceLine"]}>{SCENARIO_TEXT[name].line}</span>
              </span>
            </Choice>
          ))}
        </FieldGroup>
        <div className={styles["actions"]}>
          <Button variant="secondary" busy={loading} busyLabel={BUSY.building} disabled={disabledReason !== undefined} onClick={onBuild}>
            {LABELS.buildSimulated}
          </Button>
          {disabledReason === undefined ? null : <span className={styles["reason"]}>{disabledReason}</span>}
        </div>
        {state.kind === "failed" ? (
          <Callout tone={state.failure.tone === "neutral" ? "notice" : "danger"} role={state.failure.tone === "neutral" ? "status" : "alert"}>
            {state.failure.text}
          </Callout>
        ) : null}
      </div>
    </Panel>
  );
}

type AgentProps = {
  readonly mode: ShopMode;
  readonly onMode: (mode: ShopMode) => void;
  readonly task: string;
  readonly onTask: (task: string) => void;
  readonly state: AgentState;
  // True once the API has said that the agent is not configured.
  readonly off: boolean;
  readonly disabledReason: string | undefined;
  readonly onAsk: () => void;
};

// How long the agent may take before the page says it is still working.
const SLOW_AFTER_MS = 8_000;

const MODE_TEXT: Readonly<Record<ShopMode, string>> = {
  informed: AGENT_MODE_INFORMED,
  uninformed: AGENT_MODE_UNINFORMED,
};

// The AI shopping agent (D-025). Everything in this panel is the AI's: dashed border and
// the "AI-generated proposal" badge. It proposes a cart and nothing more.
export function AgentPanel({ mode, onMode, task, onTask, state, off, disabledReason, onAsk }: AgentProps) {
  const loading = state.kind === "loading";
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!loading) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [loading]);

  const reason = off ? undefined : disabledReason;

  return (
    <Panel title="AI shopping agent" source="ai" badges={[{ source: "ai", label: "AI-generated proposal" }]}>
      <div className={styles["stack"]}>
        <FieldGroup id="agent-mode" legend="What the agent is shown">
          {SHOP_MODES.map((name) => (
            <Choice key={name} type="radio" name="agent-mode" value={name} checked={mode === name} onChange={() => onMode(name)}>
              {MODE_TEXT[name]}
            </Choice>
          ))}
        </FieldGroup>
        <Field
          id="agent-task"
          label="Task (optional)"
          help={`${task.length.toLocaleString("en-US")} of ${MAX_INSTRUCTION_LENGTH.toLocaleString("en-US")} characters. Leave it empty and the agent shops for what the mandate was confirmed for.`}
        >
          {({ id, describedBy }) => (
            <TextArea
              id={id}
              rows={3}
              value={task}
              maxLength={MAX_INSTRUCTION_LENGTH}
              onChange={(event) => onTask(event.target.value)}
              {...(describedBy === undefined ? {} : { "aria-describedby": describedBy })}
            />
          )}
        </Field>
        <p className={styles["note"]}>{AGENT_NOTE}</p>
        <div className={styles["actions"]}>
          <Button variant="secondary" busy={loading} busyLabel={BUSY.asking} disabled={off || reason !== undefined} onClick={onAsk}>
            {LABELS.askAgent}
          </Button>
          {reason === undefined ? null : <span className={styles["reason"]}>{reason}</span>}
        </div>
        {loading && slow ? (
          <p className={styles["reason"]} role="status">
            Still working. The agent can take a while.
          </p>
        ) : null}
        {off ? (
          <Callout tone="notice" role="status">
            {AGENT_OFF_NOTICE}
          </Callout>
        ) : null}
        {state.kind === "failed" && state.failure.tone === "error" ? (
          <Callout tone="danger" role="alert">
            {state.failure.text}
          </Callout>
        ) : null}
        {state.kind === "answered" || state.kind === "declined" ? (
          <div className={styles["answer"]} role="status">
            <p className={styles["note"]}>{state.modeNote}</p>
            {state.kind === "declined" ? (
              <p>
                <strong>The agent declined to propose a cart.</strong> {state.reason}
              </p>
            ) : null}
            <div>
              <p className={styles["factLabel"]}>The agent's reasoning</p>
              <p>{state.rationale === "" ? "The agent gave no reasoning." : state.rationale}</p>
            </div>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
