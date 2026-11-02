// The sandbox lifecycle run behind `smoke --lifecycle`. It reproduces the E-1
// lifecycle through our own adapter and prints a sanitized report: statuses,
// kinds and yes/no answers, never ids, tokens or secrets.
//
// Every order it creates is settled before it ends. The capture path ends
// captured; the void path ends voided. If a step leaves an authorization in an
// unknown state, the run tries to void it. Only if that cleanup also fails is
// the sandbox authorization id printed, with a warning, so it is not orphaned.
//
// Safety rules in the code below:
// - a capture is only attempted on an authorization this run just created;
// - capture-after-void is only attempted after the void was confirmed, because
//   against a still-CREATED authorization it would really capture.
import { createHash } from "node:crypto";
import type { AlreadyTerminal, Failure, PayPalAdapter } from "../src/paypal/adapter.ts";

export type LifecycleReport = { readonly lines: readonly string[]; readonly ok: boolean };

const AMOUNT_MINOR = 100;

export function describeFailure(failure: Failure): string {
  switch (failure.kind) {
    case "not_sent":
      return `nothing was sent (token ${failure.tokenFailure})`;
    case "rejected":
      return `rejected: status ${failure.error.status}, error ${failure.error.errorName ?? "none"}, issues [${failure.error.issues.join(", ")}], debug id ${failure.error.debugId ?? "none"}`;
    case "unknown":
      return `outcome unknown: ${failure.reason}, status ${failure.status ?? "none"}, debug id ${failure.debugId ?? "none"}`;
  }
}

// Every adapter result has a `kind`. The three failure kinds and "already_terminal"
// carry details worth printing; any other kind is printed as its name.
function describeResult(result: { readonly kind: string }): string {
  switch (result.kind) {
    case "not_sent":
    case "rejected":
    case "unknown":
      return describeFailure(result as Failure);
    case "already_terminal": {
      const terminal = result as AlreadyTerminal;
      return `already settled: ${terminal.issue} (status ${terminal.status})`;
    }
    default:
      return result.kind;
  }
}

