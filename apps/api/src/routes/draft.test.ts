import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { MandateDraft } from "@ostensia/domain";
import type { DraftResult, MandateDrafter } from "../ai/drafter.ts";
import { buildServer } from "../server.ts";
import { setupGate } from "../gate/test-support.ts";
import type { Context } from "../gate/test-support.ts";

// The draft route, with a scripted drafter. Nothing here reaches a provider.

const NOW = new Date("2026-11-05T12:00:00.000Z");

const COMPLETE: MandateDraft = {
  intentSummary: "Two matte sticker packs, up to $5 in total.",
  currency: "USD",
  maxTotalMinor: 500,
  expiresAt: "2026-11-12T23:59:59.000Z",
  items: [{ productId: "sticker-pack", allowedVariantIds: ["matte"], maxQuantity: 2, maxUnitPriceMinor: 150 }],
  notes: [],
};

const INCOMPLETE: MandateDraft = {
  intentSummary: "Something nice for a desk",
  currency: null,
  maxTotalMinor: null,
  expiresAt: null,
  items: [],
  notes: ["No product, price or date was given."],
};

function pick(value: unknown, ...path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

describe("POST /mandates/draft", () => {
  let app: FastifyInstance;
  let context: Context;
  const calls: { instruction: string; now: Date }[] = [];

  async function start(result: DraftResult | null) {
    calls.length = 0;
    context = await setupGate();
    const drafter: MandateDrafter | null =
      result === null
        ? null
        : {
            draft: async (instruction, now) => {
              calls.push({ instruction, now });
              return result;
            },
          };
    app = buildServer({ logger: false, gate: context.gate, drafter, now: () => NOW });
  }

  afterEach(async () => {
    await app.close();
  });

  async function draft(payload: unknown) {
    const response = await app.inject({ method: "POST", url: "/mandates/draft", payload: payload as object });
    return { status: response.statusCode, body: response.json() as unknown, text: response.body };
  }

  const drafted = (value: MandateDraft): DraftResult => ({ kind: "drafted", draft: value, usage: null });

  describe("a draft", () => {
    it("is labelled AI-generated and returns the draft unchanged", async () => {
      await start(drafted(COMPLETE));
      const reply = await draft({ instruction: "two matte sticker packs, $5 in total, by Nov 12" });
      expect(reply.status).toBe(200);
      expect(pick(reply.body, "aiGenerated")).toBe(true);
      expect(String(pick(reply.body, "label"))).toContain("AI-generated");
      expect(pick(reply.body, "draft")).toEqual(COMPLETE);
    });

    it("says a complete draft is complete and offers the terms to confirm", async () => {
      await start(drafted(COMPLETE));
      const reply = await draft({ instruction: "x" });
      expect(pick(reply.body, "completeness", "status")).toBe("complete");
      expect(pick(reply.body, "completeness", "missing")).toEqual([]);
      expect(pick(reply.body, "completeness", "terms")).toEqual({
        currency: "USD",
        maxTotalMinor: 500,
        expiresAt: "2026-11-12T23:59:59.000Z",
        items: [{ productId: "sticker-pack", allowedVariantIds: ["matte"], maxQuantity: 2, maxUnitPriceMinor: 150 }],
      });
    });

    it("lists what is missing from an incomplete draft and offers no terms and no defaults", async () => {
      await start(drafted(INCOMPLETE));
      const reply = await draft({ instruction: "something nice for my desk" });
      expect(pick(reply.body, "completeness", "status")).toBe("incomplete");
      expect(pick(reply.body, "completeness", "missing")).toEqual(["currency", "maxTotalMinor", "expiresAt", "items"]);
      expect("terms" in (pick(reply.body, "completeness") as object)).toBe(false);
      expect(pick(reply.body, "draft")).toEqual(INCOMPLETE);
    });

    it("shows deterministic warnings next to the draft", async () => {
      await start(drafted({ ...COMPLETE, items: [{ productId: "jacket", maxQuantity: 1, maxUnitPriceMinor: 5000 }] }));
      const reply = await draft({ instruction: "a jacket" });
      expect(pick(reply.body, "warnings")).toEqual(["items[0].productId is not in the shop catalogue."]);
    });

    it("uses the server's clock for the warnings and passes it to the drafter", async () => {
      await start(drafted({ ...COMPLETE, expiresAt: "2026-11-05T11:00:00.000Z" }));
      const reply = await draft({ instruction: "x" });
      expect(pick(reply.body, "warnings")).toEqual(["expiresAt is not in the future."]);
      expect(calls[0]?.now).toEqual(NOW);
    });

    it("passes the trimmed instruction to the drafter", async () => {
      await start(drafted(COMPLETE));
      await draft({ instruction: "  two sticker packs \n" });
      expect(calls.map((call) => call.instruction)).toEqual(["two sticker packs"]);
    });
  });

  describe("drafting only proposes", () => {
    it("creates no mandate, writes no audit event and makes no PayPal call", async () => {
      await start(drafted(COMPLETE));
      await draft({ instruction: "x" });
      expect(context.gate.listMandates()).toEqual([]);
      expect(context.audit.events).toEqual([]);
      expect(context.stub.calls).toEqual([]);
    });

    it("gives terms that a person can confirm through POST /mandates", async () => {
      await start(drafted(COMPLETE));
      const reply = await draft({ instruction: "x" });
      const confirmed = await app.inject({
        method: "POST",
        url: "/mandates",
        payload: { terms: pick(reply.body, "completeness", "terms"), intentSummary: String(pick(reply.body, "draft", "intentSummary")) },
      });
      expect(confirmed.statusCode).toBe(201);
      expect(confirmed.json().mandate.status).toBe("confirmed");
    });
  });

  describe("a bad request", () => {
    it.each([
      ["an empty instruction", { instruction: "" }],
      ["a blank instruction", { instruction: "   \n  " }],
      ["an instruction over 2,000 characters", { instruction: "x".repeat(2001) }],
      ["a missing instruction", {}],
      ["a non-string instruction", { instruction: 5 }],
      ["an unknown key", { instruction: "x", extra: 1 }],
    ])("rejects %s with 400 and does not call the drafter", async (_name, payload) => {
      await start(drafted(COMPLETE));
      const reply = await draft(payload);
      expect(reply.status).toBe(400);
      expect(reply.body).toEqual({ error: "invalid_request" });
      expect(calls).toEqual([]);
    });

    it("accepts an instruction of exactly 2,000 characters", async () => {
      await start(drafted(COMPLETE));
      expect((await draft({ instruction: "x".repeat(2000) })).status).toBe(200);
    });
  });

  describe("when drafting cannot produce a draft", () => {
    it("answers 503 not_configured when no drafter is set, and nothing else works differently", async () => {
      await start(null);
      const reply = await draft({ instruction: "x" });
      expect(reply.status).toBe(503);
      expect(reply.body).toEqual({ error: "drafting_unavailable", reason: "not_configured" });
      expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
      const created = await app.inject({
        method: "POST",
        url: "/mandates",
        payload: { terms: { currency: "USD", maxTotalMinor: 500, expiresAt: "2026-11-12T23:59:59.000Z", items: [{ productId: "sticker-pack", maxQuantity: 1, maxUnitPriceMinor: 150 }] }, intentSummary: "typed by hand" },
      });
      expect(created.statusCode).toBe(201);
    });

    it.each(["auth", "rate_limited", "timeout", "connection", "bad_request", "server"] as const)(
      "answers 503 with the reason when the provider is unavailable (%s)",
      async (reason) => {
        await start({ kind: "unavailable", reason });
        const reply = await draft({ instruction: "x" });
        expect(reply.status).toBe(503);
        expect(reply.body).toEqual({ error: "drafting_unavailable", reason });
      },
    );

    it("answers 422 when the model declined, with no draft", async () => {
      await start({ kind: "refused", category: "cyber" });
      const reply = await draft({ instruction: "x" });
      expect(reply.status).toBe(422);
      expect(reply.body).toEqual({ error: "draft_refused", aiGenerated: true });
    });

    it.each(["max_tokens", "no_output", "schema_mismatch"] as const)("answers 502 for unusable output (%s)", async (detail) => {
      await start({ kind: "invalid_output", detail });
      const reply = await draft({ instruction: "x" });
      expect(reply.status).toBe(502);
      expect(reply.body).toEqual({ error: "draft_invalid", detail });
    });

    it("does not echo the instruction in any error", async () => {
      await start({ kind: "unavailable", reason: "server" });
      const reply = await draft({ instruction: "buy leak-marker-4471" });
      expect(reply.text).not.toContain("leak-marker-4471");
    });
  });
});
