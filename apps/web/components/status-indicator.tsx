import type { AttemptStatus } from "../lib/api-types.ts";
import { presentStatus } from "../lib/attempt-status.ts";
import type { Tone } from "../lib/attempt-status.ts";
import { Icon } from "./icons.tsx";
import type { IconName } from "./icons.tsx";
import styles from "./status-indicator.module.css";

// Guidelines section 6: an icon, a short label and one line of explanation, with the
// colour from the status tokens. The icon and the words carry the meaning as well as the
// colour (section 3: colour is never the only signal).
const ICON: Record<Tone, IconName> = {
  danger: "cross",
  warning: "alert",
  hold: "clock",
  success: "check",
  neutral: "info",
  progress: "clock",
};

export function StatusIndicator({ status }: { readonly status: AttemptStatus }) {
  const { label, tone, line } = presentStatus(status);
  return (
    <div className={`${styles["indicator"]} ${styles[tone]}`} role="status">
      <p className={styles["label"]}>
        <Icon name={ICON[tone]} />
        <span>{label}</span>
      </p>
      <p className={styles["line"]}>{line}</p>
    </div>
  );
}
