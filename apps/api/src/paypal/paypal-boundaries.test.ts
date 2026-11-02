import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Boundary scan of the adapter source, like domain-purity.test.ts does for the
// domain. It reads the production files only (not tests or test helpers) and
// ignores comment lines. It guards what this increment promised: no authorize,
// capture or void call, no stored_credential, only the sandbox host, and no
// logging.

const DIRECTORY = new URL("./", import.meta.url);

function productionSources(): { name: string; code: string }[] {
  return readdirSync(DIRECTORY)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && name !== "test-support.ts")
    .map((name) => ({
      name,
      code: readFileSync(new URL(name, DIRECTORY), "utf8")
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n"),
    }));
}

describe("PayPal adapter source boundaries", () => {
  const sources = productionSources();

  it("finds the files it is meant to scan", () => {
    expect(sources.map((source) => source.name).sort()).toEqual([
      "adapter.ts",
      "amount.ts",
      "http.ts",
      "paypal-config.ts",
      "request-id.ts",
      "responses.ts",
      "token.ts",
    ]);
  });

  it.each([
    ["an authorize, capture or void path", /\/(authorize|capture|void)\b/],
    ["stored_credential", /stored_credential/],
    ["a URL other than the sandbox host", /https?:\/\/(?!api-m\.sandbox\.paypal\.com)/],
    ["console output", /\bconsole\./],
    ["a direct read of process.env", /process\.env/],
    ["a bare fetch call outside http.ts", /(?<![A-Za-z.])fetch\(/],
  ])("contains no %s", (_label, pattern) => {
    for (const { name, code } of sources) {
      if (name === "http.ts" && pattern.source.includes("fetch")) continue;
      expect(code, `${name} matches ${pattern}`).not.toMatch(pattern);
    }
  });

  it("builds only the endpoints E-1 used", () => {
    const paths = sources.flatMap(({ code }) => [...code.matchAll(/["`](\/v[0-9]\/[^"`]*)["`]/g)].map((match) => match[1]));
    expect([...new Set(paths)].sort()).toEqual([
      "/v1/oauth2/token",
      "/v2/checkout/orders",
      "/v2/checkout/orders/${id}",
      "/v2/payments/authorizations/${id}",
      "/v3/vault/payment-tokens/${config.vaultId}",
    ]);
  });
});
