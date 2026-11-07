import Link from "next/link";
import styles from "./step-indicator.module.css";

const STEPS = ["Mandate", "Proposal", "Result"] as const;

type Props = {
  readonly current?: number;
  // Where a step already reached can be opened (guidelines section 12.1). A step with no
  // address is shown as it is and is not interactive: upcoming steps, and the current one.
  readonly hrefs?: readonly (string | undefined)[];
};

export function StepIndicator({ current = 0, hrefs = [] }: Props) {
  return (
    <ol className={styles["steps"]} aria-label="Steps">
      {STEPS.map((name, index) => {
        const href = index < current ? hrefs[index] : undefined;
        return (
          <li
            key={name}
            className={`${styles["step"]} ${index === current ? styles["current"] : ""}`}
            {...(index === current ? { "aria-current": "step" as const } : {})}
          >
            <span className={styles["number"]} aria-hidden="true">
              {index + 1}
            </span>
            {href === undefined ? (
              <span>
                {name}
                {index > current ? <span className="visually-hidden"> (upcoming)</span> : null}
              </span>
            ) : (
              <Link href={href} className={styles["link"]}>
                {name}
              </Link>
            )}
          </li>
        );
      })}
    </ol>
  );
}
