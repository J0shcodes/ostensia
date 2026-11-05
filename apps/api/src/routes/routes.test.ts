import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createMemoryAuditLog } from "../gate/audit-log.ts";
import type { AuditLog } from "../gate/audit-log.ts";
import type { PayPalAdapter } from "../paypal/adapter.ts";
import { buildServer } from "../server.ts";
import { setupGate, unknown } from "../gate/test-support.ts";
import type { Context } from "../gate/test-support.ts";

// The routes, called in memory against a gate over the stub adapter and a memory
// audit log. Nothing here reaches PayPal.

function pick(value: unknown, ...path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

// Terms over the synthetic catalogue; the clock in the tests is 2026-11-02.
const TERMS = {
  currency: "USD",
  maxTotalMinor: 250,
  expiresAt: "2026-11-03T00:00:00.000Z",
  items: [
    { productId: "sticker-pack", allowedVariantIds: ["matte"], maxQuantity: 3, maxUnitPriceMinor: 150 },
    { productId: "enamel-pin", maxQuantity: 1, maxUnitPriceMinor: 200 },
  ],
};

describe("routes", () => {
  let app: FastifyInstance;
  let context: Context;

  async function start(options: { adapter?: Partial<PayPalAdapter>; audit?: AuditLog } = {}) {
    context = await setupGate(options);
    app = buildServer({ logger: false, gate: context.gate });
  }

  afterEach(async () => {
    await app.close();
  });

  async function post(url: string, payload?: unknown) {
    const response = await app.inject({ method: "POST", url, ...(payload === undefined ? {} : { payload: payload as object }) });
    return { status: response.statusCode, body: response.json() as unknown, text: response.body };
  }
  async function get(url: string) {
    const response = await app.inject({ method: "GET", url });
    return { status: response.statusCode, body: response.json() as unknown, text: response.body };
  }

  async function newMandate(): Promise<string> {
    const reply = await post("/mandates", { terms: TERMS, intentSummary: "Stickers and a pin" });
    expect(reply.status).toBe(201);
    return pick(reply.body, "mandate", "id") as string;
  }

  async function proposal(mandateId: string, scenario: string): Promise<unknown> {
    const reply = await post(`/mandates/${mandateId}/simulated-proposal`, { scenario });
    expect(reply.status).toBe(200);
    return pick(reply.body, "proposal");
  }

  describe("basics", () => {
    it("GET /health returns 200 with the status and the domain name", async () => {
      await start();
      const reply = await get("/health");
      expect(reply.status).toBe(200);
      expect(reply.body).toEqual({ status: "ok", domain: "@ostensia/domain" });
    });

    it("POST /health and an unknown route return 404", async () => {
      await start();
      expect((await post("/health")).status).toBe(404);
      expect((await get("/nope")).status).toBe(404);
    });
  });

  describe("request handling", () => {
    it("answers malformed JSON with a fixed code that does not quote the request", async () => {
      await start();
      const response = await app.inject({
        method: "POST",
        url: "/mandates",
        headers: { "content-type": "application/json" },
        payload: '{"terms": leak-marker-7731',
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "bad_request" });
      expect(response.body).not.toContain("leak-marker-7731");
    });

    it("refuses a body over 64 KB with 413", async () => {
      await start();
      const response = await app.inject({
        method: "POST",
        url: "/mandates",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify({ terms: "x".repeat(70 * 1024), intentSummary: "x" }),
      });
      expect(response.statusCode).toBe(413);
      expect(response.json()).toEqual({ error: "payload_too_large" });
    });

    it("refuses a body that is not JSON with 415", async () => {
      await start();
      const response = await app.inject({
        method: "POST",
        url: "/mandates",
        headers: { "content-type": "application/xml" },
        payload: "<a/>",
      });
      expect(response.statusCode).toBe(415);
      expect(response.json()).toEqual({ error: "unsupported_media_type" });
    });

    it.each([
      ["POST /mandates with an unknown key", "/mandates", { terms: TERMS, intentSummary: "x", extra: 1 }],
      ["POST /mandates with a non-object body", "/mandates", [1, 2]],
      ["POST /attempts with a missing mandateId", "/attempts", { attemptId: "a-1", proposal: {} }],
      ["POST /attempts with an unknown key", "/attempts", { attemptId: "a-1", mandateId: "m", proposal: {}, extra: 1 }],
      ["POST /attempts with a non-boolean settleNow", "/attempts", { attemptId: "a-1", mandateId: "m", proposal: {}, settleNow: "yes" }],
      ["POST /attempts with a non-string attemptId", "/attempts", { attemptId: 5, mandateId: "m", proposal: {} }],
    ])("rejects %s with 400 invalid_request and no echo", async (_label, url, payload) => {
      await start();
      const reply = await post(url, payload);
      expect(reply.status).toBe(400);
      expect(reply.body).toEqual({ error: "invalid_request" });
    });
  });

  describe("mandates", () => {
    it("creates a confirmed mandate with its hash (201)", async () => {
      await start();
      const reply = await post("/mandates", { terms: TERMS, intentSummary: "Stickers and a pin" });
      expect(reply.status).toBe(201);
      expect(pick(reply.body, "mandate", "status")).toBe("confirmed");
      expect(pick(reply.body, "mandate", "hash")).toMatch(/^[0-9a-f]{64}$/);
    });

    it("rejects invalid terms with 400 invalid_mandate and records nothing", async () => {
      await start();
      const reply = await post("/mandates", { terms: { currency: "EUR" }, intentSummary: "x" });
      expect(reply.status).toBe(400);
      expect(reply.body).toEqual({ error: "invalid_mandate" });
      expect(context.audit.events).toEqual([]);
    });

    it("lists and fetches mandates, and answers 404 for an unknown one", async () => {
      await start();
      const id = await newMandate();
      expect(pick((await get("/mandates")).body, "mandates")).toHaveLength(1);
      expect(pick((await get(`/mandates/${id}`)).body, "mandate", "id")).toBe(id);
      const missing = await get("/mandates/nope");
      expect(missing.status).toBe(404);
      expect(missing.body).toEqual({ error: "mandate_not_found" });
    });

    it("revokes a mandate, again without harm, and answers 404 for an unknown one", async () => {
      await start();
      const id = await newMandate();
      const first = await post(`/mandates/${id}/revoke`);
      expect(first.status).toBe(200);
      expect(pick(first.body, "mandate", "status")).toBe("revoked");
      const second = await post(`/mandates/${id}/revoke`);
      expect(second.status).toBe(200);
      expect(pick(second.body, "mandate", "status")).toBe("revoked");
      expect((await post("/mandates/nope/revoke")).status).toBe(404);
    });
  });

  describe("the simulated agent", () => {
    it("labels the catalogue as simulated", async () => {
      await start();
      const reply = await get("/catalogue");
      expect(reply.status).toBe(200);
      expect(pick(reply.body, "simulated")).toBe(true);
      expect(String(pick(reply.body, "label"))).toContain("Simulated");
      expect(pick(reply.body, "products")).toHaveLength(4);
    });

    it("builds a labelled proposal for a scenario without running it", async () => {
      await start();
      const id = await newMandate();
      const reply = await post(`/mandates/${id}/simulated-proposal`, { scenario: "compliant" });
      expect(reply.status).toBe(200);
      expect(pick(reply.body, "simulated")).toBe(true);
      expect(pick(reply.body, "scenario")).toBe("compliant");
      expect(pick(reply.body, "proposal", "mandateId")).toBe(id);
      expect(context.stub.calls).toEqual([]);
      expect(context.gate.listAttempts()).toEqual([]);
    });

    it("rejects an unknown scenario (400) and an unknown mandate (404)", async () => {
      await start();
      const id = await newMandate();
      expect((await post(`/mandates/${id}/simulated-proposal`, { scenario: "steal" })).status).toBe(400);
      expect((await post(`/mandates/nope/simulated-proposal`, { scenario: "compliant" })).status).toBe(404);
    });

    it("says so when a scenario cannot be built from the mandate (422)", async () => {
      await start();
      const reply = await post("/mandates", {
        terms: { ...TERMS, items: [{ productId: "sticker-pack", maxQuantity: 1, maxUnitPriceMinor: 5000 }] },
        intentSummary: "Anything cheap",
      });
      const id = pick(reply.body, "mandate", "id") as string;
      const result = await post(`/mandates/${id}/simulated-proposal`, { scenario: "over_unit_price" });
      expect(result.status).toBe(422);
      expect(pick(result.body, "error")).toBe("scenario_not_buildable");
      expect(pick(result.body, "simulated")).toBe(true);
    });
  });

  describe("attempts", () => {
    it("runs a compliant purchase to capture (settleNow)", async () => {
      await start();
      const id = await newMandate();
      const reply = await post("/attempts", {
        attemptId: "a-1",
        mandateId: id,
        proposal: await proposal(id, "compliant"),
        settleNow: true,
      });
      expect(reply.status).toBe(200);
      expect(pick(reply.body, "attempt", "status")).toBe("captured");
      expect(context.stub.names()).toEqual(["createVaultOrder", "getAuthorization", "captureAuthorization"]);
    });

    it("blocks a purchase over the unit-price limit with 200 and no PayPal call", async () => {
      await start();
      const id = await newMandate();
      const reply = await post("/attempts", {
        attemptId: "a-1",
        mandateId: id,
        proposal: await proposal(id, "over_unit_price"),
        settleNow: true,
      });
      expect(reply.status).toBe(200);
      expect(pick(reply.body, "attempt", "status")).toBe("blocked_precheck");
      const lines = pick(reply.body, "explanation", "precheck") as string[];
      expect(lines.length).toBeGreaterThan(0);
      expect(context.stub.calls).toEqual([]);
    });

    it.each(["over_quantity", "wrong_variant", "unlisted_product", "over_total"])(
      "blocks the %s scenario before PayPal",
      async (scenario) => {
        await start();
        const id = await newMandate();
        const reply = await post("/attempts", {
          attemptId: "a-1",
          mandateId: id,
          proposal: await proposal(id, scenario),
          settleNow: true,
        });
        expect(pick(reply.body, "attempt", "status")).toBe("blocked_precheck");
        expect(context.stub.calls).toEqual([]);
      },
    );

    it("stops after authorize without settleNow, and settle then captures", async () => {
      await start();
      const id = await newMandate();
      const reply = await post("/attempts", { attemptId: "a-1", mandateId: id, proposal: await proposal(id, "compliant") });
      expect(pick(reply.body, "attempt", "status")).toBe("authorized");
      expect(context.stub.count("captureAuthorization")).toBe(0);
      const settled = await post("/attempts/a-1/settle");
      expect(settled.status).toBe(200);
      expect(pick(settled.body, "attempt", "status")).toBe("captured");
    });

    it("voids, and does not capture, when the mandate is revoked before settlement", async () => {
      await start();
      const id = await newMandate();
      await post("/attempts", { attemptId: "a-1", mandateId: id, proposal: await proposal(id, "compliant") });
      await post(`/mandates/${id}/revoke`);
      const settled = await post("/attempts/a-1/settle");
      expect(pick(settled.body, "attempt", "status")).toBe("voided");
      expect(context.stub.count("captureAuthorization")).toBe(0);
      expect(context.stub.count("voidAuthorization")).toBe(1);
      const lines = pick(settled.body, "explanation", "final") as string[];
      expect(lines.join(" ").toLowerCase()).toContain("revoked");
    });

    it("returns the same attempt for the same request, with no second PayPal call", async () => {
      await start();
      const id = await newMandate();
      const body = { attemptId: "a-1", mandateId: id, proposal: await proposal(id, "compliant"), settleNow: true };
      const first = await post("/attempts", body);
      const callsAfterFirst = context.stub.calls.length;
      const second = await post("/attempts", body);
      expect(second.status).toBe(200);
      expect(pick(second.body, "attempt")).toEqual(pick(first.body, "attempt"));
      expect(context.stub.calls.length).toBe(callsAfterFirst);
    });

    it("refuses a reused attempt id with a different request (409)", async () => {
      await start();
      const id = await newMandate();
      const compliant = await proposal(id, "compliant");
      await post("/attempts", { attemptId: "a-1", mandateId: id, proposal: compliant });
      const reply = await post("/attempts", { attemptId: "a-1", mandateId: id, proposal: await proposal(id, "over_total") });
      expect(reply.status).toBe(409);
      expect(reply.body).toEqual({ error: "attempt_id_reused" });
    });

    it("refuses a second attempt while the mandate is in use (409 with the other attempt)", async () => {
      await start();
      const id = await newMandate();
      const compliant = await proposal(id, "compliant");
      await post("/attempts", { attemptId: "a-1", mandateId: id, proposal: compliant });
      const reply = await post("/attempts", { attemptId: "a-2", mandateId: id, proposal: compliant });
      expect(reply.status).toBe(409);
      expect(reply.body).toEqual({ error: "mandate_in_use", byAttemptId: "a-1" });
      expect(context.stub.count("createVaultOrder")).toBe(1);
    });

    it.each([
      ["an invalid attempt id", { attemptId: "not valid!" }, 400, "invalid_attempt_id"],
      ["an unknown mandate", { mandateId: "nope" }, 404, "mandate_not_found"],
      ["an invalid proposal", { proposal: { lines: "none" } }, 400, "invalid_proposal"],
    ])("refuses %s", async (_label, override, status, error) => {
      await start();
      const id = await newMandate();
      const reply = await post("/attempts", {
        attemptId: "a-1",
        mandateId: id,
        proposal: await proposal(id, "compliant"),
        ...override,
      });
      expect(reply.status).toBe(status);
      expect(reply.body).toEqual({ error });
      expect(context.stub.calls).toEqual([]);
    });

    it("answers 404 for settle and reconcile of an unknown attempt", async () => {
      await start();
      expect((await post("/attempts/nope/settle")).status).toBe(404);
      expect((await post("/attempts/nope/reconcile")).status).toBe(404);
    });

    it("answers 502 when PayPal cannot be read at settle, writes nothing, and keeps the attempt authorized", async () => {
      await start({ adapter: { getAuthorization: async () => unknown() } });
      const id = await newMandate();
      await post("/attempts", { attemptId: "a-1", mandateId: id, proposal: await proposal(id, "compliant") });
      const reply = await post("/attempts/a-1/settle");
      expect(reply.status).toBe(502);
      expect(pick(reply.body, "error")).toBe("read_failed");
      expect(pick(reply.body, "attempt", "status")).toBe("authorized");
      expect(context.stub.count("captureAuthorization")).toBe(0);
      expect(context.stub.count("voidAuthorization")).toBe(0);
    });

    it("reconciles an unknown capture by reading only", async () => {
      await start({ adapter: { captureAuthorization: async () => unknown() } });
      const id = await newMandate();
      const run = await post("/attempts", {
        attemptId: "a-1",
        mandateId: id,
        proposal: await proposal(id, "compliant"),
        settleNow: true,
      });
      expect(pick(run.body, "attempt", "status")).toBe("write_unknown");
      const reply = await post("/attempts/a-1/reconcile");
      expect(reply.status).toBe(200);
      expect(pick(reply.body, "outcome")).toBe("unchanged");
      expect(context.stub.count("captureAuthorization")).toBe(1);
    });

    it("reports reconcile as not applicable for an attempt that is not waiting on an outcome", async () => {
      await start();
      const id = await newMandate();
      await post("/attempts", { attemptId: "a-1", mandateId: id, proposal: await proposal(id, "compliant") });
      const reply = await post("/attempts/a-1/reconcile");
      expect(pick(reply.body, "outcome")).toBe("not_applicable");
    });

    it("lists attempts and shows one with its audit events, the write announced before its result", async () => {
      await start();
      const id = await newMandate();
      await post("/attempts", { attemptId: "a-1", mandateId: id, proposal: await proposal(id, "compliant"), settleNow: true });
      expect(pick((await get("/attempts")).body, "attempts")).toHaveLength(1);
      const shown = await get("/attempts/a-1");
      expect(shown.status).toBe(200);
      const types = (pick(shown.body, "events") as { type: string }[]).map((event) => event.type);
      expect(types.indexOf("write_requested")).toBeGreaterThan(-1);
      expect(types.indexOf("write_result")).toBeGreaterThan(types.indexOf("write_requested"));
      expect(types).not.toContain("mandate_created");
      expect((await get("/attempts/nope")).status).toBe(404);
    });

    it("shows an attempt's own events only, not those of other attempts", async () => {
      await start();
      const first = await newMandate();
      const second = await newMandate();
      await post("/attempts", { attemptId: "a-1", mandateId: first, proposal: await proposal(first, "compliant") });
      await post("/attempts", { attemptId: "a-2", mandateId: second, proposal: await proposal(second, "compliant") });
      const shown = await get("/attempts/a-1");
      const events = pick(shown.body, "events") as { attemptId: string }[];
      expect(events.length).toBeGreaterThan(0);
      expect(events.every((event) => event.attemptId === "a-1")).toBe(true);
    });
  });

  describe("a failing audit log", () => {
    it("answers 500 with nothing quoted, then 503 for everything, and sends nothing to PayPal", async () => {
      const memory = createMemoryAuditLog();
      let failing = false;
      const audit: AuditLog = {
        readAll: () => memory.readAll(),
        append: async (event) => {
          if (failing) throw new Error("disk full leak-marker-5512");
          await memory.append(event);
        },
      };
      await start({ audit });
      const id = await newMandate();
      const compliant = await proposal(id, "compliant");

      failing = true;
      const first = await post("/attempts", { attemptId: "a-1", mandateId: id, proposal: compliant, settleNow: true });
      expect(first.status).toBe(500);
      expect(first.body).toEqual({ error: "internal_error" });
      expect(first.text).not.toContain("leak-marker-5512");

      const second = await post("/attempts", { attemptId: "a-2", mandateId: id, proposal: compliant });
      expect(second.status).toBe(503);
      expect(second.body).toEqual({ error: "gate_faulted" });
      expect(context.stub.calls).toEqual([]);
    });
  });
});
