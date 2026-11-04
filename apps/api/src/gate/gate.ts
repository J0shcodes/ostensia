import { randomUUID } from "node:crypto";
import {
  CanonicalizationError,
  ConfirmedMandateSchema,
  IdentifierSchema,
  MandateTermsSchema,
  PurchaseProposalSchema,
  canonicalize,
  finalEvaluatePurchase,
  nextPaymentAction,
  precheckPurchase,
} from "@ostensia/domain";
import type { ConfirmedMandate, Decision, PurchaseProposal } from "@ostensia/domain";
import { hashMandate } from "../mandate-hash.ts";
import { toObservedPayment } from "../paypal/adapter.ts";
import type { AuthorizationSnapshot, CreateOrderResult, Failure, PayPalAdapter } from "../paypal/adapter.ts";
import type { AuditLog } from "./audit-log.ts";
import type { AuditEvent, WriteAction } from "./events.ts";
import { createKeyedMutex } from "./mutex.ts";
import { reconcileOutcome } from "./reconcile-rule.ts";
import type { ReconcileOutcome } from "./reconcile-rule.ts";
import { applyEvent, consumesMandate, emptyState, finalizeReplay } from "./state.ts";
import type { Attempt } from "./state.ts";

// The gate (D-007). For one purchase attempt it runs, in this order:
//
//   authorize: integrity check, pre-check, create the order        (no write yet)
//   settle:    read the authorization, integrity check, final evaluation,
//              then at most ONE capture or void, chosen by nextPaymentAction
//
// Rules this file keeps:
// - Every PayPal write is recorded in the audit log BEFORE it is sent. If the
//   log cannot be written, nothing is sent.
// - If the log fails at any point the gate stops (fail closed) until restart,
//   when the log is replayed and any request with no result is "unknown".
// - A capture or a void is sent at most once per attempt, and never retried.
// - A pre-check block, an integrity failure and a rejected total make no PayPal
//   call at all.
// - Reconcile only reads PayPal; it never sends a write.

export type GateRefusal =
  | {
      readonly kind: "refused";
      readonly reason:
        | "gate_faulted"
        | "invalid_attempt_id"
        | "invalid_proposal"
        | "invalid_mandate"
        | "mandate_not_found"
        | "attempt_id_reused"
        | "attempt_not_found";
    }
  | { readonly kind: "refused"; readonly reason: "mandate_in_use"; readonly byAttemptId: string };

export type AttemptResult = { readonly kind: "ok"; readonly attempt: Attempt } | GateRefusal;
export type SettleResult = AttemptResult | { readonly kind: "read_failed"; readonly attempt: Attempt; readonly detail: string };
export type ReconcileResult =
  | { readonly kind: "ok"; readonly attempt: Attempt; readonly outcome: ReconcileOutcome | "not_applicable" }
  | { readonly kind: "read_failed"; readonly attempt: Attempt; readonly detail: string }
  | GateRefusal;
export type MandateResult = { readonly kind: "ok"; readonly mandate: ConfirmedMandate } | GateRefusal;

export type AuthorizeInput = {
  readonly attemptId: string;
  readonly mandateId: string;
  readonly proposal: unknown;
};

export type Gate = {
  // Problems found while replaying the log (for example a torn last line).
  readonly warnings: readonly string[];
  createMandate(input: { terms: unknown; intentSummary: unknown }): Promise<MandateResult>;
  revokeMandate(mandateId: string): Promise<MandateResult>;
  getMandate(mandateId: string): ConfirmedMandate | null;
  listMandates(): ConfirmedMandate[];
  getAttempt(attemptId: string): Attempt | null;
  listAttempts(): Attempt[];
  authorize(input: AuthorizeInput): Promise<AttemptResult>;
  settle(attemptId: string): Promise<SettleResult>;
  // authorize, then settle if the attempt reached "authorized".
  run(input: AuthorizeInput): Promise<SettleResult>;
  reconcile(attemptId: string): Promise<ReconcileResult>;
};

