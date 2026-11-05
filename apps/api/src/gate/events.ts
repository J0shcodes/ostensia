import {
  AUTHORIZATION_STATES,
  ConfirmedMandateSchema,
  DecisionSchema,
  IdentifierSchema,
  PurchaseProposalSchema,
} from "@ostensia/domain";
import type { Decision } from "@ostensia/domain";
import { z } from "zod";

// DecisionSchema parses into mutable arrays; the domain's Decision type is
// readonly. Annotating the field makes events carry the domain's own type, with
// no cast (a mutable array is assignable to a readonly one).
const DecisionField: z.ZodType<Decision> = DecisionSchema;

// The audit log is a list of these events, one JSON object per line (D-008).
// All gate state is rebuilt from them at startup, so each event carries what
// the rebuild needs and nothing secret: PayPal ids and statuses, the mandate,
// the proposal and the decisions. No tokens, credentials or raw responses.
//
// A PayPal write is logged BEFORE it is sent (order_requested, write_requested)
// and its result is logged after. A request with no result after a restart
// means the outcome is unknown, never that it failed.

export class AuditCorruptError extends Error {
  override name = "AuditCorruptError";
}

const base = { v: z.literal(1), at: z.iso.datetime() };
const AttemptId = IdentifierSchema;
// A short, gate-written description of a PayPal outcome (status codes, error
// names, issue strings). Never a raw response body.
const Detail = z.string().max(300);

const AuthorizationFactsSchema = z.strictObject({
  state: z.enum(AUTHORIZATION_STATES),
  statusRaw: z.string().max(64),
  amountMinor: z.int().min(0).nullable(),
  currency: z.string().max(16),
  customId: z.string().max(256).nullable(),
  expirationTime: z.string().max(40).nullable(),
});
export type AuthorizationFacts = z.infer<typeof AuthorizationFactsSchema>;

const WriteAction = z.enum(["capture", "void"]);
export type WriteAction = z.infer<typeof WriteAction>;

export const AuditEventSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...base, type: z.literal("mandate_created"), mandate: ConfirmedMandateSchema }),
  z.strictObject({ ...base, type: z.literal("mandate_revoked"), mandateId: IdentifierSchema }),
  z.strictObject({
    ...base,
    type: z.literal("attempt_started"),
    attemptId: AttemptId,
    mandateId: IdentifierSchema,
    proposal: PurchaseProposalSchema,
  }),
  z.strictObject({ ...base, type: z.literal("precheck_decided"), attemptId: AttemptId, decision: DecisionField }),
  z.strictObject({
    ...base,
    type: z.literal("integrity_failed"),
    attemptId: AttemptId,
    stage: z.enum(["authorize", "settle"]),
    decision: DecisionField,
  }),
  z.strictObject({ ...base, type: z.literal("order_requested"), attemptId: AttemptId }),
  z.strictObject({
    ...base,
    type: z.literal("order_result"),
    attemptId: AttemptId,
    outcome: z.enum(["created", "anomaly", "rejected", "unknown", "not_sent"]),
    orderId: z.string().max(128).nullable(),
    authorizationId: z.string().max(128).nullable(),
    detail: Detail,
  }),
  z.strictObject({
    ...base,
    type: z.literal("authorization_read"),
    attemptId: AttemptId,
    authorization: AuthorizationFactsSchema,
  }),
  z.strictObject({ ...base, type: z.literal("settle_read_failed"), attemptId: AttemptId, detail: Detail }),
  z.strictObject({ ...base, type: z.literal("final_decided"), attemptId: AttemptId, decision: DecisionField }),
  z.strictObject({ ...base, type: z.literal("write_requested"), attemptId: AttemptId, action: WriteAction }),
  z.strictObject({
    ...base,
    type: z.literal("write_result"),
    attemptId: AttemptId,
    action: WriteAction,
    outcome: z.enum(["captured", "capture_pending", "voided", "refused", "rejected", "unknown", "not_sent"]),
    captureId: z.string().max(128).nullable(),
    detail: Detail,
  }),
  z.strictObject({
    ...base,
    type: z.literal("no_action"),
    attemptId: AttemptId,
    authorizationState: z.enum(AUTHORIZATION_STATES),
  }),
  z.strictObject({
    ...base,
    type: z.literal("reconciled"),
    attemptId: AttemptId,
    authorizationState: z.enum(AUTHORIZATION_STATES),
    captureStates: z.array(z.string().max(32)).max(20),
    result: z.enum(["captured", "voided", "conflict", "unchanged"]),
  }),
]);

export type AuditEvent = z.infer<typeof AuditEventSchema>;
