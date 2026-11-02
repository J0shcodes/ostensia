import { describe, expect, it } from "vitest";
import type { AuthorizationSnapshot, OrderSnapshot, PayPalAdapter } from "../src/paypal/adapter.ts";
import { runLifecycle } from "./lifecycle.ts";

// A stub that behaves like the E-1 sandbox: an authorization starts CREATED, a
// capture makes it CAPTURED, a void makes it VOIDED, and a write on a settled
// authorization is refused with the issue E-1 recorded. It records every call.

type AuthState = "created" | "captured" | "voided";
type Overrides = Partial<PayPalAdapter>;

function makeStub(overrides: Overrides = {}) {
  const calls: string[] = [];
  const states = new Map<string, AuthState>();
  const seenRequests = new Map<string, string>();
  const hashes = new Map<string, string>();
  let captureCount = 0;

  const order = (orderId: string, authorizationId: string): OrderSnapshot => ({
    orderId,
    statusRaw: "COMPLETED",
    state: "completed",
    authorizations: [{ id: authorizationId, statusRaw: "CREATED", state: "created" }],
    captures: captureCount > 0 ? [{ id: "CAP", statusRaw: "COMPLETED", state: "completed" }] : [],
  });

  const defaults: PayPalAdapter = {
    async checkVault() {
      return { kind: "ok" };
    },
    async createVaultOrder(input) {
      const authorizationId = `auth-${input.attemptId}`;
      states.set(authorizationId, "created");
      hashes.set(authorizationId, input.mandateHash);
      return { kind: "created", order: order(`order-${input.attemptId}`, authorizationId), authorizationId };
    },
    async getOrder(orderId) {
      return { kind: "ok", order: order(orderId, "a") };
    },
    async getAuthorization(authorizationId) {
      const state = states.get(authorizationId);
      if (state === undefined) return { kind: "not_found" };
      const authorization: AuthorizationSnapshot = {
        id: authorizationId,
        statusRaw: state.toUpperCase(),
        state,
        amountMinor: 100,
        currency: "USD",
        customId: hashes.get(authorizationId) ?? null,
        expirationTime: "2026-12-01T12:29:15Z",
        createTime: "2026-11-02T12:29:15Z",
        orderId: "order",
      };
      return { kind: "ok", authorization };
    },
    async captureAuthorization(input) {
      const state = states.get(input.authorizationId);
      const previous = seenRequests.get(`capture:${input.attemptId}`);
      if (previous !== undefined) {
        return { kind: "accepted", capture: { captureId: "CAP", statusRaw: "COMPLETED", state: "completed", amountMinor: 100, currency: "USD" } };
      }
      if (state === "voided") return { kind: "already_terminal", issue: "AUTHORIZATION_VOIDED", status: 422, debugId: null };
      if (state === "captured") return { kind: "already_terminal", issue: "PREVIOUSLY_CAPTURED", status: 422, debugId: null };
      seenRequests.set(`capture:${input.attemptId}`, input.authorizationId);
      states.set(input.authorizationId, "captured");
      captureCount += 1;
      return { kind: "accepted", capture: { captureId: "CAP", statusRaw: "COMPLETED", state: "completed", amountMinor: 100, currency: "USD" } };
    },
    async voidAuthorization(input) {
      const state = states.get(input.authorizationId);
      if (state === "captured") return { kind: "already_terminal", issue: "PREVIOUSLY_CAPTURED", status: 422, debugId: null };
      if (state === "voided") return { kind: "already_terminal", issue: "AUTHORIZATION_VOIDED", status: 422, debugId: null };
      states.set(input.authorizationId, "voided");
      return { kind: "voided" };
    },
  };

  // Calls are recorded here, around the merged methods, so an override is
  // recorded exactly like a default.
  const merged = { ...defaults, ...overrides };
  const adapter: PayPalAdapter = {
    checkVault: () => merged.checkVault(),
    createVaultOrder: (input) => {
      calls.push(`create:${input.attemptId}`);
      return merged.createVaultOrder(input);
    },
    getOrder: (orderId) => {
      calls.push("getOrder");
      return merged.getOrder(orderId);
    },
    getAuthorization: (authorizationId) => {
      calls.push("getAuthorization");
      return merged.getAuthorization(authorizationId);
    },
    captureAuthorization: (input) => {
      calls.push(`capture:${input.attemptId}`);
      return merged.captureAuthorization(input);
    },
    voidAuthorization: (input) => {
      calls.push(`void:${input.attemptId}`);
      return merged.voidAuthorization(input);
    },
  };

  return { adapter, calls, states };
}