export type GateOptions = {
  readonly adapter: PayPalAdapter;
  readonly audit: AuditLog;
  readonly now?: () => Date;
  readonly newId?: () => string;
};

// PayPal limits invoice_id to 127 characters and the adapter prefixes it.
const MAX_ATTEMPT_ID_LENGTH = 100;
const MAX_DETAIL = 300;

const refusal = (reason: Exclude<GateRefusal["reason"], "mandate_in_use">): GateRefusal => ({ kind: "refused", reason });
const clone = <T>(value: T): T => structuredClone(value);

function clip(text: string): string {
  return text.slice(0, MAX_DETAIL);
}

function describeFailure(failure: Failure): string {
  switch (failure.kind) {
    case "not_sent":
      return `token_${failure.tokenFailure}`;
    case "rejected":
      return clip(
        `status=${failure.error.status} error=${failure.error.errorName ?? "none"} issues=${failure.error.issues.join(",")}`,
      );
    case "unknown":
      return clip(`reason=${failure.reason} status=${failure.status ?? "none"}`);
  }
}

function hashOrNull(mandate: ConfirmedMandate): string | null {
  try {
    return hashMandate(mandate);
  } catch (error) {
    // A stored mandate that cannot even be written canonically has been damaged.
    if (error instanceof CanonicalizationError) return null;
    throw error;
  }
}

// D-015: the stored hash must still match the stored terms.
function integrityOk(mandate: ConfirmedMandate): boolean {
  const recomputed = hashOrNull(mandate);
  return recomputed !== null && recomputed === mandate.hash;
}

function sameRequest(existing: Attempt, mandateId: string, proposal: PurchaseProposal): boolean {
  try {
    return existing.mandateId === mandateId && canonicalize(existing.proposal) === canonicalize(proposal);
  } catch {
    return false;
  }
}

const HASH_MISMATCH: Decision = { decision: "block", violations: [{ code: "MANDATE_HASH_MISMATCH" }] };

type WriteSummary = {
  readonly outcome: "captured" | "capture_pending" | "voided" | "refused" | "rejected" | "unknown" | "not_sent";
  readonly captureId: string | null;
  readonly detail: string;
};

