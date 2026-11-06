import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Structural rules for the web app, checked by reading its source, in the same way the
// API's boundary tests do. They turn D-027 (the browser reaches the API only through the
// Next.js rewrite), D-028 (the domain import is narrow) and CLAUDE.md sections 7 and 8
// into checks that keep passing as the code changes.

const WEB = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(WEB, "..", "..");

function walk(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...walk(path));
    else found.push(path);
  }
  return found;
}

const rel = (path: string): string => relative(WEB, path).split(sep).join("/");
const isTest = (path: string): boolean => /\.test\.tsx?$/.test(path);
const isCode = (path: string): boolean => /\.(ts|tsx)$/.test(path) && !isTest(path) && !path.endsWith("next-env.d.ts");

// Comments say why; they are not behaviour. Whole-line comments and block comments are
// removed so a rule is checked against code and strings only.
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
}

const ALL = walk(WEB);
const CODE = ALL.filter(isCode);
const CLIENT = CODE.filter((path) => /^(app|components|lib)\//.test(rel(path)));
const CSS = ALL.filter((path) => path.endsWith(".css"));
const read = (path: string): string => readFileSync(path, "utf8");
const code = (path: string): string => stripComments(read(path));

describe("the web app reaches the API only through the rewrite (D-027)", () => {
  it("finds the source it is meant to scan", () => {
    expect(CLIENT.length).toBeGreaterThan(10);
    expect(CODE.some((path) => rel(path) === "next.config.ts")).toBe(true);
    expect(CSS.length).toBeGreaterThan(5);
  });

  it("uses no NEXT_PUBLIC_ variable anywhere", () => {
    for (const path of CODE) expect(code(path), rel(path)).not.toContain("NEXT_PUBLIC_");
    const env = read(join(WEB, ".env.example"))
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");
    expect(env).not.toContain("NEXT_PUBLIC_");
    expect(env).toMatch(/^API_ORIGIN=http:\/\/127\.0\.0\.1:[0-9]+$/m);
  });

  it("puts no absolute URL in code the browser runs", () => {
    for (const path of CLIENT) expect(code(path), rel(path)).not.toMatch(/https?:\/\//);
  });

  it("reads process.env only in next.config.ts", () => {
    for (const path of CODE) {
      const text = code(path);
      if (rel(path) === "next.config.ts") expect(text).toContain('process.env["API_ORIGIN"]');
      else expect(text, rel(path)).not.toContain("process.env");
    }
  });

  it("calls fetch only in lib/api.ts, and uses no other way to reach a server", () => {
    for (const path of CODE) {
      const text = code(path);
      if (rel(path) !== "lib/api.ts") expect(text, rel(path)).not.toMatch(/\bfetch\s*\(/);
      expect(text, rel(path)).not.toMatch(/XMLHttpRequest|WebSocket|EventSource|sendBeacon|axios/);
    }
  });

  it("calls only same-origin /api paths", () => {
    const api = code(join(WEB, "lib", "api.ts"));
    expect(api).toContain('const API_BASE = "/api"');
    expect(api).toContain("`${API_BASE}${path}`");
  });

  it("forwards /api to the validated origin, with a proxy timeout above Next.js's 30 s default", () => {
    const config = code(join(WEB, "next.config.ts"));
    expect(config).toContain('source: "/api/:path*"');
    expect(config).toContain("destination: `${apiOrigin}/:path*`");
    expect(config).toContain("parseApiOrigin(process.env");
    const timeout = /const PROXY_TIMEOUT_MS = ([0-9_]+);/.exec(config);
    expect(timeout).not.toBeNull();
    expect(Number((timeout?.[1] ?? "0").replaceAll("_", ""))).toBeGreaterThan(30_000);
    expect(config).toMatch(/experimental:\s*\{\s*proxyTimeout:\s*PROXY_TIMEOUT_MS\s*\}/);
  });

  it("adds no CORS support to the API or to this app", () => {
    const webPackage = read(join(WEB, "package.json"));
    const apiPackage = read(join(REPO, "apps", "api", "package.json"));
    expect(webPackage.toLowerCase()).not.toMatch(/cors/);
    expect(apiPackage.toLowerCase()).not.toMatch(/cors/);
    for (const path of walk(join(REPO, "apps", "api", "src")).filter((file) => /\.ts$/.test(file) && !isTest(file))) {
      expect(read(path), path).not.toMatch(/access-control-|@fastify\/cors/i);
    }
  });

  it("never imports from the API", () => {
    for (const path of CODE) {
      expect(code(path), rel(path)).not.toMatch(/from\s+["'][^"']*(apps\/api|@ostensia\/api)/);
      expect(code(path), rel(path)).not.toMatch(/from\s+["']\.\.\/(\.\.\/)*api\//);
    }
  });
});

describe("the domain import is narrow (D-028, D1)", () => {
  // The only values the web app takes from @ostensia/domain at run time. Types are free:
  // they are erased and add nothing to the browser bundle.
  const ALLOWED = new Set(["MandateTermsSchema", "ConfirmedMandateSchema", "formatUsd", "canonicalize"]);

  it("imports only the allowed values", () => {
    const found = new Set<string>();
    for (const path of CODE) {
      for (const match of code(path).matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+["']@ostensia\/domain["']/g)) {
        if (match[1] !== undefined) continue;
        for (const name of (match[2] ?? "").split(",")) {
          const clean = name.trim();
          if (clean === "") continue;
          expect(clean.startsWith("type "), `${rel(path)} imports ${clean}`).toBe(false);
          found.add(clean);
        }
      }
    }
    expect([...found].filter((name) => !ALLOWED.has(name))).toEqual([]);
    // If the scan stops finding the imports it was written for, it is not checking.
    expect([...found].sort()).toEqual([...ALLOWED].sort());
  });

  it("uses no other import style for the domain package", () => {
    for (const path of CODE) {
      const text = code(path);
      expect(text, rel(path)).not.toMatch(/import\s+\*\s+as\s+\w+\s+from\s+["']@ostensia\/domain/);
      expect(text, rel(path)).not.toMatch(/import\s+\w+\s+from\s+["']@ostensia\/domain/);
      expect(text, rel(path)).not.toMatch(/@ostensia\/domain\//);
      expect(text, rel(path)).not.toMatch(/require\(/);
    }
  });
});

describe("the dependencies are pinned and none is added without approval", () => {
  const manifest = JSON.parse(read(join(WEB, "package.json"))) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };

  it("pins every version exactly", () => {
    for (const [name, version] of Object.entries({ ...manifest.dependencies, ...manifest.devDependencies })) {
      expect(version, name).toMatch(/^(workspace:\*|[0-9]+\.[0-9]+\.[0-9]+)$/);
    }
  });

  it("holds exactly the approved packages", () => {
    expect(Object.keys(manifest.dependencies).sort()).toEqual(["@ostensia/domain", "next", "react", "react-dom"]);
    expect(Object.keys(manifest.devDependencies).sort()).toEqual(["@types/node", "@types/react", "@types/react-dom"]);
    expect(manifest.dependencies["next"]).toBe("16.4.5");
    expect(manifest.dependencies["react"]).toBe("19.3.1");
    expect(manifest.dependencies["react-dom"]).toBe("19.3.1");
  });
});

describe("safe rendering and honest interface (CLAUDE.md sections 7 and 8)", () => {
  it("never inserts raw HTML or evaluates text", () => {
    for (const path of CODE) {
      expect(code(path), rel(path)).not.toMatch(/dangerouslySetInnerHTML|innerHTML|\beval\s*\(|new Function\s*\(/);
    }
  });

  it("does not mention PayPal: confirming a mandate makes no PayPal call", () => {
    for (const path of CLIENT) expect(code(path), rel(path)).not.toMatch(/paypal/i);
  });

  it("stores nothing in the browser", () => {
    for (const path of CLIENT) expect(code(path), rel(path)).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
  });
});

describe("styles follow the guidelines (docs/design/OSTENSIA_BRAND_GUIDELINES.md section 11)", () => {
  it("uses no raw colour outside globals.css", () => {
    for (const path of CSS.filter((file) => rel(file) !== "app/globals.css")) {
      expect(read(path), rel(path)).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
    }
    for (const path of CODE.filter((file) => file.endsWith(".tsx"))) {
      expect(code(path), rel(path)).not.toMatch(/#[0-9a-fA-F]{6}\b|\brgba?\(|\bhsla?\(/);
    }
  });

  it("sets typefaces only from the font variables", () => {
    for (const path of CSS) {
      for (const match of read(path).matchAll(/font-family:\s*([^;]+);/g)) {
        expect(match[1], rel(path)).toMatch(/var\(--font-(sans|mono)\)/);
      }
    }
  });

  it("uses plain CSS only: no Tailwind, no component or icon library, no extra stylesheet loader", () => {
    expect(existsSync(join(WEB, "tailwind.config.ts"))).toBe(false);
    expect(existsSync(join(WEB, "tailwind.config.js"))).toBe(false);
    expect(existsSync(join(WEB, "postcss.config.mjs"))).toBe(false);
    expect(existsSync(join(WEB, "postcss.config.js"))).toBe(false);
    expect(ALL.filter((path) => /\.(scss|sass|less|styl)$/.test(path))).toEqual([]);
  });

  it("gives every stylesheet except globals.css the .module.css suffix", () => {
    for (const path of CSS) {
      if (rel(path) === "app/globals.css") continue;
      expect(rel(path), "component styles are CSS Modules").toMatch(/\.module\.css$/);
    }
  });
});
