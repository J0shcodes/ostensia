import type { Attempt, AttemptEventSummary, AttemptStatus, ReconcileOutcome } from "./api-types.ts";

// What each attempt status looks like and what a person can do about it (guidelines
// section 12.5). The labels and lines are the approved ones, and brand.test.ts compares
// every row with the guidelines table word for word. Change the document first.
//
// A status never decides anything: the gate sets it, and this only describes it. An
// outcome that is not known (a request with no answer) is never shown as a failure.

export type Tone = "danger" | "warning" | "hold" | "success" | "neutral" | "progress";

// What the person can do from the result page. "settle" and "reconcile" act on the
// attempt; "revoke" acts on its mandate.
export type NextAction = "settle" | "revoke" | "reconcile";

export type StatusPresentation = {
  readonly label: string;
  readonly tone: Tone;
  readonly line: string;
  // Where the indicator belongs: "decision" for what Ostensia decided on its own,
  // "payment" for what PayPal Sandbox reported (guidelines section 7: sources are never
  // merged into one panel).
  readonly panel: "decision" | "payment";
  readonly actions: readonly NextAction[];
};

export const STATUS_PRESENTATION: Readonly<Record<AttemptStatus, StatusPresentation>> = {
  blocked_precheck: {
    label: "Blocked by Ostensia",
    tone: "danger",
    line: "The cart breaks the mandate's terms. Nothing was sent to PayPal.",
    panel: "decision",
    actions: [],
  },
  integrity_failed: {
    label: "Blocked: mandate changed",
    tone: "danger",
    line: "The stored mandate no longer matches its reference. Nothing was sent to PayPal.",
    panel: "decision",
    actions: [],
  },
  abandoned: {
    label: "Stopped before PayPal",
    tone: "warning",
    line: "The API restarted before this reached PayPal. Nothing was sent.",
    panel: "decision",
    actions: [],
  },
  create_rejected: {
    label: "Order not created",
    tone: "danger",
    line: "PayPal Sandbox did not create the order, or it could not be sent. Nothing is on hold.",
    panel: "payment",
    actions: [],
  },
  create_unknown: {
    label: "Order outcome unknown",
    tone: "warning",
    line: "Ostensia did not get PayPal's answer. The order may exist. Nothing will be sent again.",
    panel: "payment",
    actions: [],
  },
  anomaly: {
    label: "Needs a person",
    tone: "warning",
    line: "PayPal Sandbox created an order but did not return exactly one authorization. Nothing was captured.",
    panel: "payment",
    actions: [],
  },
  authorized: {
    label: "Funds on hold",
    tone: "hold",
    line: "PayPal authorized the payment: the buyer's funds are on hold; no money has moved.",
    panel: "payment",
    actions: ["settle", "revoke"],
  },
  captured: {
    label: "Captured",
    tone: "success",
    line: "Payment captured in PayPal Sandbox.",
    panel: "payment",
    actions: [],
  },
  capture_pending: {
    label: "Capture pending",
    tone: "hold",
    line: "PayPal Sandbox accepted the capture but has not completed it.",
    panel: "payment",
    actions: ["reconcile"],
  },
  voided: {
    label: "Voided",
    tone: "neutral",
    line: "Authorization voided in PayPal Sandbox; nothing was captured. When the hold leaves the buyer's balance is up to PayPal.",
    panel: "payment",
    actions: [],
  },
  write_refused: {
    label: "Already settled",
    tone: "warning",
    line: "PayPal Sandbox reports this authorization as already settled.",
    panel: "payment",
    actions: ["reconcile"],
  },
  write_rejected: {
    label: "PayPal rejected the request",
    tone: "danger",
    line: "Nothing was captured or voided.",
    panel: "payment",
    actions: [],
  },
  write_unknown: {
    label: "Outcome unknown",
    tone: "warning",
    line: "Ostensia did not get PayPal's answer and will not send it again. Check PayPal's record.",
    panel: "payment",
    actions: ["reconcile"],
  },
  no_action: {
    label: "Nothing sent",
    tone: "neutral",
    line: "The authorization was no longer open when Ostensia checked it, so nothing was sent.",
    panel: "payment",
    actions: [],
  },
  conflict: {
    label: "Needs a person",
    tone: "danger",
    line: "PayPal's record does not match what Ostensia asked for.",
    panel: "payment",
    actions: [],
  },
  // Transient: the gate is mid-request. Seen only while waiting, or after a restart before
  // the log is replayed.
  started: { label: "In progress", tone: "progress", line: "Ostensia is working on this.", panel: "decision", actions: [] },
  prechecked: { label: "In progress", tone: "progress", line: "Ostensia is working on this.", panel: "decision", actions: [] },
  creating: { label: "In progress", tone: "progress", line: "Ostensia is working on this.", panel: "payment", actions: [] },
  writing: { label: "In progress", tone: "progress", line: "Ostensia is working on this.", panel: "payment", actions: [] },
};

