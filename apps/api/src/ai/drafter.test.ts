import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import type { MandateDraft } from "@ostensia/domain";
import { DRAFT_MODEL, createAnthropicDrafter } from "./drafter.ts";
import { SYSTEM_PROMPT } from "./prompt.ts";

// The drafter is tested against a fake client. Nothing here calls the provider.

const NOW = new Date("2026-11-05T12:00:00.000Z");

const DRAFT: MandateDraft = {
  intentSummary: "Two matte sticker packs, up to $5 in total.",
  currency: "USD",
  maxTotalMinor: 500,
  expiresAt: "2026-11-12T23:59:59.000Z",
  items: [{ productId: "sticker-pack", allowedVariantIds: ["matte"], maxQuantity: 2, maxUnitPriceMinor: 150 }],
  notes: [],
};

const EMPTY_DRAFT: MandateDraft = {
  intentSummary: "Something nice",
  currency: null,
  maxTotalMinor: null,
  expiresAt: null,
  items: [],
  notes: ["Nothing specific was asked for."],
};

type Reply = Record<string, unknown>;
const reply = (overrides: Reply = {}): Reply => ({
  stop_reason: "end_turn",
  stop_details: null,
  parsed_output: DRAFT,
  usage: { input_tokens: 700, output_tokens: 300 },
  ...overrides,
});

function fake(respond: (params: any) => Promise<unknown>) {
  const requests: any[] = [];
  const client = {
    beta: {
      messages: {
        parse: async (params: unknown) => {
          requests.push(params);
          return respond(params);
        },
      },
    },
  } as unknown as Anthropic;
  return { client, requests };
}

const returning = (value: unknown) => fake(async () => value);
const throwing = (error: unknown) =>
  fake(async () => {
    throw error;
  });

const apiError = (status: number) => Anthropic.APIError.generate(status, { type: "error" }, "synthetic", new Headers());

