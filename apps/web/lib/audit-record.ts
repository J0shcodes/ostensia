import type { AttemptEnvelope, AttemptEventSummary } from "./api-types.ts";
import { RECONCILE_TEXT } from "./attempt-status.ts";
import { usd } from "./cart.ts";

// The audit record of one attempt in plain words (guidelines section 13). The log is the
// source of truth and this only describes it: nothing here decides anything, reorders the
// events, or hides one. An event of a kind this page does not know is shown as such.
//
// The words are the approved table in section 13.4. brand.test.ts compares every row with
// the guidelines word for word, and api-drift.test.ts fails when the API gains an event
// type that is not covered here. Change the document first.

// Who produced the entry (guidelines section 7). "paypal" is used only for a request that
// really was sent to PayPal Sandbox, the same rule paypalWasCalled applies to the status.
export type EntrySource = "ostensia" | "paypal" | "none";

export type Wording = { readonly source: EntrySource; readonly title: string; readonly line: string };

export const AUDIT_WORDING: Readonly<Record<string, Wording>> = {
  attempt_started: { source: "ostensia", title: "Attempt started", line: "Ostensia recorded the cart and the mandate it is checked against." },
  "precheck_decided:allow": { source: "ostensia", title: "Pre-check: allowed", line: "Made before anything was sent to PayPal." },
  "precheck_decided:block": { source: "ostensia", title: "Pre-check: blocked", line: "Made before anything was sent to PayPal." },
  integrity_failed: { source: "ostensia", title: "Mandate reference check failed", line: "The stored mandate no longer matches its reference." },
  order_requested: { source: "ostensia", title: "About to create the PayPal order", line: "Recorded before the request was sent." },
  "order_result:created": { source: "paypal", title: "Order created", line: "PayPal Sandbox created the order and returned one authorization." },
  "order_result:anomaly": { source: "paypal", title: "Order needs a person", line: "PayPal Sandbox created an order but did not return exactly one authorization." },
  "order_result:rejected": { source: "paypal", title: "Order refused", line: "PayPal Sandbox did not create the order." },
  "order_result:unknown": { source: "paypal", title: "No answer to the order request", line: "Ostensia did not get PayPal's answer. The order may exist." },
  "order_result:not_sent": { source: "ostensia", title: "Order not sent", line: "Ostensia could not send the request to PayPal Sandbox. Nothing was created." },
  authorization_read: { source: "paypal", title: "Authorization read", line: "PayPal reports the authorization as {status}." },
  settle_read_failed: { source: "paypal", title: "Could not read the authorization", line: "Nothing was written." },
  "settle_read_failed:no_access": {
    source: "ostensia",
    title: "Could not reach PayPal Sandbox",
    line: "Ostensia could not get access to PayPal Sandbox, so nothing was read or written.",
  },
  "final_decided:allow": { source: "ostensia", title: "Final check: allowed", line: "Made after Ostensia read the authorization from PayPal Sandbox." },
  "final_decided:block": { source: "ostensia", title: "Final check: blocked", line: "Made after Ostensia read the authorization from PayPal Sandbox." },
  write_requested: { source: "ostensia", title: "About to {action}", line: "Recorded before the request was sent." },
  "write_result:captured": { source: "paypal", title: "Captured", line: "PayPal Sandbox captured the payment." },
  "write_result:capture_pending": { source: "paypal", title: "Capture pending", line: "PayPal Sandbox accepted the capture but has not completed it." },
  "write_result:voided": { source: "paypal", title: "Voided", line: "PayPal Sandbox voided the authorization. Nothing was captured." },
  "write_result:refused": { source: "paypal", title: "Already settled", line: "PayPal Sandbox reports this authorization as already settled." },
  "write_result:rejected": { source: "paypal", title: "Rejected by PayPal", line: "Nothing was captured or voided." },
  "write_result:unknown": { source: "paypal", title: "No answer to the {action} request", line: "Ostensia did not get PayPal's answer and will not send it again." },
  "write_result:not_sent": { source: "ostensia", title: "{Action} not sent", line: "Ostensia could not send the request to PayPal Sandbox. Nothing was written." },
  no_action: { source: "ostensia", title: "Nothing sent", line: "The authorization was {state}, so Ostensia sent nothing." },
  "reconciled:captured": { source: "paypal", title: "PayPal's record read", line: RECONCILE_TEXT.captured },
  "reconciled:voided": { source: "paypal", title: "PayPal's record read", line: RECONCILE_TEXT.voided },
  "reconciled:conflict": { source: "paypal", title: "PayPal's record read", line: RECONCILE_TEXT.conflict },
  "reconciled:unchanged": { source: "paypal", title: "PayPal's record read", line: RECONCILE_TEXT.unchanged },
  unknown: { source: "none", title: "Unrecognised event", line: "Ostensia does not know this kind of record: {type}." },
};

export type AuditFact = { readonly label: string; readonly value: string; readonly copy: boolean };

