// Manual sandbox smoke run, started by the developer:
//
//   pnpm --filter @ostensia/api smoke              read-only: token and vault check
//   pnpm --filter @ostensia/api smoke --lifecycle  also runs the capture and void paths
//
// --lifecycle creates two sandbox orders and moves $1.00 of sandbox money once
// (one capture). Every order it creates is captured or voided before it ends, so
// no authorization is left open. The output is a sanitized report: statuses,
// kinds and yes/no answers only, no ids, tokens or secrets. See lifecycle.ts.
import { ConfigError } from "../src/config.ts";
import { createPayPalAdapter } from "../src/paypal/adapter.ts";
import { loadPayPalConfig } from "../src/paypal/paypal-config.ts";
import { describeFailure, runLifecycle } from "./lifecycle.ts";

const flags = process.argv.slice(2);
if (flags.includes("--create")) {
  console.error("--create was replaced by --lifecycle, which also captures or voids everything it creates.");
  process.exit(1);
}
const unknownFlag = flags.find((flag) => flag !== "--lifecycle");
if (unknownFlag !== undefined) {
  console.error("Unknown option. The only option is --lifecycle.");
  process.exit(1);
}
const wantLifecycle = flags.includes("--lifecycle");

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
let ok = true;

console.log("PayPal sandbox smoke run (sanitized)");

const vault = await adapter.checkVault();
if (vault.kind === "ok") {
  console.log("VAULT: ok");
} else {
  ok = false;
  console.log(
    `VAULT: ${vault.kind === "vault_unavailable" ? "vault_unavailable (404 RESOURCE_NOT_FOUND)" : describeFailure(vault)}`,
  );
}

if (!wantLifecycle) {
  console.log("LIFECYCLE: skipped (pass --lifecycle to run the capture and void paths; it moves $1.00 of sandbox money once)");
} else if (!ok) {
  console.log("LIFECYCLE: skipped because the vault check did not pass");
} else {
  console.log("LIFECYCLE: running (two sandbox orders; one $1.00 capture)");
  const report = await runLifecycle(adapter, { runId: String(Date.now()) });
  for (const line of report.lines) console.log(line);
  ok = report.ok;
}

console.log(ok ? "RESULT: all steps that ran passed" : "RESULT: at least one step did not pass (see above)");
process.exitCode = ok ? 0 : 1;
