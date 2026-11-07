"use client";

import type { ConfirmedMandate } from "@ostensia/domain";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/client.ts";
import { draftToForm, emptyForm, validateForm } from "../lib/mandate-form.ts";
import type { MandateFormState } from "../lib/mandate-form.ts";
import { findMatchingMandates } from "../lib/mandate-match.ts";
import { PAGE_INTRO, describeApiError, describeDraftFailure, describeUnreachable } from "../lib/messages.ts";
import { ConfirmOutcome } from "./confirm-outcome.tsx";
import { ConfirmedCard } from "./confirmed-card.tsx";
import { DraftPanel } from "./draft-panel.tsx";
import { MandateForm } from "./mandate-form.tsx";
import type { CatalogueState, DraftState, SentMandate, SubmitState } from "./screen-types.ts";
import { StepIndicator } from "./step-indicator.tsx";
import styles from "./mandate-screen.module.css";

// Step 1: create a mandate. A person may ask the AI for a draft, then fills in and
// confirms the terms. Nothing here approves a purchase, and nothing here calls PayPal:
// confirming a mandate records it in the Ostensia API and nothing else.
export function MandateScreen() {
  const keyCounter = useRef(1);
  const newKey = useCallback((): string => `i${++keyCounter.current}`, []);

  const [form, setForm] = useState<MandateFormState>(() => emptyForm("i1"));
  const [catalogue, setCatalogue] = useState<CatalogueState>({ kind: "loading" });
  const [instruction, setInstruction] = useState("");
  const [draft, setDraft] = useState<DraftState>({ kind: "idle" });
  const [aiOff, setAiOff] = useState(false);
  const [adjustments, setAdjustments] = useState<readonly string[]>([]);
  const [submit, setSubmit] = useState<SubmitState>({ kind: "idle" });
  const [showErrors, setShowErrors] = useState(false);
  // Counts attempts to confirm, so a summary takes focus each time and not only once.
  const [attempts, setAttempts] = useState(0);

  const validation = useMemo(() => validateForm(form), [form]);

  const loadCatalogue = useCallback(async (): Promise<void> => {
    setCatalogue({ kind: "loading" });
    const result = await api.getCatalogue();
    setCatalogue(result.kind === "ok" ? { kind: "ok", catalogue: result.body } : { kind: "error" });
  }, []);

  useEffect(() => {
    void loadCatalogue();
  }, [loadCatalogue]);

  const runDraft = async (): Promise<void> => {
    setDraft({ kind: "loading" });
    const result = await api.draftMandate(instruction.trim());
    if (result.kind === "ok") {
      setDraft({ kind: "ok", response: result.body, used: false });
      return;
    }
    const failure = describeDraftFailure(result);
    // "Not configured" does not change until the API restarts with a key, so the button
    // stays off and the notice stays (guidelines section 8).
    if (failure.tone === "off") setAiOff(true);
    setDraft({ kind: "failed", failure });
  };

  // The only way AI output reaches the form: the person presses "Use this draft in the
  // form" (D-028, D3). It is never filled in on its own.
  const useDraft = (): void => {
    if (draft.kind !== "ok") return;
    const prefill = draftToForm(draft.response.draft, newKey);
    setForm(prefill.form);
    setAdjustments(prefill.adjustments);
    setDraft({ kind: "ok", response: draft.response, used: true });
    setShowErrors(false);
    setSubmit({ kind: "idle" });
  };

  const checkForExisting = async (sent: SentMandate, detail: string): Promise<void> => {
    setSubmit({ kind: "uncertain", detail, check: { kind: "checking" }, sent });
    const listed = await api.listMandates();
    if (listed.kind !== "ok") {
      setSubmit({ kind: "uncertain", detail, check: { kind: "could_not_check" }, sent });
      return;
    }
    const matches = findMatchingMandates(listed.body.mandates, sent.terms, sent.intentSummary);
    setSubmit({ kind: "uncertain", detail, check: matches.length > 0 ? { kind: "found", matches } : { kind: "none" }, sent });
  };

  const send = async (sent: SentMandate): Promise<void> => {
    setSubmit({ kind: "submitting" });
    const result = await api.createMandate(sent.terms, sent.intentSummary);
    if (result.kind === "ok") {
      setSubmit({ kind: "confirmed", mandate: result.body.mandate, existing: false });
      return;
    }
    // A 4xx is the API refusing the request: no mandate was created. Anything else (a
    // server error, no answer, an answer this page does not understand) is not known to
    // have failed, so the page checks before anything is repeated.
    if (result.kind === "api_error" && result.status < 500) {
      setAttempts((count) => count + 1);
      setSubmit({ kind: "refused", message: describeApiError(result.error) });
      return;
    }
    const detail =
      result.kind === "api_error"
        ? describeApiError(result.error)
        : result.kind === "unreachable"
          ? describeUnreachable(result.reason)
          : "The Ostensia API sent a response this page does not understand.";
    await checkForExisting(sent, detail);
  };

  const confirm = (): void => {
    setShowErrors(true);
    setAttempts((count) => count + 1);
    const result = validateForm(form);
    if (!result.ok) {
      setSubmit({ kind: "invalid" });
      return;
    }
    void send({ terms: result.terms, intentSummary: result.intentSummary });
  };

  const useExisting = (mandate: ConfirmedMandate): void => setSubmit({ kind: "confirmed", mandate, existing: true });

  const another = (): void => {
    keyCounter.current += 1;
    setForm(emptyForm(`i${keyCounter.current}`));
    setAdjustments([]);
    setSubmit({ kind: "idle" });
    setShowErrors(false);
    setDraft({ kind: "idle" });
    setInstruction("");
  };

  const products = catalogue.kind === "ok" ? catalogue.catalogue.products : [];

  return (
    <main className={styles["page"]}>
      <div className={styles["intro"]}>
        <h1>Create a purchase mandate</h1>
        <p className={styles["lead"]}>{PAGE_INTRO}</p>
      </div>
      <StepIndicator />

      {submit.kind === "confirmed" ? (
        <ConfirmedCard mandate={submit.mandate} existing={submit.existing} products={products} onAnother={another} />
      ) : (
        <div className={styles["columns"]}>
          <DraftPanel
            instruction={instruction}
            onInstructionChange={setInstruction}
            state={draft}
            aiOff={aiOff}
            onDraft={() => void runDraft()}
            onUse={useDraft}
          />
          <MandateForm
            form={form}
            onChange={setForm}
            newKey={newKey}
            validation={validation}
            showErrors={showErrors}
            summaryFocusToken={submit.kind === "invalid" ? attempts : 0}
            catalogue={catalogue}
            onRetryCatalogue={() => void loadCatalogue()}
            adjustments={adjustments}
            submitting={submit.kind === "submitting"}
            held={submit.kind === "uncertain"}
            onConfirm={confirm}
          >
            <ConfirmOutcome
              submit={submit}
              focusToken={attempts}
              onUseExisting={useExisting}
              onCreateAnyway={() => submit.kind === "uncertain" && void send(submit.sent)}
              onCheckAgain={() => submit.kind === "uncertain" && void checkForExisting(submit.sent, submit.detail)}
            />
          </MandateForm>
        </div>
      )}
    </main>
  );
}
