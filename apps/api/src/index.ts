import { ConfigError, loadConfig } from "./config.ts";
import type { Config } from "./config.ts";
import { buildServer } from "./server.ts";

let config: Config;
try {
  config = loadConfig(process.env);
} catch (error) {
  // Only configuration errors are handled here; anything else is a bug and
  // is rethrown so it is not hidden.
  if (error instanceof ConfigError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

const server = buildServer({ logger: true });

try {
  await server.listen({ host: config.host, port: config.port });
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