describe("createAnthropicDrafter", () => {
  describe("a usable reply", () => {
    it("returns the draft unchanged, with its usage", async () => {
      const { client } = returning(reply());
      const result = await createAnthropicDrafter({ client }).draft("two sticker packs", NOW);
      expect(result).toEqual({ kind: "drafted", draft: DRAFT, usage: { inputTokens: 700, outputTokens: 300 } });
    });

    it("never fills a gap: a draft of nulls comes back as nulls", async () => {
      const { client } = returning(reply({ parsed_output: EMPTY_DRAFT }));
      const result = await createAnthropicDrafter({ client }).draft("something nice", NOW);
      expect(result).toEqual({ kind: "drafted", draft: EMPTY_DRAFT, usage: { inputTokens: 700, outputTokens: 300 } });
    });

    it("reports usage as null when the provider sends none", async () => {
      const { client } = returning(reply({ usage: undefined }));
      const result = await createAnthropicDrafter({ client }).draft("x", NOW);
      expect(result.kind === "drafted" && result.usage).toBeNull();
    });
  });

  describe("the request", () => {
    it("asks for one draft, with no tools and no web access", async () => {
      const { client, requests } = returning(reply());
      await createAnthropicDrafter({ client }).draft("two sticker packs", NOW);
      expect(requests).toHaveLength(1);
      const request = requests[0];
      expect(request.model).toBe("claude-opus-5-5");
      expect(request.model).toBe(DRAFT_MODEL);
      expect(request.max_tokens).toBe(16000);
      expect(request.output_config.effort).toBe("medium");
      expect(request.output_config.format.type).toBe("json_schema");
      expect(request.betas).toEqual(["server-side-fallback-2026-07-01"]);
      expect(request.fallbacks).toBe("default");
      for (const key of ["tools", "tool_choice", "thinking", "temperature", "top_p", "top_k", "stream"]) {
        expect(key in request, key).toBe(false);
      }
    });

    it("sends the fixed prompt as the system prompt and the instruction only in the user message", async () => {
      const { client, requests } = returning(reply());
      const instruction = "two sticker packs MARKER-8841";
      await createAnthropicDrafter({ client }).draft(instruction, NOW);
      const request = requests[0];
      expect(request.system).toBe(SYSTEM_PROMPT);
      expect(request.system).not.toContain("MARKER-8841");
      expect(request.messages).toHaveLength(1);
      expect(request.messages[0].role).toBe("user");
      expect(request.messages[0].content).toContain(instruction);
      expect(request.messages[0].content).toContain("2026-11-05T12:00:00.000Z");
    });

    it("asks for the draft shape: every draft field is in the schema sent", async () => {
      const { client, requests } = returning(reply());
      await createAnthropicDrafter({ client }).draft("x", NOW);
      const schema = requests[0].output_config.format.schema;
      expect(Object.keys(schema.properties).sort()).toEqual(
        ["currency", "expiresAt", "intentSummary", "items", "maxTotalMinor", "notes"].sort(),
      );
      expect(schema.additionalProperties).toBe(false);
    });

    it("uses the model it is given", async () => {
      const { client, requests } = returning(reply());
      await createAnthropicDrafter({ client, model: "claude-sonnet-5-5" }).draft("x", NOW);
      expect(requests[0].model).toBe("claude-sonnet-5-5");
    });
  });

  describe("an unusable reply", () => {
    it("reports a refusal with its category", async () => {
      const { client } = returning(reply({ stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber" }, parsed_output: null }));
      expect(await createAnthropicDrafter({ client }).draft("x", NOW)).toEqual({ kind: "refused", category: "cyber" });
    });

    it("reports a refusal with no category as null", async () => {
      const { client } = returning(reply({ stop_reason: "refusal", stop_details: null, parsed_output: null }));
      expect(await createAnthropicDrafter({ client }).draft("x", NOW)).toEqual({ kind: "refused", category: null });
    });

    it("does not use a draft that was cut off by the token limit, even if one parsed", async () => {
      const { client } = returning(reply({ stop_reason: "max_tokens" }));
      expect(await createAnthropicDrafter({ client }).draft("x", NOW)).toEqual({ kind: "invalid_output", detail: "max_tokens" });
    });

    it("does not use a refusal's draft, even if one parsed", async () => {
      const { client } = returning(reply({ stop_reason: "refusal" }));
      expect((await createAnthropicDrafter({ client }).draft("x", NOW)).kind).toBe("refused");
    });

    it("reports no output", async () => {
      const { client } = returning(reply({ parsed_output: null }));
      expect(await createAnthropicDrafter({ client }).draft("x", NOW)).toEqual({ kind: "invalid_output", detail: "no_output" });
    });

    it.each([
      ["an unknown key", { ...DRAFT, extra: 1 }],
      ["a currency that is not USD", { ...DRAFT, currency: "EUR" }],
      ["a string total", { ...DRAFT, maxTotalMinor: "500" }],
      ["a missing field", { intentSummary: "x" }],
    ])("checks the draft again itself and rejects %s", async (_name, parsed) => {
      const { client } = returning(reply({ parsed_output: parsed }));
      expect(await createAnthropicDrafter({ client }).draft("x", NOW)).toEqual({ kind: "invalid_output", detail: "schema_mismatch" });
    });

    it("reports a reply that failed the SDK's own parsing, without quoting it", async () => {
      const { client } = throwing(new Anthropic.AnthropicError("Failed to parse structured output: leak-marker-3320"));
      const result = await createAnthropicDrafter({ client }).draft("x", NOW);
      expect(result).toEqual({ kind: "invalid_output", detail: "schema_mismatch" });
      expect(JSON.stringify(result)).not.toContain("leak-marker-3320");
    });
  });

  describe("the provider cannot be used", () => {
    it.each([
      ["a timeout", () => new Anthropic.APIConnectionTimeoutError(), "timeout"],
      ["a connection error", () => new Anthropic.APIConnectionError({ message: "down" }), "connection"],
      ["a rate limit", () => apiError(429), "rate_limited"],
      ["a bad key", () => apiError(401), "auth"],
      ["a forbidden key", () => apiError(403), "auth"],
      ["a bad request", () => apiError(400), "bad_request"],
      ["a server error", () => apiError(500), "server"],
      ["an overloaded server", () => apiError(529), "server"],
    ])("reports %s as unavailable (%s)", async (_name, make, reason) => {
      const { client } = throwing(make());
      expect(await createAnthropicDrafter({ client }).draft("x", NOW)).toEqual({ kind: "unavailable", reason });
    });

    it("does not pass the provider's message on", async () => {
      const { client } = throwing(Anthropic.APIError.generate(401, { type: "error" }, "key sk-leak-marker-1177 rejected", new Headers()));
      const result = await createAnthropicDrafter({ client }).draft("x", NOW);
      expect(JSON.stringify(result)).not.toContain("leak-marker-1177");
    });
  });

  describe("a bug of our own is not hidden", () => {
    it("rethrows an error it does not recognise", async () => {
      const { client } = throwing(new TypeError("synthetic bug"));
      await expect(createAnthropicDrafter({ client }).draft("x", NOW)).rejects.toThrow("synthetic bug");
    });

    it("rethrows an SDK error that is not a parse failure", async () => {
      const { client } = throwing(new Anthropic.AnthropicError("Could not resolve authentication method"));
      await expect(createAnthropicDrafter({ client }).draft("x", NOW)).rejects.toThrow("Could not resolve");
    });
  });
});
