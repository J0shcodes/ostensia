"use client";

import { useState } from "react";
import { shorten } from "../lib/shorten.ts";
import { Button } from "./controls.tsx";
import { Icon } from "./icons.tsx";
import styles from "./copy-value.module.css";

type CopyState = "idle" | "copied" | "failed";

// An identifier in the monospace face, shortened in the middle, with a Copy control
// (guidelines section 4). The full value is in the page for assistive technology, and the
// button's name says what it copies.
export function CopyValue({ label, value }: { readonly label: string; readonly value: string }) {
  const [state, setState] = useState<CopyState>("idle");

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
  };

  return (
    <span className={styles["wrap"]}>
      <code className={styles["mono"]}>
        <span aria-hidden="true">{shorten(value)}</span>
        <span className="visually-hidden">{value}</span>
      </code>
      <Button variant="secondary" aria-label={`Copy ${label}`} onClick={() => void copy()}>
        <Icon name="copy" />
        Copy
      </Button>
      <span role="status" className={styles["note"]}>
        {state === "copied" ? "Copied." : state === "failed" ? "Could not copy." : ""}
      </span>
    </span>
  );
}
