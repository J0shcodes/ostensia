"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/client.ts";
import { API_AVAILABLE, API_UNREACHABLE } from "../lib/messages.ts";
import { Icon } from "./icons.tsx";
import styles from "./api-status.module.css";

type Status = "checking" | "available" | "unreachable";

const RECHECK_MS = 15_000;

// Whether the Ostensia API (the Fastify process) answers GET /health. It says nothing
// about PayPal or Anthropic: the API only reports that it is running (D-028, D4).
export function ApiStatus() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    let active = true;
    const check = async (): Promise<void> => {
      const result = await api.getHealth();
      if (active) setStatus(result.kind === "ok" ? "available" : "unreachable");
    };
    void check();
    const timer = setInterval(() => void check(), RECHECK_MS);
    // Looking again when the person comes back to the tab.
    const onFocus = (): void => void check();
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const text = status === "available" ? API_AVAILABLE : status === "unreachable" ? API_UNREACHABLE : "Checking the Ostensia API…";
  const icon = status === "available" ? "check" : status === "unreachable" ? "alert" : "clock";
  return (
    <p className={`${styles["status"]} ${styles[status]}`} role="status" aria-live="polite">
      <Icon name={icon} />
      <span>{text}</span>
    </p>
  );
}
