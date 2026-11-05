import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Gate } from "../gate/gate.ts";
import { CATALOGUE, SIMULATION_LABEL } from "../simulation/catalogue.ts";
import { SCENARIOS, buildScenario } from "../simulation/scenarios.ts";
import { sendError } from "./respond.ts";

// Everything here is simulated and says so (D-012). The proposal route only
// builds a proposal; it does not run it. The caller decides whether to send it
// to /attempts, exactly as it would with a proposal from any other source.
const ScenarioBody = z.strictObject({ scenario: z.enum(SCENARIOS) });

export function registerSimulationRoutes(app: FastifyInstance, gate: Gate): void {
  app.get("/catalogue", async () => ({ simulated: true, label: SIMULATION_LABEL, products: CATALOGUE }));

  app.post<{ Params: { id: string } }>("/mandates/:id/simulated-proposal", async (request, reply) => {
    const body = ScenarioBody.safeParse(request.body);
    if (!body.success) return sendError(reply, 400, "invalid_request");
    const mandate = gate.getMandate(request.params.id);
    if (mandate === null) return sendError(reply, 404, "mandate_not_found");

    const built = buildScenario(mandate, body.data.scenario);
    if (built.kind === "cannot_build") {
      return reply
        .code(422)
        .send({ error: "scenario_not_buildable", simulated: true, scenario: body.data.scenario, reason: built.reason });
    }
    return { simulated: true, label: SIMULATION_LABEL, scenario: body.data.scenario, proposal: built.proposal };
  });
}