export type AuditEntry = {
  // The row of the wording table this entry used.
  readonly wording: string;
  // When the gate wrote the event (UTC, ISO 8601), or null if the record has no time.
  readonly at: string | null;
  readonly source: EntrySource;
  readonly title: string;
  readonly line: string;
  // The API's own explanation of a decision, not rewritten. Only the latest pre-check and
  // the latest final check carry one, because the API sends one of each.
  readonly explanation: readonly string[] | null;
  readonly facts: readonly AuditFact[];
  // What the gate recorded about a PayPal outcome, exactly as written.
  readonly detail: string | null;
};

type Variables = Readonly<Record<string, string>>;

const fill = (template: string, variables: Variables): string =>
  template.replace(/\{([A-Za-z]+)\}/g, (_match, name: string) => variables[name] ?? `{${name}}`);

const capitalised = (word: string): string => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`;

const ORDER_OUTCOMES: ReadonlySet<string> = new Set(["created", "anomaly", "rejected", "unknown", "not_sent"]);
const WRITE_OUTCOMES: ReadonlySet<string> = new Set(["captured", "capture_pending", "voided", "refused", "rejected", "unknown", "not_sent"]);
const RECONCILE_RESULTS: ReadonlySet<string> = new Set(["captured", "voided", "conflict", "unchanged"]);

// Which row of the table describes this event, or "unknown". A field the row needs and the
// event does not have makes it unknown too: better an honest "unrecognised" than a guess.
function wordingFor(event: AttemptEventSummary): string {
  switch (event.type) {
    case "attempt_started":
    case "integrity_failed":
    case "order_requested":
    case "authorization_read":
    case "no_action":
      if (event.type === "authorization_read" && event.authorization === undefined) return "unknown";
      if (event.type === "no_action" && event.authorizationState === undefined) return "unknown";
      return event.type;
    case "precheck_decided":
    case "final_decided":
      return event.decision === undefined ? "unknown" : `${event.type}:${event.decision}`;
    case "order_result":
      return event.outcome !== null && ORDER_OUTCOMES.has(event.outcome) ? `order_result:${event.outcome}` : "unknown";
    case "write_result":
      return event.outcome !== null && WRITE_OUTCOMES.has(event.outcome) && event.action !== undefined
        ? `write_result:${event.outcome}`
        : "unknown";
    case "write_requested":
      return event.action === undefined ? "unknown" : "write_requested";
    case "settle_read_failed":
      // The gate writes "token_..." when it could not even get access to PayPal, so no
      // request to PayPal was made (the rule attempt-status.ts uses as well).
      return (event.detail ?? "").startsWith("token_") ? "settle_read_failed:no_access" : "settle_read_failed";
    case "reconciled":
      return event.result !== undefined && RECONCILE_RESULTS.has(event.result) ? `reconciled:${event.result}` : "unknown";
    default:
      return "unknown";
  }
}

function factsFor(event: AttemptEventSummary): AuditFact[] {
  const facts: AuditFact[] = [];
  if (event.orderId !== undefined && event.orderId !== null) facts.push({ label: "Order ID", value: event.orderId, copy: true });
  if (event.authorizationId !== undefined && event.authorizationId !== null) {
    facts.push({ label: "Authorization ID", value: event.authorizationId, copy: true });
  }
  if (event.captureId !== undefined && event.captureId !== null) facts.push({ label: "Capture ID", value: event.captureId, copy: true });
  const authorization = event.authorization;
  if (authorization !== undefined) {
    if (authorization.amountMinor !== null) facts.push({ label: "Amount", value: usd(authorization.amountMinor), copy: false });
    // Where the value was stored, nothing more (guidelines section 10: it proves nothing).
    if (authorization.customId !== null && authorization.customId !== "") {
      facts.push({ label: "Reference stored with the payment", value: authorization.customId, copy: true });
    }
  }
  return facts;
}

function lastIndexOf(events: readonly AttemptEventSummary[], type: string): number {
  for (let index = events.length - 1; index >= 0; index -= 1) if (events[index]?.type === type) return index;
  return -1;
}

// The events in the order the log holds them (oldest first), one entry each.
export function buildAuditRecord(
  events: readonly AttemptEventSummary[],
  explanation: AttemptEnvelope["explanation"],
): AuditEntry[] {
  const lastPrecheck = lastIndexOf(events, "precheck_decided");
  const lastFinal = lastIndexOf(events, "final_decided");
  return events.map((event, index) => {
    const wording = wordingFor(event);
    const row = AUDIT_WORDING[wording] ?? AUDIT_WORDING["unknown"];
    if (row === undefined) throw new Error("the wording table has no row for unknown events");
    const action = event.action ?? "";
    const variables: Variables = {
      status: event.authorization?.statusRaw ?? "",
      state: event.authorizationState ?? "",
      action,
      Action: capitalised(action),
      type: event.type,
    };
    const attached = index === lastPrecheck ? explanation.precheck : index === lastFinal ? explanation.final : null;
    const detail = event.detail === null || event.detail === "" ? null : event.detail;
    return {
      wording,
      at: event.at ?? null,
      source: row.source,
      title: fill(row.title, variables),
      line: fill(row.line, variables),
      explanation: attached === null || attached.length === 0 ? null : attached,
      facts: factsFor(event),
      detail,
    };
  });
}
