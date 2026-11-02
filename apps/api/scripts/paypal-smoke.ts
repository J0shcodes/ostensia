// Manual sandbox smoke run, started by the developer: pnpm --filter @ostensia/api smoke
//
// Read-only by default: it gets a token and checks the vault. With --create it
// also creates ONE vault order, reads the authorization back and prints what it
// saw. That leaves one authorization in status CREATED in the sandbox; void it in
// Postman (this increment has no void). It never captures.
//
// The output is a sanitized report: statuses, kinds and yes/no answers only. No
// ids, tokens or secrets are printed.
import { createHash } from "node:crypto";
import { ConfigError } from "../src/config.ts";
import { createPayPalAdapter, toObservedPayment } from "../src/paypal/adapter.ts";
import type { Failure } from "../src/paypal/adapter.ts";
import { loadPayPalConfig } from "../src/paypal/paypal-config.ts";

function describeFailure(failure: Failure): string {
  switch (failure.kind) {
    case "not_sent":
      return `nothing was sent (token ${failure.tokenFailure})`;
    case "rejected":
      return `rejected: status ${failure.error.status}, error ${failure.error.errorName ?? "none"}, issues [${failure.error.issues.join(", ")}], debug id ${failure.error.debugId ?? "none"}`;
    case "unknown":
      return `outcome unknown: ${failure.reason}, status ${failure.status ?? "none"}, debug id ${failure.debugId ?? "none"}`;
  }
}

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
const wantCreate = process.argv.includes("--create");
let ok = true;

console.log("PayPal sandbox smoke run (sanitized)");

const vault = await adapter.checkVault();
if (vault.kind === "ok") {
  console.log("1. vault check: ok");
} else {
  ok = false;
  console.log(`1. vault check: ${vault.kind === "vault_unavailable" ? "vault_unavailable (404 RESOURCE_NOT_FOUND)" : describeFailure(vault)}`);
}

if (!wantCreate) {
  console.log("2. create order: skipped (pass --create to create one sandbox authorization)");
} else if (!ok) {
  console.log("2. create order: skipped because the vault check did not pass");
} else {
  const attemptId = `smoke-${Date.now()}`;
  const mandateHash = createHash("sha256").update(`ostensia-smoke:${attemptId}`, "utf8").digest("hex");
  const created = await adapter.createVaultOrder({ attemptId, amountMinor: 100, mandateHash });

  if (created.kind !== "created") {
    ok = false;
    console.log(
      created.kind === "anomaly"
        ? `2. create order: anomaly (${created.reason}), order status ${created.order.statusRaw}`
        : `2. create order: ${describeFailure(created)}`,
    );
  } else {
    console.log(
      `2. create order: created; order status ${created.order.statusRaw} (${created.order.state}); authorizations in response: ${created.order.authorizations.length}`,
    );

    const read = await adapter.getAuthorization(created.authorizationId);
    if (read.kind !== "ok") {
      ok = false;
      console.log(`3. get authorization: ${read.kind === "not_found" ? "not found" : describeFailure(read)}`);
    } else {
      const a = read.authorization;
      const observed = toObservedPayment(a);
      const days =
        a.expirationTime !== null && a.createTime !== null
          ? (Date.parse(a.expirationTime) - Date.parse(a.createTime)) / 86_400_000
          : null;
      console.log("3. get authorization:");
      console.log(`   status: ${a.statusRaw} (${a.state})`);
      console.log(`   amount in minor units: ${observed.amountMinor ?? "unreadable"}, currency: ${observed.currency}`);
      console.log(`   custom_id present: ${a.customId !== null}; equals the hash that was sent (R1): ${a.customId === mandateHash}`);
      console.log(`   order id present: ${a.orderId !== null}; expiration present: ${a.expirationTime !== null}; days from create to expiry: ${days ?? "unknown"}`);
      if (a.customId !== mandateHash) ok = false;
    }

    const order = await adapter.getOrder(created.order.orderId);
    if (order.kind !== "ok") {
      ok = false;
      console.log(`4. get order: ${order.kind === "not_found" ? "not found" : describeFailure(order)}`);
    } else {
      console.log(
        `4. get order: status ${order.order.statusRaw} (${order.order.state}); authorizations: ${order.order.authorizations.map((x) => `${x.statusRaw} (${x.state})`).join(", ") || "none"}`,
      );
    }
    console.log("NOTE: one sandbox authorization is still CREATED. Void it in Postman. This script never captures or voids.");
  }
}

console.log(ok ? "RESULT: all steps that ran passed" : "RESULT: at least one step did not pass (see above)");
process.exitCode = ok ? 0 : 1;
