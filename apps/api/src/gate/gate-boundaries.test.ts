import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Boundary scan of the gate source, like paypal-boundaries.test.ts. It reads the
// production files only and ignores comment lines. It pins the structural
// promises the gate makes, so a later edit cannot quietly break them:
// one call site for each PayPal operation, one place where events are written,
// and no direct I/O outside the audit log.

const DIRECTORY = new URL("./", import.meta.url);

function productionSources(): Record<string, string> {
  const files = readdirSync(DIRECTORY).filter(
    (name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && name !== "test-support.ts",
  );
  return Object.fromEntries(
    files.map((name) => [
      name,
      readFileSync(new URL(name, DIRECTORY), "utf8")
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n"),
    ]),
  );
}

const count = (text: string, needle: string) => text.split(needle).length - 1;

describe("gate source boundaries", () => {
  const sources = productionSources();
  const gate = sources["gate.ts"] ?? "";

  it("finds the files it is meant to scan", () => {
    expect(Object.keys(sources).sort()).toEqual([
      "audit-log.ts",
      "events.ts",
      "gate.ts",
      "mutex.ts",
      "reconcile-rule.ts",
      "state.ts",
    ]);
  });

  it("calls each PayPal operation from exactly one place", () => {
    for (const [name, code] of Object.entries(sources)) {
      if (name === "gate.ts") continue;
      expect(code, `${name} must not touch the adapter`).not.toMatch(/adapter\./);
    }
    expect(count(gate, "adapter.createVaultOrder(")).toBe(1);
    expect(count(gate, "adapter.captureAuthorization(")).toBe(1);
    expect(count(gate, "adapter.voidAuthorization(")).toBe(1);
  });

  it("never calls checkVault, which is not part of a purchase", () => {
    expect(gate).not.toContain("checkVault");
  });

  it("writes events in exactly one place, and changes state in exactly two", () => {
    expect(count(gate, "audit.append(")).toBe(1);
    // The replay at startup, and record(), after the append.
    expect(count(gate, "applyEvent(")).toBe(2);
    for (const [name, code] of Object.entries(sources)) {
      if (name === "state.ts" || name === "gate.ts") continue;
      expect(code, `${name} must not change state`).not.toContain("applyEvent(");
    }
  });

  it("decides what to write with nextPaymentAction and nowhere else", () => {
    expect(count(gate, "nextPaymentAction(")).toBe(1);
    expect(gate).not.toMatch(/action\s*=\s*["'](capture|void)["']/);
  });

  it("reaches PayPal only through the adapter module", () => {
    // A value import and a type import from the same module are two statements.
    const imports = new Set([...gate.matchAll(/from "([^"]+)"/g)].map((match) => match[1]));
    expect([...imports].filter((specifier) => specifier?.includes("paypal"))).toEqual(["../paypal/adapter.ts"]);
  });

  it.each([
    ["console output", /\bconsole\./],
    ["a direct read of process.env", /process\.env/],
    ["a bare fetch call", /(?<![A-Za-z.])fetch\(/],
    ["randomness other than ids", /Math\.random/],
    ["a timer", /\bset(Timeout|Interval)\(/],
    ["Date.now", /Date\.now/],
  ])("contains no %s", (_label, pattern) => {
    for (const [name, code] of Object.entries(sources)) {
      expect(code, `${name} matches ${pattern}`).not.toMatch(pattern);
    }
  });

  it("reads the clock from one default only", () => {
    expect(count(gate, "new Date()")).toBe(1);
    for (const [name, code] of Object.entries(sources)) {
      if (name === "gate.ts") continue;
      expect(code, `${name} must take its time from the caller`).not.toContain("new Date(");
    }
  });

  it("keeps file access inside the audit log", () => {
    for (const [name, code] of Object.entries(sources)) {
      if (name === "audit-log.ts") continue;
      expect(code, `${name} must not use the file system`).not.toMatch(/node:fs/);
    }
  });
});
