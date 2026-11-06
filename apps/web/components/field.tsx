import type { ReactNode } from "react";
import { Icon } from "./icons.tsx";
import styles from "./field.module.css";

type ControlProps = {
  readonly id: string;
  // Both ids that describe the control, for aria-describedby. Undefined when there is
  // neither help nor an error.
  readonly describedBy: string | undefined;
  readonly invalid: boolean;
};

type FieldProps = {
  // The control's element id. Help and error ids are derived from it.
  readonly id: string;
  readonly label: ReactNode;
  readonly help?: ReactNode;
  readonly error?: string | undefined;
  readonly required?: boolean;
  // True while the value is the AI's and has not been edited.
  readonly fromDraft?: boolean;
  readonly children: (control: ControlProps) => ReactNode;
};

// A label, a control, help text and an error, wired together. Required fields say
// "Required" in words, never by an asterisk alone. An error is linked to its control
// with aria-describedby and marked with an icon as well as colour.
export function Field({ id, label, help, error, required = false, fromDraft = false, children }: FieldProps) {
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const describedBy = [help === undefined ? null : helpId, error === undefined ? null : errorId].filter((value) => value !== null).join(" ");
  return (
    <div className={styles["field"]}>
      <div className={styles["labelRow"]}>
        <label className={styles["label"]} htmlFor={id}>
          {label}
        </label>
        {required ? <span className={styles["required"]}>Required</span> : null}
        {fromDraft ? <span className={styles["aiMark"]}>from AI draft</span> : null}
      </div>
      {children({ id, describedBy: describedBy === "" ? undefined : describedBy, invalid: error !== undefined })}
      {help === undefined ? null : (
        <p id={helpId} className={styles["help"]}>
          {help}
        </p>
      )}
      {error === undefined ? null : (
        <p id={errorId} className={styles["error"]}>
          <Icon name="alert" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

// The same layout for a group of controls (radios, checkboxes). The fieldset itself can
// take focus, so an error summary can move to it.
type GroupProps = {
  readonly id: string;
  readonly legend: ReactNode;
  readonly error?: string | undefined;
  readonly required?: boolean;
  readonly fromDraft?: boolean;
  readonly children: ReactNode;
};

export function FieldGroup({ id, legend, error, required = false, fromDraft = false, children }: GroupProps) {
  const errorId = `${id}-error`;
  return (
    <fieldset id={id} tabIndex={-1} className={styles["field"]} aria-describedby={error === undefined ? undefined : errorId}>
      <legend className={styles["labelRow"]}>
        <span className={styles["label"]}>{legend}</span>
        {required ? <span className={styles["required"]}> Required</span> : null}
        {fromDraft ? <span className={styles["aiMark"]}> from AI draft</span> : null}
      </legend>
      {children}
      {error === undefined ? null : (
        <p id={errorId} className={styles["error"]}>
          <Icon name="alert" />
          <span>{error}</span>
        </p>
      )}
    </fieldset>
  );
}
