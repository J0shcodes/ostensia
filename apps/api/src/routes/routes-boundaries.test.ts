import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Boundary scan of the route and simulation sources, like gate-boundaries.test.ts.
// The routes only translate HTTP to gate calls. They must not reach PayPal, the
// file system, the environment or the clock themselves: every payment decision
// and every PayPal call stays behind the gate.

const SCANNED = [new URL("./", import.meta.url), new URL("../simulation/", import.meta.url)];

function productionSources(): Record<string, string> {
  const sources: Record<string, string> = {};
  for (const directory of SCANNED) {
    for (const name of readdirSync(directory)) {
      if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
      sources[`${directory.pathname.split("/").filter(Boolean).at(-1)}/${name}`] = readFileSync(new URL(name, directory), "utf8")
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");
    }
  }
  return sources;
}

describe("route and simulation source boundaries", () => {
  const sources = productionSources();

  it("finds the files it is meant to scan", () => {
    expect(Object.keys(sources).sort()).toEqual([
      "routes/attempts.ts",
      "routes/mandates.ts",
      "routes/respond.ts",
      "routes/simulation.ts",
      "simulation/catalogue.ts",
      "simulation/scenarios.ts",
    ]);
  });

  it.each([
    ["the PayPal adapter or its modules", /paypal\//],
    ["an adapter call", /adapter\./],
    ["the file system", /node:fs/],
    ["a direct read of process.env", /process\.env/],
    ["console output", /\bconsole\./],
    ["a bare fetch call", /(?<![A-Za-z.])fetch\(/],
    ["the clock", /\bnew Date\(|Date\.now/],
    ["randomness", /Math\.random|randomUUID/],
    ["a timer", /\bset(Timeout|Interval)\(/],
  ])("contains no %s", (_label, pattern) => {
    for (const [name, code] of Object.entries(sources)) {
      expect(code, `${name} matches ${pattern}`).not.toMatch(pattern);
    }
  });

  it("decides nothing about payment: no capture, void or evaluation outside the gate", () => {
    for (const [name, code] of Object.entries(sources)) {
      expect(code, `${name} must not decide`).not.toMatch(/nextPaymentAction|finalEvaluatePurchase|precheckPurchase|captureAuthorization|voidAuthorization/);
    }
  });

  it("reaches the gate only through its public methods (no state or log access)", () => {
    for (const [name, code] of Object.entries(sources)) {
      expect(code, `${name} must not touch state or the log`).not.toMatch(/applyEvent|\.append\(|readAll|emptyState/);
    }
  });
});
