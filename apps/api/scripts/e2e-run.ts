// The end-to-end run behind `pnpm --filter @ostensia/api e2e`. It drives the API
// the way a client would (through the server's own routes, in memory) with the
// adapter it is given, and prints a sanitized report: statuses and yes/no
// answers, never ids, tokens or secrets.
//
// With the real adapter it creates two sandbox orders and moves $1.00 of sandbox
// money once (one capture). Every authorization it creates is captured or voided
// before the run ends. If one cannot be settled, the run says so and prints that
// sandbox authorization id, so it is not orphaned.
import { createFileAuditLog } from "../src/gate/audit-log.ts";
import { createGate } from "../src/gate/gate.ts";
import type { Gate } from "../src/gate/gate.ts";
import type { PayPalAdapter } from "../src/paypal/adapter.ts";
import { buildServer } from "../src/server.ts";

export type E2EReport = { readonly lines: readonly string[]; readonly ok: boolean };
export type E2EOptions = {
  readonly adapter: PayPalAdapter;
  readonly auditPath: string;
  readonly runId: string;
  // Called with each line as it is produced, so the output is not lost if a
  // step throws.
  readonly onLine?: (line: string) => void;
};

type Reply = { readonly status: number; readonly body: unknown };

function pick(value: unknown, ...path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

// Attempts that no longer hold an open authorization at PayPal.
const CLOSED = new Set(["captured", "voided", "no_action", "conflict"]);

export async function runEndToEnd(options: E2EOptions): Promise<E2EReport> {
  const lines: string[] = [];
  let ok = true;
  const say = (line: string) => {
    lines.push(line);
    options.onLine?.(line);
  };
  const check = (label: string, passed: boolean) => {
    say(`   ${passed ? "PASS" : "FAIL"}  ${label}`);
    if (!passed) ok = false;
  };

  // Count what reaches PayPal, so "no call" and "one capture" are measured here
  // and not assumed.
  const counts = { createVaultOrder: 0, captureAuthorization: 0, voidAuthorization: 0 };
  const inner = options.adapter;
  const adapter: PayPalAdapter = {
    ...inner,
    createVaultOrder: (input) => {
      counts.createVaultOrder += 1;
      return inner.createVaultOrder(input);
    },
    captureAuthorization: (input) => {
      counts.captureAuthorization += 1;
      return inner.captureAuthorization(input);
    },
    voidAuthorization: (input) => {
      counts.voidAuthorization += 1;
      return inner.voidAuthorization(input);
    },
  };
  const countsAre = (orders: number, captures: number, voids: number) =>
    counts.createVaultOrder === orders && counts.captureAuthorization === captures && counts.voidAuthorization === voids;

  const gate = await createGate({ adapter, audit: createFileAuditLog(options.auditPath) });
  const app = buildServer({ logger: false, gate });

  async function send(method: "GET" | "POST", url: string, payload?: unknown): Promise<Reply> {
    const response = await app.inject({ method, url, ...(payload === undefined ? {} : { payload: payload as object }) });
    return { status: response.statusCode, body: response.json() as unknown };
  }

  const termsFor = () => ({
    currency: "USD",
    maxTotalMinor: 250,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    items: [
      { productId: "sticker-pack", allowedVariantIds: ["matte"], maxQuantity: 3, maxUnitPriceMinor: 150 },
      { productId: "enamel-pin", maxQuantity: 1, maxUnitPriceMinor: 200 },
    ],
  });

  async function newMandate(summary: string): Promise<string> {
    const reply = await send("POST", "/mandates", { terms: termsFor(), intentSummary: summary });
    const id = pick(reply.body, "mandate", "id");
    check(`create a mandate (201, status confirmed)`, reply.status === 201 && pick(reply.body, "mandate", "status") === "confirmed");
    return typeof id === "string" ? id : "missing";
  }

  async function proposalFor(mandateId: string, scenario: string): Promise<unknown> {
    const reply = await send("POST", `/mandates/${mandateId}/simulated-proposal`, { scenario });
    check(`simulated agent builds "${scenario}" and labels it simulated`, reply.status === 200 && pick(reply.body, "simulated") === true);
    return pick(reply.body, "proposal");
  }

  const attemptStatus = (reply: Reply) => pick(reply.body, "attempt", "status");

  try {
    say("1. The simulated catalogue");
    const catalogue = await send("GET", "/catalogue");
    check("the catalogue is labelled simulated", catalogue.status === 200 && pick(catalogue.body, "simulated") === true);

    say("2. A compliant purchase is captured");
    const mandateA = await newMandate("End-to-end run: compliant purchase");
    const compliant = await proposalFor(mandateA, "compliant");
    const idA1 = `e2e-${options.runId}-a1`;
    const first = await send("POST", "/attempts", { attemptId: idA1, mandateId: mandateA, proposal: compliant, settleNow: true });
    check(`the attempt ends captured (got ${String(attemptStatus(first))})`, first.status === 200 && attemptStatus(first) === "captured");
    check("PayPal saw one order and one capture, and no void", countsAre(1, 1, 0));

    say("3. The same request again changes nothing");
    const again = await send("POST", "/attempts", { attemptId: idA1, mandateId: mandateA, proposal: compliant, settleNow: true });
    check("the same attempt comes back, still captured", again.status === 200 && attemptStatus(again) === "captured");
    check("no further PayPal call was made", countsAre(1, 1, 0));

    say("4. A mandate is used once");
    const second = await send("POST", "/attempts", { attemptId: `e2e-${options.runId}-a2`, mandateId: mandateA, proposal: compliant });
    check("a second attempt on the spent mandate is refused (409 mandate_in_use)", second.status === 409 && pick(second.body, "error") === "mandate_in_use");
    check("no PayPal call was made", countsAre(1, 1, 0));

    say("5. A purchase over the unit-price limit is blocked before PayPal");
    const mandateB = await newMandate("End-to-end run: blocked purchase, then revoke before settlement");
    const tooDear = await proposalFor(mandateB, "over_unit_price");
    const blocked = await send("POST", "/attempts", {
      attemptId: `e2e-${options.runId}-b1`,
      mandateId: mandateB,
      proposal: tooDear,
      settleNow: true,
    });
    check(`the attempt ends blocked_precheck (got ${String(attemptStatus(blocked))})`, blocked.status === 200 && attemptStatus(blocked) === "blocked_precheck");
    const explanation = pick(blocked.body, "explanation", "precheck");
    check("an explanation is given", Array.isArray(explanation) && explanation.length > 0);
    check("no PayPal call was made", countsAre(1, 1, 0));

    say("6. Revoke before settlement: the authorization is voided, not captured");
    const compliantB = await proposalFor(mandateB, "compliant");
    const idB2 = `e2e-${options.runId}-b2`;
    const authorized = await send("POST", "/attempts", { attemptId: idB2, mandateId: mandateB, proposal: compliantB });
    check(`authorize only: the attempt waits as authorized (got ${String(attemptStatus(authorized))})`, authorized.status === 200 && attemptStatus(authorized) === "authorized");
    check("PayPal saw a second order, and no capture or void yet", countsAre(2, 1, 0));
    const revoked = await send("POST", `/mandates/${mandateB}/revoke`);
    check("the mandate is revoked", revoked.status === 200 && pick(revoked.body, "mandate", "status") === "revoked");
    const settled = await send("POST", `/attempts/${idB2}/settle`);
    check(`settle ends voided (got ${String(attemptStatus(settled))})`, settled.status === 200 && attemptStatus(settled) === "voided");
    check("PayPal saw one void, and still one capture", countsAre(2, 1, 1));
    const finalLines = pick(settled.body, "explanation", "final");
    check(
      "the explanation says the mandate was revoked",
      Array.isArray(finalLines) && finalLines.some((text) => typeof text === "string" && text.toLowerCase().includes("revoked")),
    );

    say("7. The audit record");
    const record = await send("GET", `/attempts/${idB2}`);
    const types = pick(record.body, "events");
    const names = Array.isArray(types) ? types.map((event) => pick(event, "type")) : [];
    const requested = names.indexOf("write_requested");
    check(
      "the void was recorded before its result",
      requested !== -1 && names.indexOf("write_result") > requested,
    );
  } finally {
    await settleLeftovers(gate, say);
  }

  say("8. A restart rebuilds the same state from the log");
  const before = JSON.stringify({ mandates: gate.listMandates(), attempts: gate.listAttempts() });
  await app.close();
  const restarted = await createGate({ adapter, audit: createFileAuditLog(options.auditPath) });
  const after = JSON.stringify({ mandates: restarted.listMandates(), attempts: restarted.listAttempts() });
  check("a gate started from the same file has the same mandates and attempts", before === after);
  check("the log replayed without warnings", restarted.warnings.length === 0);

  say(ok ? "RESULT: every step passed" : "RESULT: at least one step did not pass (see above)");
  return { lines, ok };
}

// Makes sure the run does not leave an authorization open. An attempt that is
// still waiting is settled after its mandate is revoked, which voids it. An
// attempt whose outcome is unknown is reconciled once. Anything still open is
// reported with its sandbox authorization id.
export async function settleLeftovers(gate: Gate, say: (line: string) => void): Promise<void> {
  for (const attempt of gate.listAttempts()) {
    if (attempt.status !== "authorized") continue;
    await gate.revokeMandate(attempt.mandateId);
    await gate.settle(attempt.attemptId);
  }
  for (const attempt of gate.listAttempts()) {
    if (attempt.authorizationId !== null && !CLOSED.has(attempt.status)) await gate.reconcile(attempt.attemptId);
  }
  for (const attempt of gate.listAttempts()) {
    if (attempt.authorizationId !== null && !CLOSED.has(attempt.status)) {
      say(
        `ATTENTION: an attempt ended as ${attempt.status} and its sandbox authorization ${attempt.authorizationId} may still be open. Void or capture it by hand.`,
      );
    }
  }
}