export async function createGate(options: GateOptions): Promise<Gate> {
  const { adapter, audit } = options;
  const now = options.now ?? (() => new Date());
  const newId = options.newId ?? randomUUID;

  const { events, warnings } = await audit.readAll();
  const state = emptyState();
  for (const event of events) applyEvent(state, event);
  finalizeReplay(state);

  const mutex = createKeyedMutex();
  let faulted = false;

  const at = () => now().toISOString();

  // Writes the event first, and only then changes state. A log that cannot be
  // written stops the gate: continuing would mean acting without a record.
  async function record(event: AuditEvent): Promise<void> {
    try {
      await audit.append(event);
      applyEvent(state, event);
    } catch (error) {
      faulted = true;
      throw error;
    }
  }

  // Any exception from a PayPal call is a bug, not a PayPal answer. The request
  // may or may not have been sent, so the gate stops.
  async function call<T>(task: () => Promise<T>): Promise<T> {
    try {
      return await task();
    } catch (error) {
      faulted = true;
      throw error;
    }
  }

  function current(attemptId: string): Attempt {
    const attempt = state.attempts.get(attemptId);
    if (attempt === undefined) throw new Error("attempt vanished from state");
    return clone(attempt);
  }

  function orderResultEvent(attemptId: string, result: CreateOrderResult): AuditEvent {
    const common = { v: 1 as const, at: at(), type: "order_result" as const, attemptId };
    switch (result.kind) {
      case "created":
        return {
          ...common,
          outcome: "created",
          orderId: result.order.orderId,
          authorizationId: result.authorizationId,
          detail: "created",
        };
      case "anomaly":
        return { ...common, outcome: "anomaly", orderId: result.order.orderId, authorizationId: null, detail: result.reason };
      case "rejected":
        return { ...common, outcome: "rejected", orderId: null, authorizationId: null, detail: describeFailure(result) };
      case "not_sent":
        return { ...common, outcome: "not_sent", orderId: null, authorizationId: null, detail: describeFailure(result) };
      case "unknown":
        return { ...common, outcome: "unknown", orderId: result.orderId, authorizationId: null, detail: describeFailure(result) };
    }
  }

  function facts(authorization: AuthorizationSnapshot) {
    return {
      state: authorization.state,
      statusRaw: authorization.statusRaw.slice(0, 64),
      amountMinor: authorization.amountMinor,
      currency: authorization.currency.slice(0, 16),
      customId: authorization.customId,
      expirationTime: authorization.expirationTime,
    };
  }

  async function performWrite(action: WriteAction, attemptId: string, authorizationId: string): Promise<WriteSummary> {
    if (action === "capture") {
      const result = await call(() => adapter.captureAuthorization({ attemptId, authorizationId }));
      switch (result.kind) {
        case "accepted":
          return {
            outcome: result.capture.state === "completed" ? "captured" : "capture_pending",
            captureId: result.capture.captureId,
            detail: clip(`capture ${result.capture.statusRaw}`),
          };
        case "already_terminal":
          return { outcome: "refused", captureId: null, detail: `${result.issue} status=${result.status}` };
        default:
          return { outcome: result.kind, captureId: null, detail: describeFailure(result) };
      }
    }
    const result = await call(() => adapter.voidAuthorization({ attemptId, authorizationId }));
    switch (result.kind) {
      case "voided":
        return { outcome: "voided", captureId: null, detail: "voided" };
      case "already_terminal":
        return { outcome: "refused", captureId: null, detail: `${result.issue} status=${result.status}` };
      default:
        return { outcome: result.kind, captureId: null, detail: describeFailure(result) };
    }
  }

  // ----- mandates -----

  async function createMandate(input: { terms: unknown; intentSummary: unknown }): Promise<MandateResult> {
    if (faulted) return refusal("gate_faulted");
    const terms = MandateTermsSchema.safeParse(input.terms);
    if (!terms.success) return refusal("invalid_mandate");

    const id = newId();
    const candidate = ConfirmedMandateSchema.safeParse({
      id,
      version: 1,
      terms: terms.data,
      intentSummary: input.intentSummary,
      confirmedAt: at(),
      status: "confirmed",
      hash: hashOrNull({ id, version: 1, terms: terms.data } as ConfirmedMandate) ?? "",
    });
    if (!candidate.success) return refusal("invalid_mandate");

    await record({ v: 1, at: at(), type: "mandate_created", mandate: candidate.data });
    return { kind: "ok", mandate: clone(candidate.data) };
  }

  async function revokeMandate(mandateId: string): Promise<MandateResult> {
    if (faulted) return refusal("gate_faulted");
    const mandate = state.mandates.get(mandateId);
    if (mandate === undefined) return refusal("mandate_not_found");
    if (mandate.status === "revoked") return { kind: "ok", mandate: clone(mandate) };
    await record({ v: 1, at: at(), type: "mandate_revoked", mandateId });
    return { kind: "ok", mandate: clone(state.mandates.get(mandateId) as ConfirmedMandate) };
  }

  // ----- authorize -----

  async function authorizeLocked(input: AuthorizeInput): Promise<AttemptResult> {
    const proposalParsed = PurchaseProposalSchema.safeParse(input.proposal);
    if (!proposalParsed.success) return refusal("invalid_proposal");
    const proposal = proposalParsed.data;
    const { attemptId } = input;

    const existing = state.attempts.get(attemptId);
    if (existing !== undefined) {
      // The same request again returns what already happened; a different one
      // under the same id is refused. Neither makes a PayPal call.
      return sameRequest(existing, input.mandateId, proposal)
        ? { kind: "ok", attempt: clone(existing) }
        : refusal("attempt_id_reused");
    }

    const mandate = state.mandates.get(input.mandateId);
    if (mandate === undefined) return refusal("mandate_not_found");

    // The check and the first event happen together, so two attempts for one
    // mandate cannot both get in.
    const reservation = await mutex.run(`mandate:${mandate.id}`, async () => {
      const busy = [...state.attempts.values()].find(
        (other) => other.mandateId === mandate.id && consumesMandate(other.status),
      );
      if (busy !== undefined) return { busyWith: busy.attemptId };
      await record({ v: 1, at: at(), type: "attempt_started", attemptId, mandateId: mandate.id, proposal });
      return { busyWith: null };
    });
    if (reservation.busyWith !== null) {
      return { kind: "refused", reason: "mandate_in_use", byAttemptId: reservation.busyWith };
    }

    if (!integrityOk(mandate)) {
      await record({ v: 1, at: at(), type: "integrity_failed", attemptId, stage: "authorize", decision: HASH_MISMATCH });
      return { kind: "ok", attempt: current(attemptId) };
    }

    const precheck = precheckPurchase(mandate, proposal, now());
    await record({ v: 1, at: at(), type: "precheck_decided", attemptId, decision: precheck });
    if (precheck.decision === "block") return { kind: "ok", attempt: current(attemptId) };

    // PayPal cannot authorize nothing. This is a payment limit, not a policy rule.
    if (precheck.computedTotalMinor < 1) {
      await record({
        v: 1,
        at: at(),
        type: "order_result",
        attemptId,
        outcome: "not_sent",
        orderId: null,
        authorizationId: null,
        detail: "total_not_payable",
      });
      return { kind: "ok", attempt: current(attemptId) };
    }

    await record({ v: 1, at: at(), type: "order_requested", attemptId });
    const created = await call(() =>
      adapter.createVaultOrder({ attemptId, amountMinor: precheck.computedTotalMinor, mandateHash: mandate.hash }),
    );
    await record(orderResultEvent(attemptId, created));
    return { kind: "ok", attempt: current(attemptId) };
  }

  async function authorize(input: AuthorizeInput): Promise<AttemptResult> {
    if (faulted) return refusal("gate_faulted");
    const { attemptId } = input;
    if (!IdentifierSchema.safeParse(attemptId).success || attemptId.length > MAX_ATTEMPT_ID_LENGTH) {
      return refusal("invalid_attempt_id");
    }
    return mutex.run(`attempt:${attemptId}`, () => authorizeLocked(input));
  }

  // ----- settle -----

  async function settleLocked(attemptId: string): Promise<SettleResult> {
    const attempt = state.attempts.get(attemptId);
    if (attempt === undefined) return refusal("attempt_not_found");
    // Anything but "authorized" is either finished or waiting for a person.
    // Settling it again would risk a second write, so it only reports.
    if (attempt.status !== "authorized" || attempt.authorizationId === null) {
      return { kind: "ok", attempt: clone(attempt) };
    }
    const { authorizationId } = attempt;

    const read = await call(() => adapter.getAuthorization(authorizationId));
    if (read.kind !== "ok") {
      const detail = read.kind === "not_found" ? "authorization_not_found" : describeFailure(read);
      // Nothing was written, so the attempt stays authorized and may be settled again.
      await record({ v: 1, at: at(), type: "settle_read_failed", attemptId, detail });
      return { kind: "read_failed", attempt: current(attemptId), detail };
    }
    const authorization = read.authorization;
    await record({ v: 1, at: at(), type: "authorization_read", attemptId, authorization: facts(authorization) });

    // The mandate is looked up again: it may have been revoked since authorize.
    const mandate = state.mandates.get(attempt.mandateId);
    let decision: Decision;
    if (mandate === undefined || !integrityOk(mandate)) {
      decision = HASH_MISMATCH;
      await record({ v: 1, at: at(), type: "integrity_failed", attemptId, stage: "settle", decision });
    } else {
      decision = finalEvaluatePurchase(mandate, attempt.proposal, toObservedPayment(authorization), now());
      await record({ v: 1, at: at(), type: "final_decided", attemptId, decision });
    }

    const action = nextPaymentAction(decision, authorization.state);
    if (action === "none") {
      await record({ v: 1, at: at(), type: "no_action", attemptId, authorizationState: authorization.state });
      return { kind: "ok", attempt: current(attemptId) };
    }

    // Announce the write, then send it. If this append fails nothing is sent.
    await record({ v: 1, at: at(), type: "write_requested", attemptId, action });
    const summary = await performWrite(action, attemptId, authorizationId);
    await record({
      v: 1,
      at: at(),
      type: "write_result",
      attemptId,
      action,
      outcome: summary.outcome,
      captureId: summary.captureId,
      detail: summary.detail,
    });
    return { kind: "ok", attempt: current(attemptId) };
  }

  async function settle(attemptId: string): Promise<SettleResult> {
    if (faulted) return refusal("gate_faulted");
    return mutex.run(`attempt:${attemptId}`, () => settleLocked(attemptId));
  }

  async function run(input: AuthorizeInput): Promise<SettleResult> {
    const authorized = await authorize(input);
    if (authorized.kind !== "ok" || authorized.attempt.status !== "authorized") return authorized;
    return settle(input.attemptId);
  }

  // ----- reconcile -----

  async function reconcileLocked(attemptId: string): Promise<ReconcileResult> {
    const attempt = state.attempts.get(attemptId);
    if (attempt === undefined) return refusal("attempt_not_found");

    const eligible =
      attempt.status === "write_unknown" || attempt.status === "capture_pending" || attempt.status === "write_refused";
    if (!eligible || attempt.authorizationId === null) {
      return { kind: "ok", attempt: clone(attempt), outcome: "not_applicable" };
    }
    const { authorizationId, orderId } = attempt;

    const read = await call(() => adapter.getAuthorization(authorizationId));
    if (read.kind !== "ok") {
      const detail = read.kind === "not_found" ? "authorization_not_found" : describeFailure(read);
      return { kind: "read_failed", attempt: clone(attempt), detail };
    }

    // For a capture, the state of each capture matters too. Without it nothing
    // can be concluded, so a failed read leaves the attempt as it was.
    let captureStates: string[] = [];
    if (attempt.intendedAction === "capture" && orderId !== null) {
      const order = await call(() => adapter.getOrder(orderId));
      if (order.kind !== "ok") {
        const detail = order.kind === "not_found" ? "order_not_found" : describeFailure(order);
        return { kind: "read_failed", attempt: clone(attempt), detail };
      }
      captureStates = order.order.captures.map((capture) => capture.state);
    }

    const outcome = reconcileOutcome(attempt.intendedAction, read.authorization.state, captureStates);
    await record({
      v: 1,
      at: at(),
      type: "reconciled",
      attemptId,
      authorizationState: read.authorization.state,
      captureStates,
      result: outcome,
    });
    return { kind: "ok", attempt: current(attemptId), outcome };
  }

  async function reconcile(attemptId: string): Promise<ReconcileResult> {
    if (faulted) return refusal("gate_faulted");
    return mutex.run(`attempt:${attemptId}`, () => reconcileLocked(attemptId));
  }

  return {
    warnings,
    createMandate,
    revokeMandate,
    getMandate: (mandateId) => {
      const mandate = state.mandates.get(mandateId);
      return mandate === undefined ? null : clone(mandate);
    },
    listMandates: () => [...state.mandates.values()].map(clone),
    getAttempt: (attemptId) => {
      const attempt = state.attempts.get(attemptId);
      return attempt === undefined ? null : clone(attempt);
    },
    listAttempts: () => [...state.attempts.values()].map(clone),
    authorize,
    settle,
    run,
    reconcile,
  };
}
