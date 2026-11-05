import type { FastifyReply } from "fastify";
import { explainDecision } from "@ostensia/domain";
import type { Attempt } from "../gate/state.ts";
import type { GateRefusal, SettleResult } from "../gate/gate.ts";

// How gate results become HTTP responses. A block decision is a successful
// evaluation, so it is a 200 with the attempt, never an error status. Only a
// request the gate refuses, or a gate that cannot work, is an error.
const REFUSAL_STATUS: Record<GateRefusal["reason"], number> = {
  gate_faulted: 503,
  invalid_attempt_id: 400,
  invalid_proposal: 400,
  invalid_mandate: 400,
  mandate_not_found: 404,
  attempt_not_found: 404,
  attempt_id_reused: 409,
  mandate_in_use: 409,
};

export function sendRefusal(reply: FastifyReply, refusal: GateRefusal): FastifyReply {
  const body =
    refusal.reason === "mandate_in_use"
      ? { error: refusal.reason, byAttemptId: refusal.byAttemptId }
      : { error: refusal.reason };
  return reply.code(REFUSAL_STATUS[refusal.reason]).send(body);
}

export function sendError(reply: FastifyReply, status: number, error: string): FastifyReply {
  return reply.code(status).send({ error });
}

// The attempt as the API shows it: the record, and the decisions in plain
// words (from the domain's explanations, not from an AI).
export function attemptBody(attempt: Attempt) {
  return {
    attempt,
    explanation: {
      precheck: attempt.precheck === null ? null : explainDecision(attempt.precheck),
      final: attempt.finalDecision === null ? null : explainDecision(attempt.finalDecision),
    },
  };
}

export function sendSettleResult(reply: FastifyReply, result: SettleResult): FastifyReply {
  switch (result.kind) {
    case "ok":
      return reply.code(200).send(attemptBody(result.attempt));
    case "read_failed":
      // PayPal could not be read. Nothing was written, and the attempt can be
      // settled again.
      return reply.code(502).send({ error: "read_failed", detail: result.detail, ...attemptBody(result.attempt) });
    case "refused":
      return sendRefusal(reply, result);
  }
}