export async function runLifecycle(adapter: PayPalAdapter, options: { runId: string }): Promise<LifecycleReport> {
  const lines: string[] = [];
  let ok = true;
  const say = (line: string) => lines.push(line);
  const check = (label: string, passed: boolean) => {
    say(`   ${passed ? "PASS" : "FAIL"}  ${label}`);
    if (!passed) ok = false;
  };

  // Voids an authorization that is not known to be settled. Prints the sandbox
  // id only if even that fails.
  async function cleanup(authorizationId: string, attemptId: string): Promise<void> {
    const result = await adapter.voidAuthorization({ attemptId: `${attemptId}-cleanup`, authorizationId });
    if (result.kind === "voided" || result.kind === "already_terminal") {
      say(`   cleanup: ${result.kind === "voided" ? "voided" : describeResult(result)}`);
      return;
    }
    ok = false;
    say(`   cleanup FAILED: ${describeResult(result)}`);
    say(`   WARNING: void this sandbox authorization by hand. Its id is printed only because cleanup failed: ${authorizationId}`);
  }

  // ----- Capture path -----
  say("CAPTURE PATH");
  const capAttempt = `smoke-cap-${options.runId}`;
  const capHash = createHash("sha256").update(`ostensia-smoke:${capAttempt}`, "utf8").digest("hex");
  const created = await adapter.createVaultOrder({ attemptId: capAttempt, amountMinor: AMOUNT_MINOR, mandateHash: capHash });

  if (created.kind !== "created") {
    ok = false;
    say(
      created.kind === "anomaly"
        ? `1. create order: anomaly (${created.reason}), order status ${created.order.statusRaw}`
        : `1. create order: ${describeResult(created)}`,
    );
  } else {
    const authorizationId = created.authorizationId;
    say(
      `1. create order: created; order status ${created.order.statusRaw} (${created.order.state}); authorizations in response: ${created.order.authorizations.length}`,
    );

    const before = await adapter.getAuthorization(authorizationId);
    if (before.kind !== "ok") {
      ok = false;
      say(`2. get authorization: ${describeResult(before)}`);
    } else {
      const a = before.authorization;
      const days =
        a.expirationTime !== null && a.createTime !== null
          ? (Date.parse(a.expirationTime) - Date.parse(a.createTime)) / 86_400_000
          : null;
      say(`2. get authorization: status ${a.statusRaw} (${a.state}); amount ${a.amountMinor ?? "unreadable"} ${a.currency}; days to expiry ${days ?? "unknown"}`);
      check("authorization is CREATED before the capture", a.state === "created");
      check("custom_id equals the hash that was sent (R1)", a.customId === capHash);
    }

    const capture = await adapter.captureAuthorization({ attemptId: capAttempt, authorizationId });
    let captured = false;
    if (capture.kind !== "accepted") {
      ok = false;
      say(`3. capture: ${describeResult(capture)}`);
    } else {
      captured = capture.capture.state === "completed";
      say(`3. capture: accepted; status ${capture.capture.statusRaw} (${capture.capture.state}); amount ${capture.capture.amountMinor ?? "unreadable"} ${capture.capture.currency ?? "?"}`);
      check("capture is COMPLETED", captured);

      // E-1 replay: the SAME attempt id, so the same PayPal-Request-Id. The
      // application never does this by itself (D-010); this step only checks
      // what PayPal does with it.
      const replay = await adapter.captureAuthorization({ attemptId: capAttempt, authorizationId });
      if (replay.kind !== "accepted") {
        say(`4. replay of the capture: ${describeResult(replay)}`);
        check("replay is accepted with the original result", false);
      } else {
        say(`4. replay of the capture: accepted; status ${replay.capture.statusRaw} (${replay.capture.state})`);
        check("replay returns the same capture id and status", replay.capture.captureId === capture.capture.captureId && replay.capture.statusRaw === capture.capture.statusRaw);
      }
    }

    if (captured) {
      const after = await adapter.getAuthorization(authorizationId);
      if (after.kind !== "ok") {
        ok = false;
        say(`5. get authorization after capture: ${describeResult(after)}`);
      } else {
        say(`5. get authorization after capture: status ${after.authorization.statusRaw} (${after.authorization.state})`);
        check("authorization is CAPTURED (R2)", after.authorization.state === "captured");
      }

      const order = await adapter.getOrder(created.order.orderId);
      if (order.kind !== "ok") {
        ok = false;
        say(`6. get order after capture: ${describeResult(order)}`);
      } else {
        say(
          `6. get order after capture: status ${order.order.statusRaw} (${order.order.state}); captures: ${order.order.captures.map((c) => `${c.statusRaw} (${c.state})`).join(", ") || "none"}`,
        );
        check("exactly one capture exists after the replay (R3)", order.order.captures.length === 1);
      }

      const voidAfter = await adapter.voidAuthorization({ attemptId: `${capAttempt}-void`, authorizationId });
      say(`7. void after capture: ${describeResult(voidAfter)}`);
      check("void is refused with PREVIOUSLY_CAPTURED", voidAfter.kind === "already_terminal" && voidAfter.issue === "PREVIOUSLY_CAPTURED");
    } else if (capture.kind !== "already_terminal") {
      say("   The capture did not complete, so the authorization may still be open:");
      await cleanup(authorizationId, capAttempt);
    }
  }

  // ----- Void path -----
  say("VOID PATH");
  const voidAttempt = `smoke-void-${options.runId}`;
  const voidHash = createHash("sha256").update(`ostensia-smoke:${voidAttempt}`, "utf8").digest("hex");
  const second = await adapter.createVaultOrder({ attemptId: voidAttempt, amountMinor: AMOUNT_MINOR, mandateHash: voidHash });

  if (second.kind !== "created") {
    ok = false;
    say(
      second.kind === "anomaly"
        ? `1. create order: anomaly (${second.reason}), order status ${second.order.statusRaw}`
        : `1. create order: ${describeResult(second)}`,
    );
  } else {
    const authorizationId = second.authorizationId;
    say(`1. create order: created; order status ${second.order.statusRaw} (${second.order.state})`);

    const voided = await adapter.voidAuthorization({ attemptId: voidAttempt, authorizationId });
    say(`2. void (confirmed by a read): ${describeResult(voided)}`);
    check("void is confirmed as VOIDED", voided.kind === "voided");

    if (voided.kind === "voided") {
      const lateCapture = await adapter.captureAuthorization({ attemptId: `${voidAttempt}-capture`, authorizationId });
      say(`3. capture after void: ${describeResult(lateCapture)}`);
      check(
        "capture is refused with AUTHORIZATION_VOIDED",
        lateCapture.kind === "already_terminal" && lateCapture.issue === "AUTHORIZATION_VOIDED",
      );
    } else if (voided.kind !== "already_terminal") {
      say("   The void was not confirmed, so the authorization may still be open. Capture-after-void was NOT attempted.");
      await cleanup(authorizationId, voidAttempt);
    }
  }

  say(ok ? "LIFECYCLE RESULT: every step passed" : "LIFECYCLE RESULT: at least one step did not pass (see above)");
  return { lines, ok };
}
