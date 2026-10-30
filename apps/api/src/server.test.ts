import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "./server.ts";

describe("server", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it("GET /health returns 200 with the status and the domain name", async () => {
    app = buildServer({ logger: false });
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", domain: "@ostensia/domain" });
  });

  it("POST /health returns 404", async () => {
    app = buildServer({ logger: false });
    const response = await app.inject({ method: "POST", url: "/health" });
    expect(response.statusCode).toBe(404);
  });

  it("an unknown route returns 404", async () => {
    app = buildServer({ logger: false });
    const response = await app.inject({ method: "GET", url: "/nope" });
    expect(response.statusCode).toBe(404);
  });
});
