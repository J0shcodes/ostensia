"use client";

import { useEffect, useState } from "react";
import type { DraftResponse } from "../lib/api-types.ts";
import { AI_DRAFT_NOTE, AI_OFF_NOTICE, MAX_INSTRUCTION_LENGTH, describeMissingField, humanizeDraftText } from "../lib/messages.ts";
import { Callout } from "./callout.tsx";
import { Button, TextArea } from "./controls.tsx";
import { Field } from "./field.tsx";
import { Panel } from "./provenance.tsx";
import type { DraftState } from "./screen-types.ts";
import styles from "./draft-panel.module.css";

type Props = {
  readonly instruction: string;
  readonly onInstructionChange: (value: string) => void;
  readonly state: DraftState;
  // True once the API has said that drafting is not configured.
  readonly aiOff: boolean;
  readonly onDraft: () => void;
  readonly onUse: () => void;
};

// How long a draft may take before the page says it is still working.
const SLOW_AFTER_MS = 8_000;

function List({ items }: { readonly items: readonly string[] }) {
  return (
    <ul className={styles["list"]}>
      {items.map((text, index) => (
        <li key={`${index}-${text}`}>{text}</li>
      ))}
    </ul>
  );
}

// The deterministic check on a draft: what is missing, what is not acceptable, and the
// warnings. It comes from Ostensia's code, not from the AI, so it has its own solid
// panel inside the dashed AI one (guidelines section 7).
function CompletenessCheck({ response }: { readonly response: DraftResponse }) {
  const { completeness, warnings } = response;
  return (
    <Panel title="Completeness check" source="ostensia" nested headingLevel={3}>
      <div className={styles["stack"]}>
        {completeness.status === "complete" ? (
          <p>The draft has every field. Review it before you confirm.</p>
        ) : (
          <p>The draft is not complete. You will need to fill in what is missing.</p>
        )}
        {completeness.missing.length === 0 ? null : (
          <div className={styles["group"]}>
            <p className={styles["factLabel"]}>Missing</p>
            <List items={completeness.missing.map(describeMissingField)} />
          </div>
        )}
        {completeness.problems.length === 0 ? null : (
          <div className={styles["group"]}>
            <p className={styles["factLabel"]}>Not acceptable as written</p>
            <List items={completeness.problems.map(humanizeDraftText)} />
          </div>
        )}
        {warnings.length === 0 ? null : (
          <div className={styles["group"]}>
            <p className={styles["factLabel"]}>Warnings</p>
            <List items={warnings.map(humanizeDraftText)} />
          </div>
        )}
      </div>
    </Panel>
  );
}

export function DraftPanel({ instruction, onInstructionChange, state, aiOff, onDraft, onUse }: Props) {
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

  const empty = instruction.trim() === "";
  const reason = aiOff ? undefined : empty ? "Write a description first." : undefined;

  return (
    <div className={styles["stack"]}>
      <Panel title="Describe it (optional)">
        <div className={styles["stack"]}>
          <Field
            id="draft-instruction"
            label="What should the agent be allowed to buy?"
            help={`${instruction.length.toLocaleString("en-US")} of ${MAX_INSTRUCTION_LENGTH.toLocaleString("en-US")} characters`}
          >
            {({ id, describedBy }) => (
              <TextArea
                id={id}
                rows={5}
                value={instruction}
                maxLength={MAX_INSTRUCTION_LENGTH}
                onChange={(event) => onInstructionChange(event.target.value)}
                {...(describedBy === undefined ? {} : { "aria-describedby": describedBy })}
              />
            )}
          </Field>
          <p className={styles["note"]}>{AI_DRAFT_NOTE}</p>
          <div className={styles["actions"]}>
            <Button variant="secondary" busy={loading} busyLabel="Drafting…" disabled={aiOff || empty} onClick={onDraft}>
              Draft with AI
            </Button>
            {reason === undefined ? null : <span className={styles["reason"]}>{reason}</span>}
          </div>
          {loading && slow ? (
            <p className={styles["reason"]} role="status">
              Still working. An AI draft can take a while.
            </p>
          ) : null}
          {aiOff ? (
            <Callout tone="notice" role="status">
              {AI_OFF_NOTICE}
            </Callout>
          ) : null}
          {state.kind === "failed" && state.failure.tone === "error" ? (
            <Callout tone="danger" role="alert">
              {state.failure.text}
            </Callout>
          ) : null}
        </div>
      </Panel>

      {state.kind === "ok" ? (
        <Panel title="What the AI read" source="ai" badges={[{ source: "ai", label: "AI-generated draft" }]}>
          <div className={styles["stack"]}>
            <p className={styles["note"]}>{state.response.label}</p>
            <div className={styles["facts"]}>
              <div className={styles["group"]}>
                <p className={styles["factLabel"]}>Summary</p>
                <p>{state.response.draft.intentSummary.trim() === "" ? "The AI gave no summary." : state.response.draft.intentSummary}</p>
              </div>
              {state.response.draft.notes.length === 0 ? null : (
                <div className={styles["group"]}>
                  <p className={styles["factLabel"]}>The AI's notes</p>
                  <List items={state.response.draft.notes} />
                </div>
              )}
            </div>
            <CompletenessCheck response={state.response} />
            <p className={styles["note"]}>Using the draft replaces what is currently in the form. Nothing is confirmed until you press Confirm mandate.</p>
            <div className={styles["actions"]}>
              <Button variant="secondary" onClick={onUse}>
                Use this draft in the form
              </Button>
            </div>
            {state.used ? (
              <p className={styles["note"]} role="status">
                Copied into the form. Fields marked “from AI draft” are the AI's. Edit anything you like.
              </p>
            ) : null}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
