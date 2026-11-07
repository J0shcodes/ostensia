import { DISCLOSURE } from "../lib/messages.ts";
import { ApiStatus } from "./api-status.tsx";
import styles from "./site-header.module.css";

// On every page: the wordmark, whether the Ostensia API answers, and the persistent
// disclosure that this is a sandbox demo (guidelines sections 2, 5 and 10).
export function SiteHeader() {
  return (
    <>
      <header className={styles["header"]}>
        <div className={styles["inner"]}>
          <span className={styles["wordmark"]}>Ostensia</span>
          <ApiStatus />
        </div>
      </header>
      <div className={styles["disclosure"]}>
        <p className={styles["disclosureInner"]}>{DISCLOSURE}</p>
      </div>
    </>
  );
}
