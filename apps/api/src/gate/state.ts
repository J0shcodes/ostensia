import type { ConfirmedMandate, Decision, PurchaseProposal } from "@ostensia/domain";
import { AuditCorruptError } from "./events.ts";
import type { AuditEvent, AuthorizationFacts, WriteAction } from "./events.ts";

// Gate state, and the one function that changes it: applyEvent. State is only
// ever the result of applying audit events in order, so a restart that replays
// the log reaches the same state as the process that wrote it.

export type AttemptStatus =
  // Before any PayPal call.
  | "started"
  | "prechecked"
  | "blocked_precheck"
  | "integrity_failed"
  | "abandoned"
  // Creating the order.
  | "creating"
  | "create_rejected"
  | "create_unknown"
  | "anomaly"
  // An authorization exists and nothing has settled it yet.
  | "authorized"
  // Settling it.
  | "writing"
  | "captured"
  | "capture_pending"
  | "voided"
  | "write_refused"
  | "write_rejected"
  | "write_unknown"
  | "no_action"
  | "conflict";

export type Attempt = {
  readonly attemptId: string;
  readonly mandateId: string;
  readonly proposal: PurchaseProposal;
  readonly status: AttemptStatus;
  readonly precheck: Decision | null;
  readonly finalDecision: Decision | null;
  readonly orderId: string | null;
  readonly authorizationId: string | null;
  readonly authorization: AuthorizationFacts | null;
  readonly intendedAction: WriteAction | null;
  readonly captureId: string | null;
  readonly startedAt: string;
  readonly updatedAt: string;
};

export type GateState = {
  readonly mandates: Map<string, ConfirmedMandate>;
  readonly attempts: Map<string, Attempt>;
};

export function emptyState(): GateState {
  return { mandates: new Map(), attempts: new Map() };
}

// Attempts that never reached PayPal, or that PayPal answered with a refusal,
// or that ended by releasing the hold, leave the mandate free to use again.
// Everything else - in flight, authorized, captured, unknown - uses it up.
const FREE_STATUSES: ReadonlySet<AttemptStatus> = new Set([
  "blocked_precheck",
  "integrity_failed",
  "create_rejected",
  "voided",
  "abandoned",
]);

export function consumesMandate(status: AttemptStatus): boolean {
  return !FREE_STATUSES.has(status);
}

function attemptFor(state: GateState, event: { attemptId: string; type: string }): Attempt {
  const attempt = state.attempts.get(event.attemptId);
  if (attempt === undefined) {
    throw new AuditCorruptError(`Audit event ${event.type} refers to an attempt that was never started.`);
  }
  return attempt;
}

function update(state: GateState, attempt: Attempt, at: string, changes: Partial<Attempt>): void {
  state.attempts.set(attempt.attemptId, { ...attempt, ...changes, updatedAt: at });
}

export function applyEvent(state: GateState, event: AuditEvent): void {
  switch (event.type) {
    case "mandate_created":
      state.mandates.set(event.mandate.id, event.mandate);
      return;

    case "mandate_revoked": {
      const mandate = state.mandates.get(event.mandateId);
      if (mandate === undefined) throw new AuditCorruptError("A mandate was revoked that was never created.");
      // Only the status changes. The terms, and so the hash, stay the same.
      state.mandates.set(mandate.id, { ...mandate, status: "revoked" });
      return;
    }

    case "attempt_started":
      if (!state.mandates.has(event.mandateId)) {
        throw new AuditCorruptError("An attempt was started for a mandate that was never created.");
      }
      state.attempts.set(event.attemptId, {
        attemptId: event.attemptId,
        mandateId: event.mandateId,
        proposal: event.proposal,
        status: "started",
        precheck: null,
        finalDecision: null,
        orderId: null,
        authorizationId: null,
        authorization: null,
        intendedAction: null,
        captureId: null,
        startedAt: event.at,
        updatedAt: event.at,
      });
      return;

    case "precheck_decided": {
      const attempt = attemptFor(state, event);
      update(state, attempt, event.at, {
        precheck: event.decision,
        status: event.decision.decision === "allow" ? "prechecked" : "blocked_precheck",
      });
      return;
    }

    case "integrity_failed": {
      const attempt = attemptFor(state, event);
      // At authorize time nothing exists at PayPal, so the attempt ends. At
      // settle time an authorization exists, and the attempt carries on to be
      // voided, so only the decision is recorded.
      update(
        state,
        attempt,
        event.at,
        event.stage === "authorize"
          ? { precheck: event.decision, status: "integrity_failed" }
          : { finalDecision: event.decision },
      );
      return;
    }

    case "order_requested": {
      const attempt = attemptFor(state, event);
      update(state, attempt, event.at, { status: "creating" });
      return;
    }

    case "order_result": {
      const attempt = attemptFor(state, event);
      const status: AttemptStatus =
        event.outcome === "created"
          ? "authorized"
          : event.outcome === "anomaly"
            ? "anomaly"
            : event.outcome === "unknown"
              ? "create_unknown"
              : "create_rejected";
      update(state, attempt, event.at, { status, orderId: event.orderId, authorizationId: event.authorizationId });
      return;
    }

    case "authorization_read": {
      const attempt = attemptFor(state, event);
      update(state, attempt, event.at, { authorization: event.authorization });
      return;
    }

    case "settle_read_failed": {
      const attempt = attemptFor(state, event);
      update(state, attempt, event.at, {});
      return;
    }

    case "final_decided": {
      const attempt = attemptFor(state, event);
      update(state, attempt, event.at, { finalDecision: event.decision });
      return;
    }

    case "write_requested": {
      const attempt = attemptFor(state, event);
      update(state, attempt, event.at, { status: "writing", intendedAction: event.action });
      return;
    }

    case "write_result": {
      const attempt = attemptFor(state, event);
      const status: AttemptStatus = {
        captured: "captured",
        capture_pending: "capture_pending",
        voided: "voided",
        refused: "write_refused",
        rejected: "write_rejected",
        unknown: "write_unknown",
        // Nothing was sent, so the attempt is where it was before the write.
        not_sent: "authorized",
      }[event.outcome] as AttemptStatus;
      update(state, attempt, event.at, {
        status,
        captureId: event.captureId ?? attempt.captureId,
        ...(event.outcome === "not_sent" ? { intendedAction: null } : {}),
      });
      return;
    }

    case "no_action": {
      const attempt = attemptFor(state, event);
      update(state, attempt, event.at, { status: "no_action" });
      return;
    }

    case "reconciled": {
      const attempt = attemptFor(state, event);
      const status: AttemptStatus | null =
        event.result === "captured"
          ? "captured"
          : event.result === "voided"
            ? "voided"
            : event.result === "conflict"
              ? "conflict"
              : null;
      update(state, attempt, event.at, status === null ? {} : { status });
      return;
    }
  }
}

// After a replay, a request that has no result is an outcome nobody saw. It is
// reported as unknown, never as failed (D-010).
export function finalizeReplay(state: GateState): void {
  for (const attempt of state.attempts.values()) {
    const settled: AttemptStatus | null =
      attempt.status === "started" || attempt.status === "prechecked"
        ? "abandoned"
        : attempt.status === "creating"
          ? "create_unknown"
          : attempt.status === "writing"
            ? "write_unknown"
            : null;
    if (settled !== null) state.attempts.set(attempt.attemptId, { ...attempt, status: settled });
  }
}
