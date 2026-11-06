"use client";

import { ConfirmedMandateSchema } from "@ostensia/domain";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { isInPast, localInputToUtcIso } from "../lib/datetime.ts";
import {
  FIELD_EXPIRES,
  FIELD_INTENT,
  FIELD_TOTAL,
  describeTerms,
  domId,
  emptyItem,
  itemField,
  withoutMark,
} from "../lib/mandate-form.ts";
import type { ItemFieldName, ItemForm, MandateFormState, ValidationResult } from "../lib/mandate-form.ts";
import { Callout } from "./callout.tsx";
import { Button, MoneyInput, TextArea, TextInput } from "./controls.tsx";
import { ErrorSummary } from "./error-summary.tsx";
import { Field } from "./field.tsx";
import { ItemEditor } from "./item-editor.tsx";
import { Panel } from "./provenance.tsx";
import type { CatalogueState } from "./screen-types.ts";
import styles from "./mandate-form.module.css";

type Props = {
  readonly form: MandateFormState;
  readonly onChange: (next: MandateFormState) => void;
  readonly newKey: () => string;
  readonly validation: ValidationResult;
  // Problems are shown only after the first attempt to confirm.
  readonly showErrors: boolean;
  readonly summaryFocusToken: number;
  readonly catalogue: CatalogueState;
  readonly onRetryCatalogue: () => void;
  // What changed between an AI draft and the form, in words.
  readonly adjustments: readonly string[];
  readonly submitting: boolean;
  // Confirmation is held while the person decides what to do about an unclear result.
  readonly held: boolean;
  readonly onConfirm: () => void;
  readonly children?: ReactNode;
};

const INTENT_MAX = ConfirmedMandateSchema.shape.intentSummary.maxLength;

