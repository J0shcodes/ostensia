import type { ReactNode } from "react";
import { Icon } from "./icons.tsx";
import type { IconName } from "./icons.tsx";
import styles from "./callout.module.css";

export type CalloutTone = "notice" | "warning" | "danger" | "success";

const ICON: Record<CalloutTone, IconName> = {
  notice: "info",
  warning: "alert",
  danger: "alert",
  success: "check",
};

type CalloutProps = {
  readonly tone: CalloutTone;
  // "status" is announced politely, "alert" at once. Leave it off for text that is
  // already on the page when it loads.
  readonly role?: "status" | "alert";
  readonly children: ReactNode;
};

export function Callout({ tone, role, children }: CalloutProps) {
  return (
    <div className={`${styles["callout"]} ${styles[tone]}`} {...(role === undefined ? {} : { role })}>
      <span className={styles["icon"]}>
        <Icon name={ICON[tone]} />
      </span>
      <div className={styles["body"]}>{children}</div>
    </div>
  );
}
