// Manual sandbox end-to-end run, started by the developer:
//
//   pnpm --filter @ostensia/api e2e
//
// It creates two sandbox orders and moves $1.00 of sandbox money once (one
// capture), driving the API's own routes in memory (nothing listens on a port).
// Every authorization it creates is captured or voided before it ends. The
// output is a sanitized report: statuses and yes/no answers only, no ids,
// tokens or secrets. See e2e-run.ts.
//
// The run writes its own audit file, data/e2e-<run>.jsonl, which is gitignored.
import { ConfigError } from "../src/config.ts";
import { createPayPalAdapter } from "../src/paypal/adapter.ts";
import { loadPayPalConfig } from "../src/paypal/paypal-config.ts";
import { describeFailure } from "./lifecycle.ts";
import { runEndToEnd } from "./e2e-run.ts";

let config;
try {
  config = loadPayPalConfig(process.env);
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

const adapter = createPayPalAdapter({ config, fetch });

console.log("Ostensia end-to-end sandbox run (sanitized)");
const vault = await adapter.checkVault();
if (vault.kind !== "ok") {
  console.log(
    `VAULT: ${vault.kind === "vault_unavailable" ? "vault_unavailable (404 RESOURCE_NOT_FOUND)" : describeFailure(vault)}`,
  );
  console.log("RESULT: not run, because the vault check did not pass");
  process.exit(1);
}
console.log("VAULT: ok");
console.log("RUNNING: two sandbox orders; one $1.00 capture");

const runId = String(Date.now());
const report = await runEndToEnd({
  adapter,
  auditPath: `data/e2e-${runId}.jsonl`,
  runId,
  onLine: (line) => console.log(line),
});
process.exitCode = report.ok ? 0 : 1;
