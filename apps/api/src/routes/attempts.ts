import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Gate } from "../gate/gate.ts";
import { attemptBody, sendError, sendRefusal, sendSettleResult } from "./respond.ts";

// The caller chooses the attempt id, so sending the same request again returns
// the same attempt instead of starting a second one. The gate checks the id,
// the mandate and the proposal; this schema checks only the envelope.
const CreateAttemptBody = z.strictObject({
  attemptId: z.string(),
  mandateId: z.string(),
  proposal: z.unknown(),
  // true runs authorize and settle together; false (the default) stops after the
  // authorization, so the mandate can still change before settlement.
  settleNow: z.boolean().optional(),
});

export function registerAttemptRoutes(app: FastifyInstance, gate: Gate): void {
  app.post("/attempts", async (request, reply) => {
    const body = CreateAttemptBody.safeParse(request.body);
    if (!body.success) return sendError(reply, 400, "invalid_request");
    const input = { attemptId: body.data.attemptId, mandateId: body.data.mandateId, proposal: body.data.proposal };
    const result = body.data.settleNow === true ? await gate.run(input) : await gate.authorize(input);
    return sendSettleResult(reply, result);
  });

  app.post<{ Params: { id: string } }>("/attempts/:id/settle", async (request, reply) =>
    sendSettleResult(reply, await gate.settle(request.params.id)),
  );

  app.post<{ Params: { id: string } }>("/attempts/:id/reconcile", async (request, reply) => {
    const result = await gate.reconcile(request.params.id);
    switch (result.kind) {
      case "ok":
        return reply.code(200).send({ outcome: result.outcome, ...attemptBody(result.attempt) });
      case "read_failed":
        return reply.code(502).send({ error: "read_failed", detail: result.detail, ...attemptBody(result.attempt) });
      case "refused":
        return sendRefusal(reply, result);
    }
  });

  app.get("/attempts", async () => ({ attempts: gate.listAttempts() }));

  app.get<{ Params: { id: string } }>("/attempts/:id", async (request, reply) => {
    const attempt = gate.getAttempt(request.params.id);
    if (attempt === null) return sendError(reply, 404, "attempt_not_found");
    return { ...attemptBody(attempt), events: gate.eventsFor(attempt.attemptId) };
  });
}
