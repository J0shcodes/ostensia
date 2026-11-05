import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Gate } from "../gate/gate.ts";
import { sendError, sendRefusal } from "./respond.ts";

// Posting the terms is the confirmation step for now: the user has reviewed
// them. AI drafting of the terms arrives in a later increment. The gate
// validates the terms and builds the confirmed mandate and its hash.
const CreateMandateBody = z.strictObject({ terms: z.unknown(), intentSummary: z.unknown() });

export function registerMandateRoutes(app: FastifyInstance, gate: Gate): void {
  app.post("/mandates", async (request, reply) => {
    const body = CreateMandateBody.safeParse(request.body);
    if (!body.success) return sendError(reply, 400, "invalid_request");
    const result = await gate.createMandate({ terms: body.data.terms, intentSummary: body.data.intentSummary });
    if (result.kind === "refused") return sendRefusal(reply, result);
    return reply.code(201).send({ mandate: result.mandate });
  });

  app.get("/mandates", async () => ({ mandates: gate.listMandates() }));

  app.get<{ Params: { id: string } }>("/mandates/:id", async (request, reply) => {
    const mandate = gate.getMandate(request.params.id);
    if (mandate === null) return sendError(reply, 404, "mandate_not_found");
    return { mandate };
  });

  app.post<{ Params: { id: string } }>("/mandates/:id/revoke", async (request, reply) => {
    const result = await gate.revokeMandate(request.params.id);
    if (result.kind === "refused") return sendRefusal(reply, result);
    return { mandate: result.mandate };
  });
}
