import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStub, unknown } from "../src/gate/test-support.ts";
import type { PayPalAdapter } from "../src/paypal/adapter.ts";
import { createGate } from "../src/gate/gate.ts";
import { createMemoryAuditLog } from "../src/gate/audit-log.ts";
import { runEndToEnd, settleLeftovers } from "./e2e-run.ts";

// The run is tested against the stub adapter, as lifecycle.ts is. That checks the
// orchestration and the report, not PayPal; the real run is the developer's.

describe("runEndToEnd", () => {
  let directory: string;
  let auditPath: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "ostensia-e2e-"));
    auditPath = join(directory, "e2e.jsonl");
  });
  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  async function run(overrides: Partial<PayPalAdapter> = {}) {
    const stub = createStub(overrides);
    const report = await runEndToEnd({ adapter: stub.adapter, auditPath, runId: "t1" });
    return { stub, report };
  }

  it("passes every step against a well-behaved PayPal", async () => {
    const { stub, report } = await run();
    expect(report.lines.filter((line) => line.includes("FAIL"))).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.lines.at(-1)).toBe("RESULT: every step passed");
    expect(stub.count("createVaultOrder")).toBe(2);
    expect(stub.count("captureAuthorization")).toBe(1);
    expect(stub.count("voidAuthorization")).toBe(1);
  });

  it("leaves no authorization open", async () => {
    const { stub } = await run();
    const states = [...stub.authorizations.values()].map((authorization) => authorization.state).sort();
    expect(states).toEqual(["captured", "voided"]);
  });

  it("writes an audit file and prints no ids, tokens or secrets", async () => {
    const { stub, report } = await run();
    expect(readFileSync(auditPath, "utf8").length).toBeGreaterThan(0);
    const printed = report.lines.join("\n");
    for (const authorizationId of stub.authorizations.keys()) expect(printed).not.toContain(authorizationId);
    expect(printed).not.toMatch(/ORDER-|AUTH-|CAPTURE-/);
    expect(printed).not.toContain("e2e-t1");
  });

  it("fails, and says so, when the capture does not complete", async () => {
    const { report } = await run({ captureAuthorization: async () => unknown() });
    expect(report.ok).toBe(false);
    expect(report.lines.some((line) => line.includes("FAIL"))).toBe(true);
    expect(report.lines.at(-1)).toContain("did not pass");
  });

  it("voids a waiting authorization itself when a step fails, and leaves nothing open", async () => {
    // The first settle read of the second order fails, so step 6 fails and the
    // authorization is left waiting. The cleanup revokes the mandate and settles
    // it again, which voids it.
    const stub = createStub();
    let failedOnce = false;
    const flaky: PayPalAdapter = {
      ...stub.adapter,
      getAuthorization: async (id) => {
        if (stub.count("createVaultOrder") >= 2 && !failedOnce) {
          failedOnce = true;
          return unknown();
        }
        return stub.adapter.getAuthorization(id);
      },
    };
    const lines: string[] = [];
    const report = await runEndToEnd({ adapter: flaky, auditPath, runId: "t4", onLine: (line) => lines.push(line) });
    expect(report.ok).toBe(false);
    expect(lines.join("\n")).not.toContain("ATTENTION");
    expect([...stub.authorizations.values()].map((authorization) => authorization.state).sort()).toEqual(["captured", "voided"]);
  });

  it("fails and names the open authorization when the gate stops mid-run", async () => {
    // The settle read of the second order throws, which stops the gate (fail
    // closed). The run cannot settle that authorization, and must say so.
    const stub = createStub();
    const throwing: PayPalAdapter = {
      ...stub.adapter,
      getAuthorization: async (id) => {
        if (stub.count("createVaultOrder") >= 2) throw new Error("synthetic failure");
        return stub.adapter.getAuthorization(id);
      },
    };
    const lines: string[] = [];
    const report = await runEndToEnd({ adapter: throwing, auditPath, runId: "t2", onLine: (line) => lines.push(line) });
    expect(report.ok).toBe(false);
    expect(lines.join("\n")).toContain("ATTENTION");
    expect(lines.join("\n")).toContain("AUTH-e2e-t2-b2");
    expect(stub.count("voidAuthorization")).toBe(0);
  });

  it("prints a warning with the authorization id when one cannot be settled", async () => {
    const lines: string[] = [];
    const stub = createStub({ voidAuthorization: async () => unknown() });
    const report = await runEndToEnd({ adapter: stub.adapter, auditPath, runId: "t3", onLine: (line) => lines.push(line) });
    expect(report.ok).toBe(false);
    expect(lines.join("\n")).toContain("ATTENTION");
    expect(lines.join("\n")).toMatch(/AUTH-e2e-t3-b2/);
  });

  describe("settleLeftovers", () => {
    const TERMS = {
      currency: "USD",
      maxTotalMinor: 250,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      items: [{ productId: "sticker-pack", maxQuantity: 3, maxUnitPriceMinor: 150 }],
    };

    it("voids a waiting authorization even if its mandate was never revoked, and never captures it", async () => {
      const stub = createStub();
      const gate = await createGate({ adapter: stub.adapter, audit: createMemoryAuditLog() });
      const created = await gate.createMandate({ terms: TERMS, intentSummary: "cleanup check" });
      if (created.kind !== "ok") throw new Error("expected a mandate");
      const proposal = {
        mandateId: created.mandate.id,
        currency: "USD",
        declaredTotalMinor: 100,
        lines: [{ productId: "sticker-pack", quantity: 1, unitPriceMinor: 100 }],
      };
      const authorized = await gate.authorize({ attemptId: "left-1", mandateId: created.mandate.id, proposal });
      expect(authorized.kind === "ok" && authorized.attempt.status).toBe("authorized");

      const lines: string[] = [];
      await settleLeftovers(gate, (line) => lines.push(line));

      expect(gate.getAttempt("left-1")?.status).toBe("voided");
      expect(stub.count("captureAuthorization")).toBe(0);
      expect(stub.count("voidAuthorization")).toBe(1);
      expect(lines).toEqual([]);
    });

    it("does nothing when every attempt is settled", async () => {
      const stub = createStub();
      const gate = await createGate({ adapter: stub.adapter, audit: createMemoryAuditLog() });
      await settleLeftovers(gate, () => {});
      expect(stub.calls).toEqual([]);
    });
  });
});
