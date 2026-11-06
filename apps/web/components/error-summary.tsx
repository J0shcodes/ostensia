"use client";

import { useEffect, useRef } from "react";
import { domId } from "../lib/mandate-form.ts";
import { Icon } from "./icons.tsx";
import styles from "./error-summary.module.css";

export type SummaryItem = { readonly text: string; readonly field?: string };

type Props = {
  readonly title: string;
  readonly items: readonly SummaryItem[];
  // Changes each time the summary should take focus (each attempt to submit).
  readonly focusToken: number;
};

// Names the problems in one place, takes focus when it appears so keyboard and
// screen-reader users land on it, and links each problem to its field (guidelines
// section 8).
export function ErrorSummary({ title, items, focusToken }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusToken > 0) ref.current?.focus();
  }, [focusToken]);

  return (
    <div ref={ref} className={styles["summary"]} role="alert" tabIndex={-1}>
      <p className={styles["title"]}>
        <Icon name="alert" />
        <span>{title}</span>
      </p>
      <ul className={styles["list"]}>
        {items.map((item, index) => (
          <li key={`${item.field ?? "general"}-${index}`}>
            {item.field === undefined ? (
              item.text
            ) : (
              <a
                className={styles["link"]}
                href={`#${domId(item.field)}`}
                onClick={(event) => {
                  event.preventDefault();
                  document.getElementById(domId(item.field ?? ""))?.focus();
                }}
              >
                {item.text}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