const RUN = { runId: "test" };
const text = (lines: readonly string[]) => lines.join("\n");

describe("runLifecycle: the E-1 lifecycle passes", () => {
  it("runs every step in order and reports success", async () => {
    const { adapter, calls } = makeStub();
    const report = await runLifecycle(adapter, RUN);
    expect(report.ok).toBe(true);
    expect(calls).toEqual([
      "create:smoke-cap-test",
      "getAuthorization",
      "capture:smoke-cap-test",
      "capture:smoke-cap-test",
      "getAuthorization",
      "getOrder",
      "void:smoke-cap-test-void",
      "create:smoke-void-test",
      "void:smoke-void-test",
      "capture:smoke-void-test-capture",
    ]);
    expect(report.lines.at(-1)).toBe("LIFECYCLE RESULT: every step passed");
    expect(report.lines.some((line) => line.includes("FAIL"))).toBe(false);
  });

  it("checks the three E-1 residuals", async () => {
    const report = await runLifecycle(makeStub().adapter, RUN);
    const output = text(report.lines);
    expect(output).toContain("PASS  custom_id equals the hash that was sent (R1)");
    expect(output).toContain("PASS  authorization is CAPTURED (R2)");
    expect(output).toContain("PASS  exactly one capture exists after the replay (R3)");
    expect(output).toContain("PASS  void is refused with PREVIOUSLY_CAPTURED");
    expect(output).toContain("PASS  capture is refused with AUTHORIZATION_VOIDED");
  });

  it("leaves no authorization open and prints no ids", async () => {
    const { adapter, states } = makeStub();
    const report = await runLifecycle(adapter, RUN);
    expect([...states.values()].sort()).toEqual(["captured", "voided"]);
    const output = text(report.lines);
    expect(output).not.toContain("auth-smoke");
    expect(output).not.toContain("order-smoke");
    expect(output).not.toContain("WARNING");
  });
});

describe("runLifecycle: a step that does not behave as in E-1 is reported", () => {
  it.each<[string, Overrides, string]>([
    [
      "a replay with a different capture id",
      (() => {
        let n = 0;
        return {
          async captureAuthorization() {
            n += 1;
            return {
              kind: "accepted" as const,
              capture: { captureId: `CAP-${n}`, statusRaw: "COMPLETED", state: "completed" as const, amountMinor: 100, currency: "USD" },
            };
          },
        };
      })(),
      "FAIL  replay returns the same capture id and status",
    ],
    [
      "an authorization that is not CAPTURED after the capture",
      {
        async getAuthorization() {
          return {
            kind: "ok" as const,
            authorization: {
              id: "a",
              statusRaw: "CREATED",
              state: "created" as const,
              amountMinor: 100,
              currency: "USD",
              customId: null,
              expirationTime: null,
              createTime: null,
              orderId: null,
            },
          };
        },
      },
      "FAIL  authorization is CAPTURED (R2)",
    ],
    [
      "two captures on the order",
      {
        async getOrder(orderId: string) {
          return {
            kind: "ok" as const,
            order: {
              orderId,
              statusRaw: "COMPLETED",
              state: "completed" as const,
              authorizations: [],
              captures: [
                { id: "A", statusRaw: "COMPLETED", state: "completed" as const },
                { id: "B", statusRaw: "COMPLETED", state: "completed" as const },
              ],
            },
          };
        },
      },
      "FAIL  exactly one capture exists after the replay (R3)",
    ],
    [
      "a void after capture that is accepted",
      {
        async voidAuthorization() {
          return { kind: "voided" as const };
        },
      },
      "FAIL  void is refused with PREVIOUSLY_CAPTURED",
    ],
  ])("fails the run for %s", async (_label, overrides, expected) => {
    const report = await runLifecycle(makeStub(overrides).adapter, RUN);
    expect(report.ok).toBe(false);
    expect(text(report.lines)).toContain(expected);
  });

  it("fails when custom_id does not match, without hiding the rest", async () => {
    const stub = makeStub({
      async getAuthorization(authorizationId: string) {
        return {
          kind: "ok" as const,
          authorization: {
            id: authorizationId,
            statusRaw: "CAPTURED",
            state: "captured" as const,
            amountMinor: 100,
            currency: "USD",
            customId: "something-else",
            expirationTime: null,
            createTime: null,
            orderId: null,
          },
        };
      },
    });
    const report = await runLifecycle(stub.adapter, RUN);
    expect(report.ok).toBe(false);
    expect(text(report.lines)).toContain("FAIL  custom_id equals the hash that was sent (R1)");
  });
});

