import type { FastifyInstance } from "fastify";
import { completeDraft } from "@ostensia/domain";
import { z } from "zod";
import { draftWarnings } from "../ai/draft-checks.ts";
import type { MandateDrafter } from "../ai/drafter.ts";
import { sendError } from "./respond.ts";

// Drafting only proposes (D-024). Nothing here creates a mandate or touches the
// gate: a person reviews and edits the draft, and confirms it through
// POST /mandates. Everything returned is labelled as AI-generated.
const MAX_INSTRUCTION_LENGTH = 2000;
const DRAFT_LABEL = "AI-generated draft. Review and edit it before confirming; it does not authorise any purchase.";

const DraftBody = z.strictObject({ instruction: z.string() });

export function registerDraftRoutes(app: FastifyInstance, drafter: MandateDrafter | null, now: () => Date): void {
  app.post("/mandates/draft", async (request, reply) => {
    const body = DraftBody.safeParse(request.body);
    const instruction = body.success ? body.data.instruction.trim() : "";
    if (!body.success || instruction === "" || instruction.length > MAX_INSTRUCTION_LENGTH) {
      return sendError(reply, 400, "invalid_request");
    }
    if (drafter === null) {
      return reply.code(503).send({ error: "drafting_unavailable", reason: "not_configured" });
    }

    const moment = now();
    const result = await drafter.draft(instruction, moment);
    switch (result.kind) {
      case "unavailable":
        return reply.code(503).send({ error: "drafting_unavailable", reason: result.reason });
      case "refused":
        return reply.code(422).send({ error: "draft_refused", aiGenerated: true });
      case "invalid_output":
        return reply.code(502).send({ error: "draft_invalid", detail: result.detail });
      case "drafted": {
        const completion = completeDraft(result.draft);
        if (completion.kind === "invalid") return reply.code(502).send({ error: "draft_invalid", detail: "schema_mismatch" });
        return {
          aiGenerated: true,
          label: DRAFT_LABEL,
          draft: result.draft,
          completeness:
            completion.kind === "complete"
              ? { status: "complete", terms: completion.terms, missing: [], problems: [] }
              : { status: "incomplete", missing: completion.missing, problems: completion.problems },
          warnings: draftWarnings(result.draft, moment),
        };
      }
    }
  });
}
