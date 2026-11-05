import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { DOMAIN_NAME } from "@ostensia/domain";
import type { Gate } from "./gate/gate.ts";
import { registerAttemptRoutes } from "./routes/attempts.ts";
import { registerMandateRoutes } from "./routes/mandates.ts";
import { sendError } from "./routes/respond.ts";
import { registerSimulationRoutes } from "./routes/simulation.ts";

export type BuildServerOptions = {
  readonly logger: boolean;
  readonly gate: Gate;
};

// Requests are small JSON documents; anything larger is refused.
const BODY_LIMIT_BYTES = 64 * 1024;

const CLIENT_ERRORS: Readonly<Record<number, string>> = {
  413: "payload_too_large",
  415: "unsupported_media_type",
};

// Builds the server without listening, so tests can call routes in memory.
export function buildServer(options: BuildServerOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger, bodyLimit: BODY_LIMIT_BYTES });

  // Errors are answered with a fixed code and never with the framework's text,
  // which can quote the request. An unexpected error is logged on the server and
  // shows the client nothing; if it came from the gate, the gate has already
  // stopped itself and refuses further work (fail closed).
  app.setErrorHandler((error, request, reply) => {
    const reported = (error as { statusCode?: unknown }).statusCode;
    const status = typeof reported === "number" && reported >= 400 && reported < 500 ? reported : 500;
    if (status === 500) {
      request.log.error({ err: error }, "unhandled error");
      return sendError(reply, 500, "internal_error");
    }
    return sendError(reply, status, CLIENT_ERRORS[status] ?? "bad_request");
  });

  // `domain` comes from the domain package, so a real request proves the
  // workspace link works at runtime (D-002).
  app.get("/health", async () => ({ status: "ok", domain: DOMAIN_NAME }));

  registerMandateRoutes(app, options.gate);
  registerAttemptRoutes(app, options.gate);
  registerSimulationRoutes(app, options.gate);

  return app;
}