export function MandateForm({
  form,
  onChange,
  newKey,
  validation,
  showErrors,
  summaryFocusToken,
  catalogue,
  onRetryCatalogue,
  adjustments,
  submitting,
  held,
  onConfirm,
  children,
}: Props) {
  const addButton = useRef<HTMLButtonElement>(null);
  const [focusRow, setFocusRow] = useState<string | null>(null);

  useEffect(() => {
    if (focusRow === null) return;
    document.getElementById(domId(itemField(focusRow, "product")))?.focus();
    setFocusRow(null);
  }, [focusRow]);

  const products = catalogue.kind === "ok" ? catalogue.catalogue.products : [];
  const errors: Record<string, string> = {};
  if (showErrors && !validation.ok) {
    for (const issue of validation.issues) errors[issue.field] = issue.message;
  }

  const patch = (changes: Partial<MandateFormState>, edited: readonly string[]): void => {
    onChange(edited.reduce<MandateFormState>((state, field) => withoutMark(state, field), { ...form, ...changes }));
  };

  const changeItem = (key: string, next: ItemForm, edited: readonly ItemFieldName[]): void => {
    const items = form.items.map((entry) => (entry.key === key ? next : entry));
    patch({ items }, edited.map((name) => itemField(key, name)));
  };

  const addItem = (): void => {
    const key = newKey();
    onChange({ ...form, items: [...form.items, emptyItem(key)] });
    setFocusRow(key);
  };

  const removeItem = (key: string): void => {
    onChange({ ...form, items: form.items.filter((entry) => entry.key !== key) });
    addButton.current?.focus();
  };

  const expires = localInputToUtcIso(form.expiresLocal);
  const pastExpiry = expires.ok && isInPast(expires.iso, Date.now());
  const description = validation.ok ? describeTerms(validation.terms, products) : null;
  const summaryItems = showErrors && !validation.ok ? validation.issues.map((issue) => ({ text: issue.message, field: issue.field })) : [];
  const catalogueReady = catalogue.kind === "ok";

  return (
    <Panel title="Mandate terms">
      <div className={styles["stack"]}>
        {summaryItems.length > 0 ? (
          <ErrorSummary
            title={summaryItems.length === 1 ? "1 problem to fix before you can confirm" : `${summaryItems.length} problems to fix before you can confirm`}
            items={summaryItems}
            focusToken={summaryFocusToken}
          />
        ) : null}

        {catalogue.kind === "error" ? (
          <Callout tone="danger" role="alert">
            <p>The simulated catalogue could not be loaded, so products cannot be chosen yet.</p>
            <div>
              <Button variant="secondary" onClick={onRetryCatalogue}>
                Try again
              </Button>
            </div>
          </Callout>
        ) : null}

        {adjustments.length > 0 ? (
          <Callout tone="notice" role="status">
            <p>Adjusted from the AI draft:</p>
            <ul className={styles["summaryList"]}>
              {adjustments.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          </Callout>
        ) : null}

        <Field
          id={domId(FIELD_INTENT)}
          label="What this is for"
          required
          fromDraft={FIELD_INTENT in form.fromDraft}
          error={errors[FIELD_INTENT]}
          help={
            INTENT_MAX === null
              ? `${form.intentSummary.trim().length.toLocaleString("en-US")} characters`
              : `${form.intentSummary.trim().length.toLocaleString("en-US")} of ${INTENT_MAX.toLocaleString("en-US")} characters`
          }
        >
          {({ id, describedBy, invalid }) => (
            <TextArea
              id={id}
              rows={2}
              value={form.intentSummary}
              invalid={invalid}
              onChange={(event) => patch({ intentSummary: event.target.value }, [FIELD_INTENT])}
              {...(describedBy === undefined ? {} : { "aria-describedby": describedBy })}
            />
          )}
        </Field>

        <Field id="field-currency" label="Currency">
          {({ id }) => <TextInput id={id} readOnly value="USD (the only currency supported)" />}
        </Field>

        <Field
          id={domId(FIELD_TOTAL)}
          label="Maximum total (US dollars)"
          required
          fromDraft={FIELD_TOTAL in form.fromDraft}
          error={errors[FIELD_TOTAL]}
        >
          {({ id, describedBy, invalid }) => (
            <MoneyInput
              id={id}
              value={form.maxTotal}
              invalid={invalid}
              onChange={(event) => patch({ maxTotal: event.target.value }, [FIELD_TOTAL])}
              {...(describedBy === undefined ? {} : { "aria-describedby": describedBy })}
            />
          )}
        </Field>

        <Field
          id={domId(FIELD_EXPIRES)}
          label="Expires"
          required
          fromDraft={FIELD_EXPIRES in form.fromDraft}
          error={errors[FIELD_EXPIRES]}
          help={
            <>
              Your local time. {expires.ok ? <>Sent as <span className={styles["utc"]}>{expires.iso}</span> (UTC).</> : "Choose a date and time."}
            </>
          }
        >
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              type="datetime-local"
              value={form.expiresLocal}
              invalid={invalid}
              onChange={(event) => patch({ expiresLocal: event.target.value }, [FIELD_EXPIRES])}
              {...(describedBy === undefined ? {} : { "aria-describedby": describedBy })}
            />
          )}
        </Field>
        {pastExpiry ? (
          <Callout tone="warning" role="status">
            This time has already passed. Any purchase would be blocked as expired.
          </Callout>
        ) : null}

        <div className={styles["stack"]}>
          <h3 className={styles["sectionTitle"]}>Items</h3>
          <ol className={styles["items"]}>
            {form.items.map((item, index) => (
              <ItemEditor
                key={item.key}
                item={item}
                index={index}
                products={products}
                catalogueReady={catalogueReady}
                fromDraft={form.fromDraft}
                errors={errors}
                canRemove={form.items.length > 1}
                onChange={(next, edited) => changeItem(item.key, next, edited)}
                onRemove={() => removeItem(item.key)}
              />
            ))}
          </ol>
          {errors["items"] === undefined ? null : (
            <Callout tone="danger">
              <p id={domId("items")} tabIndex={-1}>
                {errors["items"]}
              </p>
            </Callout>
          )}
          <div className={styles["actions"]}>
            <Button ref={addButton} variant="secondary" onClick={addItem}>
              Add item
            </Button>
          </div>
        </div>

        {description === null ? null : (
          <Panel title="You are authorising" source="ostensia" nested headingLevel={3}>
            <div className={styles["stack"]}>
              <p className={styles["summaryHeadline"]}>{description.headline}</p>
              <ul className={styles["summaryList"]}>
                {description.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </Panel>
        )}

        <div className={styles["actions"]}>
          <Button busy={submitting} busyLabel="Confirming…" disabled={held} onClick={onConfirm}>
            Confirm mandate
          </Button>
          {held ? <span className={styles["reason"]}>Decide what to do about the message below first.</span> : null}
        </div>

        {children}
      </div>
    </Panel>
  );
}
