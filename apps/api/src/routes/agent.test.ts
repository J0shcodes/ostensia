import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { ShopInput, ShopResult, ShoppingAgent } from "../ai/shopper.ts";
import { buildServer } from "../server.ts";
import { setupGate } from "../gate/test-support.ts";
import type { Context } from "../gate/test-support.ts";

// The agent route, with a scripted shopping agent. Nothing here reaches a provider.

const TERMS = {
  currency: "USD",
  maxTotalMinor: 1000,
  expiresAt: "2026-11-12T00:00:00.000Z",
  items: [
    { productId: "sticker-pack", allowedVariantIds: ["matte", "gloss"], maxQuantity: 5, maxUnitPriceMinor: 150 },
    { productId: "ceramic-mug", allowedVariantIds: ["blue"], maxQuantity: 1, maxUnitPriceMinor: 1000 },
  ],
};

function pick(value: unknown, ...path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

const proposed = (lines: { productId: string; variantId: string; quantity: number }[], rationale = "Because."): ShopResult => ({
  kind: "proposed",
  lines,
  rationale,
  usage: null,
});
const STICKER: ShopResult = proposed([{ productId: "sticker-pack", variantId: "matte", quantity: 2 }]);
const MUG: ShopResult = proposed([{ productId: "ceramic-mug", variantId: "white", quantity: 1 }]);

describe("POST /mandates/:id/agent-proposal", () => {
  let app: FastifyInstance;
  let context: Context;
  let mandateId: string;
  const calls: ShopInput[] = [];

  async function start(result: ShopResult | null) {
    calls.length = 0;
    context = await setupGate();
    const shopper: ShoppingAgent | null =
      result === null
        ? null
        : {
            shop: async (input) => {
              calls.push(input);
              return result;
            },
          };
    app = buildServer({ logger: false, gate: context.gate, shopper });
    const created = await app.inject({
      method: "POST",
      url: "/mandates",
      payload: { terms: TERMS, intentSummary: "Desk accessories, up to $10 in total." },
    });
    mandateId = created.json().mandate.id as string;
  }

  afterEach(async () => {
    await app.close();
  });

  async function propose(payload: unknown, id: string = mandateId) {
    const response = await app.inject({ method: "POST", url: `/mandates/${id}/agent-proposal`, payload: payload as object });
    return { status: response.statusCode, body: response.json() as unknown, text: response.body };
  }

  describe("a cart", () => {
    it("is labelled as AI-generated and from a simulated shop, and comes back as an ordinary proposal", async () => {
      await start(STICKER);
      const reply = await propose({ mode: "informed" });
      expect(reply.status).toBe(200);
      expect(pick(reply.body, "aiGenerated")).toBe(true);
      expect(pick(reply.body, "simulatedShop")).toBe(true);
      expect(String(pick(reply.body, "label"))).toContain("simulated shop");
      expect(pick(reply.body, "declined")).toBeNull();
      expect(pick(reply.body, "rationale")).toBe("Because.");
      expect(pick(reply.body, "proposal")).toEqual({
        mandateId,
        currency: "USD",
        declaredTotalMinor: 200,
        lines: [{ productId: "sticker-pack", variantId: "matte", quantity: 2, unitPriceMinor: 100 }],
      });
    });

    it("is priced by the shop, not the agent: the agent's cart has no prices", async () => {
      await start(proposed([{ productId: "ceramic-mug", variantId: "blue", quantity: 1, unitPriceMinor: 1 } as never]));
      const reply = await propose({ mode: "informed" });
      expect(pick(reply.body, "proposal", "lines")).toEqual([{ productId: "ceramic-mug", variantId: "blue", quantity: 1, unitPriceMinor: 1200 }]);
      expect(pick(reply.body, "proposal", "declaredTotalMinor")).toBe(1200);
    });

    it("says whether the agent was shown the limits", async () => {
      await start(STICKER);
      expect(pick((await propose({ mode: "informed" })).body, "modeNote")).toContain("was shown");
      expect(pick((await propose({ mode: "uninformed" })).body, "modeNote")).toContain("was not shown");
      expect(calls.map((call) => call.mode)).toEqual(["informed", "uninformed"]);
    });

    it("gives the agent the mandate's terms and, when no task is sent, what the mandate was confirmed for", async () => {
      await start(STICKER);
      await propose({ mode: "informed" });
      expect(calls[0]?.task).toBe("Desk accessories, up to $10 in total.");
      expect(calls[0]?.terms).toEqual(TERMS);
    });

    it("passes the trimmed task the person sent", async () => {
      await start(STICKER);
      await propose({ mode: "informed", task: "  some stickers \n" });
      expect(calls[0]?.task).toBe("some stickers");
    });
  });

  describe("no cart", () => {
    it("shows a decline with its reason, and no proposal", async () => {
      await start({ kind: "declined", reason: "The mug costs more than the limit.", rationale: "Nothing fits.", usage: null });
      const reply = await propose({ mode: "informed" });
      expect(reply.status).toBe(200);
      expect(pick(reply.body, "proposal")).toBeNull();
      expect(pick(reply.body, "declined", "reason")).toBe("The mug costs more than the limit.");
      expect(pick(reply.body, "aiGenerated")).toBe(true);
    });
  });

  describe("the agent only proposes", () => {
    it("creates no attempt, writes no audit event of its own and makes no PayPal call", async () => {
      await start(STICKER);
      const eventsBefore = context.audit.events.length;
      await propose({ mode: "informed" });
      await propose({ mode: "uninformed" });
      expect(context.gate.listAttempts()).toEqual([]);
      expect(context.audit.events).toHaveLength(eventsBefore);
      expect(context.stub.calls).toEqual([]);
    });

    it("gives a cart the gate then captures when it fits the mandate", async () => {
      await start(STICKER);
      const reply = await propose({ mode: "informed" });
      const attempt = await app.inject({
        method: "POST",
        url: "/attempts",
        payload: { attemptId: "agent-1", mandateId, proposal: pick(reply.body, "proposal"), settleNow: true },
      });
      expect(attempt.statusCode).toBe(200);
      expect(attempt.json().attempt.status).toBe("captured");
    });

    it("gives a cart the gate blocks, before PayPal, when the agent ignored the limits", async () => {
      // The mug is priced at 1200 in the shop, above the mandate's 1000 limit, and
      // the variant is not the one the mandate allows.
      await start(MUG);
      const reply = await propose({ mode: "uninformed" });
      const attempt = await app.inject({
        method: "POST",
        url: "/attempts",
        payload: { attemptId: "agent-2", mandateId, proposal: pick(reply.body, "proposal"), settleNow: true },
      });
      expect(attempt.statusCode).toBe(200);
      expect(attempt.json().attempt.status).toBe("blocked_precheck");
      const codes = (attempt.json().attempt.precheck.violations as { code: string }[]).map((violation) => violation.code);
      expect(codes).toContain("UNIT_PRICE_EXCEEDED");
      expect(codes).toContain("VARIANT_NOT_ALLOWED");
      expect(context.stub.calls).toEqual([]);
    });
  });

  describe("a bad request", () => {
    it.each([
      ["no mode", {}],
      ["an unknown mode", { mode: "omniscient" }],
      ["a blank task", { mode: "informed", task: "   " }],
      ["a task over 2,000 characters", { mode: "informed", task: "x".repeat(2001) }],
      ["a non-string task", { mode: "informed", task: 5 }],
      ["an unknown key", { mode: "informed", extra: 1 }],
    ])("rejects %s with 400 and does not call the agent", async (_name, payload) => {
      await start(STICKER);
      const reply = await propose(payload);
      expect(reply.status).toBe(400);
      expect(reply.body).toEqual({ error: "invalid_request" });
      expect(calls).toEqual([]);
    });

    it("accepts a task of exactly 2,000 characters", async () => {
      await start(STICKER);
      expect((await propose({ mode: "informed", task: "x".repeat(2000) })).status).toBe(200);
    });

    it("answers 404 for an unknown mandate and does not call the agent", async () => {
      await start(STICKER);
      const reply = await propose({ mode: "informed" }, "no-such-mandate");
      expect(reply.status).toBe(404);
      expect(reply.body).toEqual({ error: "mandate_not_found" });
      expect(calls).toEqual([]);
    });
  });

  describe("when the agent cannot produce a cart", () => {
    it("answers 503 not_configured when there is no agent, and the rest of the API still works", async () => {
      await start(null);
      const reply = await propose({ mode: "informed" });
      expect(reply.status).toBe(503);
      expect(reply.body).toEqual({ error: "agent_unavailable", reason: "not_configured" });
      expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
    });

    it.each(["auth", "rate_limited", "timeout", "connection", "bad_request", "server"] as const)(
      "answers 503 with the reason when the provider is unavailable (%s)",
      async (reason) => {
        await start({ kind: "unavailable", reason });
        const reply = await propose({ mode: "informed" });
        expect(reply.status).toBe(503);
        expect(reply.body).toEqual({ error: "agent_unavailable", reason });
      },
    );

    it("answers 422 when the model declined, with no cart", async () => {
      await start({ kind: "refused", category: "cyber" });
      const reply = await propose({ mode: "informed" });
      expect(reply.status).toBe(422);
      expect(reply.body).toEqual({ error: "agent_refused", aiGenerated: true });
    });

    it.each(["max_tokens", "no_output", "schema_mismatch"] as const)("answers 502 for unusable output (%s)", async (detail) => {
      await start({ kind: "invalid_output", detail });
      const reply = await propose({ mode: "informed" });
      expect(reply.status).toBe(502);
      expect(reply.body).toEqual({ error: "agent_invalid", detail });
    });

    it.each([
      ["a variant that belongs to another product", proposed([{ productId: "sticker-pack", variantId: "blue", quantity: 1 }]), "variant_not_sold"],
      ["a product the shop does not have", proposed([{ productId: "jacket", variantId: "matte", quantity: 1 }]), "unknown_product"],
      ["an empty cart", proposed([]), "empty_cart"],
    ])("answers 502 and builds no proposal for %s", async (_name, result, detail) => {
      await start(result);
      const reply = await propose({ mode: "informed" });
      expect(reply.status).toBe(502);
      expect(reply.body).toEqual({ error: "agent_invalid", detail });
    });

    it("does not echo the task in any error", async () => {
      await start({ kind: "unavailable", reason: "server" });
      const reply = await propose({ mode: "informed", task: "buy leak-marker-6620" });
      expect(reply.text).not.toContain("leak-marker-6620");
    });
  });
});
