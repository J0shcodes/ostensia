import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Boundary scan of the drafting sources, like gate-boundaries.test.ts. Drafting
// only proposes (D-024): it must not reach the gate or PayPal, give the model
// tools or web access, or read the environment, the clock or the network itself.

const DIRECTORY = new URL("./", import.meta.url);

function productionSources(): Record<string, string> {
  const files = readdirSync(DIRECTORY).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));
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

describe("drafting source boundaries", () => {
  const sources = productionSources();

  it("finds the files it is meant to scan", () => {
    expect(Object.keys(sources).sort()).toEqual(["ai-config.ts", "draft-checks.ts", "drafter.ts", "prompt.ts"]);
  });

  it("does not reach the gate, PayPal or the routes", () => {
    for (const [name, code] of Object.entries(sources)) {
      expect(code, `${name} must not import the gate`).not.toMatch(/from "\.\.\/gate\//);
      expect(code, `${name} must not import PayPal`).not.toMatch(/from "\.\.\/paypal\//);
      expect(code, `${name} must not import routes`).not.toMatch(/from "\.\.\/routes\//);
    }
  });

  it("imports the provider SDK in the drafter only", () => {
    for (const [name, code] of Object.entries(sources)) {
      if (name === "drafter.ts") continue;
      expect(code, `${name} must not import the SDK`).not.toContain("@anthropic-ai/sdk");
    }
  });

  it("calls the provider from exactly one place, with no tools, no web access and no sampling settings", () => {
    const drafter = sources["drafter.ts"] ?? "";
    expect(drafter.split("messages.parse(").length - 1).toBe(1);
    for (const [name, code] of Object.entries(sources)) {
      expect(code, `${name} must not give the model tools`).not.toMatch(/\btools\s*:|tool_choice|web_search|web_fetch|code_execution|mcp_servers/);
      expect(code, `${name} must not set sampling`).not.toMatch(/\btemperature\b|\btop_p\b|\btop_k\b/);
    }
  });

  it.each([
    ["console output", /\bconsole\./],
    ["a direct read of process.env", /process\.env/],
    ["a bare fetch call", /(?<![A-Za-z.])fetch\(/],
    ["the file system", /node:fs/],
    ["the clock", /\bnew Date\(|Date\.now/],
    ["randomness", /Math\.random|randomUUID/],
    ["a timer", /\bset(Timeout|Interval)\(/],
  ])("contains no %s", (_label, pattern) => {
    for (const [name, code] of Object.entries(sources)) {
      expect(code, `${name} matches ${pattern}`).not.toMatch(pattern);
    }
  });
});
