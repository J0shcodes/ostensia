"use client";

import { useRef } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import styles from "./controls.module.css";

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  // React 19 passes ref as an ordinary prop, so a caller can move focus to a button.
  readonly ref?: Ref<HTMLButtonElement>;
  readonly variant?: "primary" | "secondary" | "text";
  // While busy the label becomes the action in progress, the button reports aria-busy,
  // and it cannot be pressed again (guidelines section 6).
  readonly busy?: boolean;
  readonly busyLabel?: string;
};

export function Button({ variant = "primary", busy = false, busyLabel, children, disabled, type, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      type={type ?? "button"}
      className={`${styles["button"]} ${styles[variant]}`}
      disabled={disabled === true || busy}
      aria-busy={busy}
    >
      {busy && busyLabel !== undefined ? busyLabel : children}
    </button>
  );
}

type InvalidProp = { readonly invalid?: boolean };

export function TextInput({ invalid = false, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & InvalidProp) {
  return <input {...rest} className={styles["input"]} aria-invalid={invalid} />;
}

export function TextArea({ invalid = false, ...rest }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> & InvalidProp) {
  return <textarea {...rest} className={styles["textarea"]} aria-invalid={invalid} />;
}

export function SelectInput({ invalid = false, ...rest }: Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> & InvalidProp) {
  return <select {...rest} className={styles["select"]} aria-invalid={invalid} />;
}

// "$" before and "USD" after. They are decoration: the field's label says the amount is
// in US dollars.
export function MoneyInput({ invalid = false, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "type" | "inputMode"> & InvalidProp) {
  const input = useRef<HTMLInputElement>(null);
  return (
    // The whole 40px box is the target: pressing on the "$" or the "USD" focuses the input.
    <div
      className={styles["money"]}
      data-invalid={invalid}
      onMouseDown={(event) => {
        if (event.target !== input.current) {
          event.preventDefault();
          input.current?.focus();
        }
      }}
    >
      <span className={styles["affix"]} aria-hidden="true">
        $
      </span>
      <input {...rest} ref={input} type="text" inputMode="decimal" autoComplete="off" aria-invalid={invalid} />
      <span className={styles["affix"]} aria-hidden="true">
        USD
      </span>
    </div>
  );
}

// A radio or checkbox with its label.
export function Choice({ children, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & { readonly children: ReactNode }) {
  return (
    <label className={styles["choice"]}>
      <input {...rest} />
      <span>{children}</span>
    </label>
  );
}
