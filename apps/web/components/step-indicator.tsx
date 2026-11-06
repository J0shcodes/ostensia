import styles from "./step-indicator.module.css";

const STEPS = ["Mandate", "Proposal", "Result"] as const;

// Only the first step exists in this increment. The others are shown as upcoming and
// are not interactive, as the guidelines require (section 8).
export function StepIndicator({ current = 0 }: { readonly current?: number }) {
  return (
    <ol className={styles["steps"]} aria-label="Steps">
      {STEPS.map((name, index) => (
        <li key={name} className={`${styles["step"]} ${index === current ? styles["current"] : ""}`} {...(index === current ? { "aria-current": "step" as const } : {})}>
          <span className={styles["number"]} aria-hidden="true">
            {index + 1}
          </span>
          <span>
            {name}
            {index > current ? <span className="visually-hidden"> (upcoming)</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