export function presentStatus(status: AttemptStatus): StatusPresentation {
  return STATUS_PRESENTATION[status];
}

// Statuses the gate reaches without ever contacting PayPal (apps/api/src/gate/gate.ts:
// a pre-check block, an integrity failure and an abandoned attempt make no PayPal call).
const NO_PAYPAL: ReadonlySet<AttemptStatus> = new Set<AttemptStatus>([
  "started",
  "prechecked",
  "blocked_precheck",
  "integrity_failed",
  "abandoned",
]);

// The payment panel (and its "PayPal Sandbox" treatment) is for attempts that reached
// PayPal. For the others the page says nothing was sent.
export function reachedPayPal(status: AttemptStatus): boolean {
  return !NO_PAYPAL.has(status);
}

// A PayPal Sandbox badge appears only on a step that made a PayPal call (guidelines
// section 7). Some attempts got as far as "creating an order" and no further, because the
// request could not be sent (no token, or nothing payable). The audit events say which:
// an `order_result` or `write_result` with the outcome "not_sent" is a request that never
// left. Without events the answer is "yes", the cautious reading for an attempt that
// reached PayPal's status.
export function paypalWasCalled(attempt: Pick<Attempt, "status">, events: readonly AttemptEventSummary[] | null): boolean {
  if (!reachedPayPal(attempt.status)) return false;
  if (events === null) return true;
  const sent = events.some((event) => {
    switch (event.type) {
      case "order_result":
      case "write_result":
        return event.outcome !== "not_sent";
      case "authorization_read":
      case "reconciled":
        return true;
      case "settle_read_failed":
        return !(event.detail ?? "").startsWith("token_");
      default:
        return false;
    }
  });
  return sent;
}

// The last thing that happened to an attempt that is still on hold, when it was a request
// that did not go anywhere. Without this the page would show "Funds on hold" after a
// settle and say nothing about why nothing changed.
export function unsentNotice(attempt: Pick<Attempt, "status">, events: readonly AttemptEventSummary[] | null): string | null {
  if (attempt.status !== "authorized" || events === null) return null;
  const last = [...events].reverse().find((event) => event.type !== "authorization_read" && event.type !== "final_decided" && event.type !== "write_requested");
  if (last === undefined) return null;
  if (last.type === "settle_read_failed") {
    return "Ostensia could not read the authorization from PayPal Sandbox. Nothing was written. You can settle again.";
  }
  if (last.type === "write_result" && last.outcome === "not_sent") {
    return "Ostensia could not send the request to PayPal Sandbox. Nothing was written. You can settle again.";
  }
  return null;
}

// What reading PayPal's record concluded (guidelines section 12.5).
export const RECONCILE_TEXT: Readonly<Record<ReconcileOutcome, string>> = {
  captured: "PayPal's record shows the payment was captured.",
  voided: "PayPal's record shows the authorization was voided.",
  conflict: "PayPal's record does not match what Ostensia asked for. A person needs to look at it.",
  unchanged: "PayPal's record does not settle it yet. Check again later.",
  not_applicable: "There was nothing to check for this attempt.",
};
