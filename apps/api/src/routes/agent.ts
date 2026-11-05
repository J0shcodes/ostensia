import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildProposal } from "../ai/cart.ts";
import type { ShoppingAgent } from "../ai/shopper.ts";
import { SHOP_MODES } from "../ai/shopper-prompt.ts";
import type { Gate } from "../gate/gate.ts";
import { sendError } from "./respond.ts";

// The AI shopping agent only proposes (D-025). Nothing here creates an attempt,
// touches the gate's state or calls PayPal: the cart comes back as an ordinary
// purchase proposal, and the client sends it to POST /attempts like any other
// proposal, where the deterministic gate decides. Everything returned is labelled
// as AI-generated and as coming from a simulated shop.
const MAX_TASK_LENGTH = 2000;
const AGENT_LABEL =
  "AI shopping agent in a simulated shop (synthetic catalogue, not a real merchant). The cart is only a proposal: the gate checks it before anything is authorised.";
const MODE_NOTES: Record<(typeof SHOP_MODES)[number], string> = {
  informed: "The agent was shown the mandate's limits.",
  uninformed: "The agent was not shown the mandate's limits.",
};

const AgentBody = z.strictObject({ task: z.string().optional(), mode: z.enum(SHOP_MODES) });

export function registerAgentRoutes(app: FastifyInstance, gate: Gate, shopper: ShoppingAgent | null): void {
  app.post<{ Params: { id: string } }>("/mandates/:id/agent-proposal", async (request, reply) => {
    const body = AgentBody.safeParse(request.body);
    if (!body.success) return sendError(reply, 400, "invalid_request");
    const given = body.data.task === undefined ? null : body.data.task.trim();
    if (given !== null && (given === "" || given.length > MAX_TASK_LENGTH)) return sendError(reply, 400, "invalid_request");
    if (shopper === null) return reply.code(503).send({ error: "agent_unavailable", reason: "not_configured" });

    const mandate = gate.getMandate(request.params.id);
    if (mandate === null) return sendError(reply, 404, "mandate_not_found");
    // With no task, the agent shops for what the mandate was confirmed for.
    const task = given ?? mandate.intentSummary;
    const mode = body.data.mode;

    const result = await shopper.shop({ task, mode, terms: mandate.terms });
    switch (result.kind) {
      case "unavailable":
        return reply.code(503).send({ error: "agent_unavailable", reason: result.reason });
      case "refused":
        return reply.code(422).send({ error: "agent_refused", aiGenerated: true });
      case "invalid_output":
        return reply.code(502).send({ error: "agent_invalid", detail: result.detail });
      case "declined":
        return {
          aiGenerated: true,
          simulatedShop: true,
          label: AGENT_LABEL,
          mode,
          modeNote: MODE_NOTES[mode],
          proposal: null,
          declined: { reason: result.reason },
          rationale: result.rationale,
        };
      case "proposed": {
        const cart = buildProposal(mandate, result.lines);
        if (cart.kind === "invalid") return reply.code(502).send({ error: "agent_invalid", detail: cart.reason });
        return {
          aiGenerated: true,
          simulatedShop: true,
          label: AGENT_LABEL,
          mode,
          modeNote: MODE_NOTES[mode],
          proposal: cart.proposal,
          declined: null,
          rationale: result.rationale,
        };
      }
    }
  });
}