describe("runLifecycle: a create that fails", () => {
  it("skips that path's writes and still runs the other path", async () => {
    let n = 0;
    const stub = makeStub({
      async createVaultOrder(input) {
        n += 1;
        if (n === 1) return { kind: "rejected", error: { status: 422, errorName: "X", issues: [], debugId: null } };
        return {
          kind: "created",
          order: { orderId: "o", statusRaw: "COMPLETED", state: "completed", authorizations: [], captures: [] },
          authorizationId: `auth-${input.attemptId}`,
        };
      },
    });
    const report = await runLifecycle(stub.adapter, RUN);
    expect(report.ok).toBe(false);
    expect(stub.calls.filter((call) => call.startsWith("capture:smoke-cap"))).toEqual([]);
    expect(stub.calls).toContain("void:smoke-void-test");
  });

  it("reports an anomaly without sending any write for it", async () => {
    const stub = makeStub({
      async createVaultOrder() {
        return {
          kind: "anomaly",
          reason: "no_authorization",
          order: { orderId: "o", statusRaw: "COMPLETED", state: "completed", authorizations: [], captures: [] },
        };
      },
    });
    const report = await runLifecycle(stub.adapter, RUN);
    expect(report.ok).toBe(false);
    expect(text(report.lines)).toContain("anomaly (no_authorization)");
    expect(stub.calls.some((call) => call.startsWith("capture") || call.startsWith("void"))).toBe(false);
  });
});

describe("runLifecycle: cleanup of anything left open", () => {
  it("voids the authorization when the capture outcome is unknown, without printing its id", async () => {
    const stub = makeStub({
      async captureAuthorization(input) {
        if (input.attemptId === "smoke-cap-test") {
          return { kind: "unknown", reason: "timeout", status: null, debugId: null };
        }
        return { kind: "already_terminal", issue: "AUTHORIZATION_VOIDED", status: 422, debugId: null };
      },
    });
    const report = await runLifecycle(stub.adapter, RUN);
    expect(report.ok).toBe(false);
    expect(stub.calls).toContain("void:smoke-cap-test-cleanup");
    expect(text(report.lines)).toContain("cleanup: voided");
    expect(text(report.lines)).not.toContain("auth-smoke");
    expect(text(report.lines)).not.toContain("WARNING");
  });

  it("prints the sandbox authorization id, with a warning, only when cleanup fails too", async () => {
    const stub = makeStub({
      async captureAuthorization(input) {
        if (input.attemptId === "smoke-cap-test") return { kind: "unknown", reason: "timeout", status: null, debugId: null };
        return { kind: "already_terminal", issue: "AUTHORIZATION_VOIDED", status: 422, debugId: null };
      },
      async voidAuthorization(input) {
        if (input.attemptId === "smoke-cap-test-cleanup") return { kind: "unknown", reason: "server_error", status: 500, debugId: null };
        return { kind: "voided" };
      },
    });
    const report = await runLifecycle(stub.adapter, RUN);
    expect(report.ok).toBe(false);
    expect(text(report.lines)).toContain("cleanup FAILED");
    expect(text(report.lines)).toContain("WARNING: void this sandbox authorization by hand");
    expect(text(report.lines)).toContain("auth-smoke-cap-test");
  });

  it("never attempts a capture after a void that was not confirmed, and cleans up instead", async () => {
    const stub = makeStub({
      async voidAuthorization(input) {
        if (input.attemptId === "smoke-void-test") return { kind: "unknown", reason: "void_unconfirmed", status: 204, debugId: null };
        return { kind: "voided" };
      },
    });
    const report = await runLifecycle(stub.adapter, RUN);
    expect(report.ok).toBe(false);
    expect(stub.calls).not.toContain("capture:smoke-void-test-capture");
    expect(stub.calls).toContain("void:smoke-void-test-cleanup");
    expect(text(report.lines)).toContain("Capture-after-void was NOT attempted");
  });

  it("never creates a capture on an authorization it did not just create", async () => {
    const { adapter, calls } = makeStub();
    await runLifecycle(adapter, RUN);
    const captures = calls.filter((call) => call.startsWith("capture:"));
    expect(captures.every((call) => /^capture:smoke-(cap|void)-test/.test(call))).toBe(true);
  });
});
