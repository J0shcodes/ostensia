import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ATTEMPT_STATUSES, SCENARIOS, SHOP_MODES } from "./lib/api-types.ts";

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
