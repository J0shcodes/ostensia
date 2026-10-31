import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The domain package must stay free of I/O and of anything that reads the
// clock or randomness (D-006). TypeScript already keeps Node types out of it,
// and this test also checks the source text. It lives here because the domain
// package deliberately has no Node types.

const DOMAIN_SRC = new URL("../../../packages/domain/src/", import.meta.url);
const ALLOWED_PACKAGES = new Set(["zod"]);

const FORBIDDEN: readonly [string, RegExp][] = [
  ["process", /\bprocess\b/],
  ["Date.now()", /\bDate\.now\s*\(/],
  ["new Date()", /\bnew\s+Date\s*\(\s*\)/],
  ["Math.random()", /\bMath\.random\s*\(/],
  ["fetch()", /\bfetch\s*\(/],
  ["require()", /\brequire\s*\(/],
  ["console", /\bconsole\./],
  ["setTimeout/setInterval", /\bset(?:Timeout|Interval)\s*\(/],
];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function findProblems(source: string): string[] {
  const code = stripComments(source);
  const problems: string[] = [];
  for (const match of code.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/g)) {
    const specifier = match[1] as string;
    if (!specifier.startsWith("./") && !ALLOWED_PACKAGES.has(specifier)) {
      problems.push(`imports "${specifier}"`);
    }
  }
  for (const [name, pattern] of FORBIDDEN) {
    if (pattern.test(code)) problems.push(`uses ${name}`);
  }
  return problems;
}

function domainSourceFiles(): string[] {
  return readdirSync(DOMAIN_SRC).filter(
    (name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && name !== "test-fixtures.ts",
  );
}

describe("domain purity scan", () => {
  it("flags what it is meant to catch", () => {
    expect(findProblems('import fs from "node:fs";')).toEqual(['imports "node:fs"']);
    expect(findProblems('import { x } from "fastify";')).toEqual(['imports "fastify"']);
    expect(findProblems('const m = await import("node:crypto");')).toEqual(['imports "node:crypto"']);
    expect(findProblems("const t = Date.now();")).toEqual(["uses Date.now()"]);
    expect(findProblems("const d = new Date();")).toEqual(["uses new Date()"]);
    expect(findProblems("const r = Math.random();")).toEqual(["uses Math.random()"]);
    expect(findProblems("const e = process.env;")).toEqual(["uses process"]);
    expect(findProblems("await fetch(url);")).toEqual(["uses fetch()"]);
  });

  it("allows what the domain legitimately uses", () => {
    expect(findProblems('import { z } from "zod";\nimport type { A } from "./a.ts";')).toEqual([]);
    expect(findProblems("const d = new Date(0); // not now()")).toEqual([]);
    expect(findProblems("// uses process and Date.now() only in this comment")).toEqual([]);
  });

  it("finds no problems in the domain sources", () => {
    const files = domainSourceFiles();
    // Guards against the scan passing because it found no files.
    expect(files.length).toBeGreaterThanOrEqual(9);
    for (const name of files) {
      const source = readFileSync(new URL(name, DOMAIN_SRC), "utf8");
      expect(findProblems(source), name).toEqual([]);
    }
  });
});
