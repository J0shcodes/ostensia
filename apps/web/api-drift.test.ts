import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ATTEMPT_STATUSES, SCENARIOS, SHOP_MODES } from "./lib/api-types.ts";
import { AUDIT_WORDING } from "./lib/audit-record.ts";

// The web app copies three lists from the API because it may not import from apps/api
// (web-boundaries.test.ts). This test reads the API's source as text, which is not an
// import, and fails when a list changes there and not here. A copy cannot drift quietly.

const API = join(fileURLToPath(new URL(".", import.meta.url)), "..", "api", "src");
const source = (path: string): string => readFileSync(join(API, path), "utf8");

// Every quoted word in a stretch of source, in order.
const quoted = (text: string): string[] => [...text.matchAll(/"([a-z_]+)"/g)].map((match) => match[1] ?? "");

describe("the lists copied from the API", () => {
  it("lists every attempt status the gate can produce, in the gate's order", () => {
    const text = source("gate/state.ts");
    const block = /export type AttemptStatus =([\s\S]*?);/.exec(text);
    expect(block, "AttemptStatus not found in apps/api/src/gate/state.ts").not.toBeNull();
    // Comments in the union carry words in plain text, not in quotes, so only statuses match.
    const fromApi = quoted(block?.[1] ?? "");
    expect(fromApi.length).toBeGreaterThan(10);
    expect([...ATTEMPT_STATUSES]).toEqual(fromApi);
  });

  it("lists every simulated scenario", () => {
    const block = /export const SCENARIOS = \[([\s\S]*?)\] as const;/.exec(source("simulation/scenarios.ts"));
    expect(block).not.toBeNull();
    expect([...SCENARIOS]).toEqual(quoted(block?.[1] ?? ""));
  });

  it("lists both shopping-agent modes", () => {
    const block = /export const SHOP_MODES = \[([\s\S]*?)\] as const;/.exec(source("ai/shopper-prompt.ts"));
    expect(block).not.toBeNull();
    expect([...SHOP_MODES]).toEqual(quoted(block?.[1] ?? ""));
  });

  it("matches the statuses the gate can reconcile, which the page offers a button for", () => {
    const text = source("gate/gate.ts");
    const block = /const eligible =([\s\S]*?);/.exec(text);
    expect(block).not.toBeNull();
    expect(quoted(block?.[1] ?? "").sort()).toEqual(["capture_pending", "write_refused", "write_unknown"]);
  });

  it("matches the one status the gate settles", () => {
    const text = source("gate/gate.ts");
    expect(text).toContain('attempt.status !== "authorized"');
  });
});

describe("the audit record against the events the gate writes (apps/api/src/gate/events.ts)", () => {
  const events = source("gate/events.ts");
  const types = [...events.matchAll(/type: z\.literal\("([a-z_]+)"\)/g)].map((match) => match[1] ?? "");

  // Events that belong to a mandate, not to an attempt: GET /attempts/:id never sends them.
  const NOT_ATTEMPT_EVENTS = ["mandate_created", "mandate_revoked"];

  it("finds the event types it is meant to compare", () => {
    expect(types.length).toBeGreaterThanOrEqual(14);
    expect(types).toContain("write_result");
  });

  it("describes every kind of event the gate writes for an attempt, so none is shown as unrecognised", () => {
    const described = new Set(Object.keys(AUDIT_WORDING).map((key) => key.split(":")[0]));
    for (const type of types) {
      if (NOT_ATTEMPT_EVENTS.includes(type)) continue;
      expect(described.has(type), `${type} has no row in the audit wording table`).toBe(true);
    }
  });

  it("describes every outcome of an order and of a write", () => {
    const outcomes = (type: string): string[] => {
      const start = events.indexOf(`type: z.literal("${type}")`);
      const block = /outcome: z\.enum\(\[([^\]]*)\]\)/.exec(events.slice(start));
      return quoted(block?.[1] ?? "");
    };
    for (const type of ["order_result", "write_result"]) {
      const found = outcomes(type);
      expect(found.length, type).toBeGreaterThan(3);
      for (const outcome of found) expect(AUDIT_WORDING[`${type}:${outcome}`], `${type}:${outcome}`).toBeDefined();
    }
  });

  it("describes every result of reading PayPal's record again", () => {
    const start = events.indexOf('type: z.literal("reconciled")');
    const block = /result: z\.enum\(\[([^\]]*)\]\)/.exec(events.slice(start));
    const results = quoted(block?.[1] ?? "");
    expect(results.length).toBeGreaterThan(2);
    for (const result of results) expect(AUDIT_WORDING[`reconciled:${result}`], result).toBeDefined();
  });

  it("describes both decisions of the checks", () => {
    for (const type of ["precheck_decided", "final_decided"]) {
      expect(AUDIT_WORDING[`${type}:allow`], type).toBeDefined();
      expect(AUDIT_WORDING[`${type}:block`], type).toBeDefined();
    }
  });

  it("sends events with GET /attempts/:id and not with the list", () => {
    const routes = source("routes/attempts.ts");
    expect(routes).toMatch(/app\.get\("\/attempts", async \(\) => \(\{ attempts: gate\.listAttempts\(\) \}\)\)/);
    expect(routes).toContain("events: gate.eventsFor(attempt.attemptId)");
  });
});
