import { ConfigError, loadConfig } from "./config.ts";
import type { Config } from "./config.ts";
import { AuditCorruptError } from "./gate/events.ts";
import { createFileAuditLog } from "./gate/audit-log.ts";
import { createGate } from "./gate/gate.ts";
import type { Gate } from "./gate/gate.ts";
import { createPayPalAdapter } from "./paypal/adapter.ts";
import { loadPayPalConfig } from "./paypal/paypal-config.ts";
import type { PayPalConfig } from "./paypal/paypal-config.ts";
import { buildServer } from "./server.ts";

let config: Config;
let paypalConfig: PayPalConfig;
try {
  config = loadConfig(process.env);
  // Every payment route needs PayPal, so a missing credential stops the start
  // here instead of failing on the first request.
  paypalConfig = loadPayPalConfig(process.env);
} catch (error) {
  // Only configuration errors are handled here; anything else is a bug and
  // is rethrown so it is not hidden.
  if (error instanceof ConfigError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

// Starting makes no PayPal call. The gate replays the audit log to rebuild its
// state; a log that cannot be trusted stops the start (D-022).
let gate: Gate;
try {
  gate = await createGate({
    adapter: createPayPalAdapter({ config: paypalConfig, fetch }),
    audit: createFileAuditLog(config.auditLogPath),
  });
} catch (error) {
  if (error instanceof AuditCorruptError) {
    console.error(`The audit log cannot be used: ${error.message}`);
    process.exit(1);
  }
  throw error;
}

const server = buildServer({ logger: true, gate });
for (const warning of gate.warnings) server.log.warn(warning);

try {
  await server.listen({ host: config.host, port: config.port });
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
