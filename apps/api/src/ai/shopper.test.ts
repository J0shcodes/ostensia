import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import type { MandateTerms } from "@ostensia/domain";
import { CATALOGUE } from "../simulation/catalogue.ts";
import { SHOPPER_MODEL, createAnthropicShopper } from "./shopper.ts";
import { systemPrompt } from "./shopper-prompt.ts";

// The shopping agent is tested against a fake client. Nothing here calls the provider.

const TERMS: MandateTerms = {
  currency: "USD",
  maxTotalMinor: 7311,
  expiresAt: "2026-11-12T00:00:00.000Z",
  items: [{ productId: "sticker-pack", allowedVariantIds: ["matte"], maxQuantity: 4, maxUnitPriceMinor: 137 }],
};

const CART = {
  lines: [{ productId: "sticker-pack", variantId: "matte", quantity: 2 }],
  rationale: "Two matte sticker packs fit a laptop.",
  declinedReason: null,
};

type Reply = Record<string, unknown>;
const reply = (overrides: Reply = {}): Reply => ({
  stop_reason: "end_turn",
  stop_details: null,
  parsed_output: CART,
  usage: { input_tokens: 1900, output_tokens: 400 },
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

const input = (mode: "informed" | "uninformed" = "informed") => ({ task: "some stickers", mode, terms: TERMS });

describe("createAnthropicShopper", () => {
  describe("a cart", () => {
    it("is returned as the agent chose it, with its explanation and usage", async () => {
      const { client } = returning(reply());
      expect(await createAnthropicShopper({ client }).shop(input())).toEqual({
        kind: "proposed",
        lines: CART.lines,
        rationale: CART.rationale,
        usage: { inputTokens: 1900, outputTokens: 400 },
      });
    });

    it("reports usage as null when the provider sends none", async () => {
      const { client } = returning(reply({ usage: undefined }));
      const result = await createAnthropicShopper({ client }).shop(input());
      expect(result.kind === "proposed" && result.usage).toBeNull();
    });

    it("accepts several lines", async () => {
      const lines = [
        { productId: "sticker-pack", variantId: "gloss", quantity: 1 },
        { productId: "enamel-pin", variantId: "star", quantity: 2 },
      ];
      const { client } = returning(reply({ parsed_output: { ...CART, lines } }));
      const result = await createAnthropicShopper({ client }).shop(input());
      expect(result.kind === "proposed" && result.lines).toEqual(lines);
    });
  });

  describe("no cart", () => {
    it("is a decline when the agent buys nothing and says why", async () => {
      const { client } = returning(reply({ parsed_output: { lines: [], rationale: "Nothing fits.", declinedReason: "The mug costs more than the limit." } }));
      expect(await createAnthropicShopper({ client }).shop(input())).toEqual({
        kind: "declined",
        reason: "The mug costs more than the limit.",
        rationale: "Nothing fits.",
        usage: { inputTokens: 1900, outputTokens: 400 },
      });
    });

    it("is still a decline, with a plain reason, when the agent sent no lines and no reason", async () => {
      const { client } = returning(reply({ parsed_output: { lines: [], rationale: "Hmm.", declinedReason: null } }));
      const result = await createAnthropicShopper({ client }).shop(input());
      expect(result).toMatchObject({ kind: "declined", reason: "The agent proposed no items." });
    });

    it("is not used when a cart comes with a reason for buying nothing", async () => {
      const { client } = returning(reply({ parsed_output: { ...CART, declinedReason: "I would rather not." } }));
      expect(await createAnthropicShopper({ client }).shop(input())).toEqual({ kind: "invalid_output", detail: "schema_mismatch" });
    });
  });

  describe("the request", () => {
    it("asks for one cart, with no tools, no web access and no sampling settings", async () => {
      const { client, requests } = returning(reply());
      await createAnthropicShopper({ client }).shop(input());
      expect(requests).toHaveLength(1);
      const request = requests[0];
      expect(request.model).toBe("claude-opus-5-5");
      expect(request.model).toBe(SHOPPER_MODEL);
      expect(request.max_tokens).toBe(16000);
      expect(request.output_config.effort).toBe("medium");
      expect(request.output_config.format.type).toBe("json_schema");
      expect(request.betas).toEqual(["server-side-fallback-2026-07-01"]);
      expect(request.fallbacks).toBe("default");
      for (const key of ["tools", "tool_choice", "thinking", "temperature", "top_p", "top_k", "stream"]) {
        expect(key in request, key).toBe(false);
      }
    });

    it("uses the fixed system prompt for the mode, and the task only in the user message", async () => {
      for (const mode of ["informed", "uninformed"] as const) {
        const { client, requests } = returning(reply());
        await createAnthropicShopper({ client }).shop({ task: "buy MARKER-5521", mode, terms: TERMS });
        const request = requests[0];
        expect(request.system).toBe(systemPrompt(mode));
        expect(request.system).not.toContain("MARKER-5521");
        expect(request.messages).toHaveLength(1);
        expect(request.messages[0].role).toBe("user");
        expect(request.messages[0].content).toContain("buy MARKER-5521");
      }
    });

    it("shows the limits to an informed agent and withholds them from an uninformed one", async () => {
      const informed = returning(reply());
      await createAnthropicShopper({ client: informed.client }).shop(input("informed"));
      expect(informed.requests[0].messages[0].content).toContain("7311");
      expect(informed.requests[0].messages[0].content).toContain("137");

      const uninformed = returning(reply());
      await createAnthropicShopper({ client: uninformed.client }).shop(input("uninformed"));
      const sent = JSON.stringify(uninformed.requests[0]);
      for (const limit of ["7311", "137", "matte only"]) expect(sent, limit).not.toContain(limit);
    });

    it("asks only for the cart shape, with no price field, and tells the model the catalogue ids", async () => {
      const { client, requests } = returning(reply());
      await createAnthropicShopper({ client }).shop(input());
      const schema = requests[0].output_config.format.schema;
      expect(Object.keys(schema.properties).sort()).toEqual(["declinedReason", "lines", "rationale"]);
      expect(schema.additionalProperties).toBe(false);
      // The line shape is a reference into $defs. The SDK sends an enum as
      // description text, so the ids are checked by our own validation (below).
      const line = schema.$defs[Object.keys(schema.$defs)[0] as string];
      expect(Object.keys(line.properties).sort()).toEqual(["productId", "quantity", "variantId"]);
      for (const product of CATALOGUE) expect(line.properties.productId.description).toContain(product.productId);
      for (const variantId of CATALOGUE.flatMap((product) => product.variantIds)) {
        expect(line.properties.variantId.description).toContain(variantId);
      }
    });

    it("uses the model it is given", async () => {
      const { client, requests } = returning(reply());
      await createAnthropicShopper({ client, model: "claude-sonnet-5-5" }).shop(input());
      expect(requests[0].model).toBe("claude-sonnet-5-5");
    });
  });

  describe("an unusable reply", () => {
    it("reports a refusal with its category", async () => {
      const { client } = returning(reply({ stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber" }, parsed_output: null }));
      expect(await createAnthropicShopper({ client }).shop(input())).toEqual({ kind: "refused", category: "cyber" });
    });

    it("does not use a cart from a refusal or a cut-off answer, even if one parsed", async () => {
      const refusal = returning(reply({ stop_reason: "refusal" }));
      expect((await createAnthropicShopper({ client: refusal.client }).shop(input())).kind).toBe("refused");
      const cutOff = returning(reply({ stop_reason: "max_tokens" }));
      expect(await createAnthropicShopper({ client: cutOff.client }).shop(input())).toEqual({ kind: "invalid_output", detail: "max_tokens" });
    });

    it("reports no output", async () => {
      const { client } = returning(reply({ parsed_output: null }));
      expect(await createAnthropicShopper({ client }).shop(input())).toEqual({ kind: "invalid_output", detail: "no_output" });
    });

    it.each([
      ["a product the shop does not have", { ...CART, lines: [{ productId: "jacket", variantId: "matte", quantity: 1 }] }],
      ["a variant the shop does not have", { ...CART, lines: [{ productId: "sticker-pack", variantId: "holographic", quantity: 1 }] }],
      ["a quantity of zero", { ...CART, lines: [{ productId: "sticker-pack", variantId: "matte", quantity: 0 }] }],
      ["a quantity above the bound", { ...CART, lines: [{ productId: "sticker-pack", variantId: "matte", quantity: 21 }] }],
      ["too many lines", { ...CART, lines: Array.from({ length: 11 }, () => ({ productId: "sticker-pack", variantId: "matte", quantity: 1 })) }],
      ["a price on a line", { ...CART, lines: [{ productId: "sticker-pack", variantId: "matte", quantity: 1, unitPriceMinor: 1 }] }],
      ["an unknown key", { ...CART, extra: 1 }],
      ["a missing rationale", { lines: CART.lines, declinedReason: null }],
    ])("checks the cart again itself and rejects %s", async (_name, parsed) => {
      const { client } = returning(reply({ parsed_output: parsed }));
      expect(await createAnthropicShopper({ client }).shop(input())).toEqual({ kind: "invalid_output", detail: "schema_mismatch" });
    });

    it("reports a reply that failed the SDK's own parsing, without quoting it", async () => {
      const { client } = throwing(new Anthropic.AnthropicError("Failed to parse structured output: leak-marker-7714"));
      const result = await createAnthropicShopper({ client }).shop(input());
      expect(result).toEqual({ kind: "invalid_output", detail: "schema_mismatch" });
      expect(JSON.stringify(result)).not.toContain("leak-marker-7714");
    });
  });

  describe("the provider cannot be used", () => {
    it.each([
      ["a timeout", () => new Anthropic.APIConnectionTimeoutError(), "timeout"],
      ["a connection error", () => new Anthropic.APIConnectionError({ message: "down" }), "connection"],
      ["a rate limit", () => apiError(429), "rate_limited"],
      ["a bad key", () => apiError(401), "auth"],
      ["a bad request", () => apiError(400), "bad_request"],
      ["a server error", () => apiError(500), "server"],
    ])("reports %s as unavailable (%s)", async (_name, make, reason) => {
      const { client } = throwing(make());
      expect(await createAnthropicShopper({ client }).shop(input())).toEqual({ kind: "unavailable", reason });
    });

    it("does not pass the provider's message on", async () => {
      const { client } = throwing(Anthropic.APIError.generate(401, { type: "error" }, "key sk-leak-marker-3301 rejected", new Headers()));
      const result = await createAnthropicShopper({ client }).shop(input());
      expect(JSON.stringify(result)).not.toContain("leak-marker-3301");
    });
  });

  describe("a bug of our own is not hidden", () => {
    it("rethrows an error it does not recognise", async () => {
      const { client } = throwing(new TypeError("synthetic bug"));
      await expect(createAnthropicShopper({ client }).shop(input())).rejects.toThrow("synthetic bug");
    });
  });
});
