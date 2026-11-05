import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { setupGate } from "./gate/test-support.ts";
import { buildServer } from "./server.ts";

// The routes have their own tests in routes/routes.test.ts.
describe("server", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  async function start() {
    const context = await setupGate();
    app = buildServer({ logger: false, gate: context.gate });
  }

  it("GET /health returns 200 with the status and the domain name", async () => {
    await start();
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", domain: "@ostensia/domain" });
  });

  it("POST /health returns 404", async () => {
    await start();
    const response = await app.inject({ method: "POST", url: "/health" });
    expect(response.statusCode).toBe(404);
  });

  it("an unknown route returns 404", async () => {
    await start();
    const response = await app.inject({ method: "GET", url: "/nope" });
    expect(response.statusCode).toBe(404);
  });
});
