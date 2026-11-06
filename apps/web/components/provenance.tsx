import type { ReactNode } from "react";
import { Icon } from "./icons.tsx";
import type { IconName } from "./icons.tsx";
import styles from "./provenance.module.css";

// Every piece of content that comes from a specific source says so (guidelines section
// 7). Increment 7a has four sources. The PayPal Sandbox treatment is added with the
// first screen that calls PayPal, so that no badge ever appears without a PayPal call.
export type Source = "ai" | "ostensia" | "person" | "simulated";

const BADGE_TEXT: Record<Source, string> = {
  ai: "AI-generated draft",
  ostensia: "Checked by Ostensia",
  person: "Confirmed by you",
  simulated: "Simulated shop",
};

const BADGE_ICON: Record<Source, IconName> = {
  ai: "info",
  ostensia: "check",
  person: "check",
  simulated: "info",
};

const BADGE_CLASS: Record<Source, string> = {
  ai: "badgeAi",
  ostensia: "badgeOstensia",
  person: "badgePerson",
  simulated: "badgeSimulated",
};

export function ProvenanceBadge({ source, label }: { readonly source: Source; readonly label?: string }) {
  return (
    <span className={`${styles["badge"]} ${styles[BADGE_CLASS[source]]}`}>
      <Icon name={BADGE_ICON[source]} />
      {label ?? BADGE_TEXT[source]}
    </span>
  );
}

type PanelProps = {
  readonly title: ReactNode;
  // With a source the panel gets that source's treatment and badge. Without one it is a
  // plain card (content the person typed, which no one has checked yet).
  readonly source?: Source;
  readonly badges?: readonly { readonly source: Source; readonly label?: string }[];
  readonly nested?: boolean;
  readonly headingLevel?: 2 | 3;
  readonly children: ReactNode;
};

export function Panel({ title, source, badges, nested = false, headingLevel = 2, children }: PanelProps) {
  const shown = badges ?? (source === undefined ? [] : [{ source }]);
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const className = [styles["panel"], source === undefined ? "" : styles[source], nested ? styles["nested"] : ""]
    .filter((part) => part !== undefined && part !== "")
    .join(" ");
  return (
    <section className={className}>
      <div className={styles["header"]}>
        <Heading className={styles["title"]}>{title}</Heading>
        {shown.length === 0 ? null : (
          <div className={styles["badges"]}>
            {shown.map((badge) => (
              <ProvenanceBadge key={`${badge.source}-${badge.label ?? ""}`} source={badge.source} {...(badge.label === undefined ? {} : { label: badge.label })} />
            ))}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}
