import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { DOMAIN_NAME } from "@ostensia/domain";

export type BuildServerOptions = {
  readonly logger: boolean;
};

// Builds the server without listening, so tests can call routes in memory.
export function buildServer(options: BuildServerOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger });

  // `domain` comes from the domain package, so a real request proves the
  // workspace link works at runtime (D-002).
  app.get("/health", async () => ({ status: "ok", domain: DOMAIN_NAME }));

  return app;
}
