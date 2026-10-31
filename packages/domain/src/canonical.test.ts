import { describe, expect, it } from "vitest";
import { CanonicalizationError, canonicalMandateBinding, canonicalize } from "./canonical.ts";
import { baseTerms, makeMandate } from "./test-fixtures.ts";

describe("canonicalize", () => {
  it("sorts object keys, whatever order they were built in", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalize({ a: 2, b: 1 })).toBe('{"a":2,"b":1}');
  });

  it("sorts keys at every nesting level and keeps array order", () => {
    expect(canonicalize({ z: [{ b: 1, a: 2 }, 3, "x"], a: { d: null, c: true } })).toBe(
      '{"a":{"c":true,"d":null},"z":[{"a":2,"b":1},3,"x"]}',
    );
  });

  it("gives array order meaning", () => {
    expect(canonicalize([1, 2])).not.toBe(canonicalize([2, 1]));
  });

  it("writes primitives", () => {
    expect(canonicalize(null)).toBe("null");
    expect(canonicalize(true)).toBe("true");
    expect(canonicalize(false)).toBe("false");
    expect(canonicalize(0)).toBe("0");
    expect(canonicalize(-5)).toBe("-5");
    expect(canonicalize(Number.MAX_SAFE_INTEGER)).toBe("9007199254740991");
    expect(canonicalize([])).toBe("[]");
    expect(canonicalize({})).toBe("{}");
  });

  it("keeps non-ASCII text as written", () => {
    expect(canonicalize({ b: "日本語", a: "é", e: "😀" })).toBe('{"a":"é","b":"日本語","e":"😀"}');
  });

  it("sorts keys by UTF-16 code unit, not by locale", () => {
    expect(canonicalize({ é: 1, z: 2 })).toBe('{"z":2,"é":1}');
  });

  it("does not normalise Unicode: the same text in two forms gives two strings", () => {
    const composed = "é";
    const decomposed = "é";
    expect(canonicalize(composed)).not.toBe(canonicalize(decomposed));
  });

  it("escapes quotes, backslashes and control characters", () => {
    expect(canonicalize('a"b\\c\n')).toBe('"a\\"b\\\\c\\n"');
  });

  it("writes a lone surrogate as an escape, the same way every time", () => {
    expect(canonicalize("\ud800")).toBe('"\\ud800"');
  });

  it("accepts objects with a null prototype", () => {
    const value = Object.create(null) as Record<string, unknown>;
    value["b"] = 1;
    value["a"] = 2;
    expect(canonicalize(value)).toBe('{"a":2,"b":1}');
  });

  it("treats a __proto__ key as ordinary data", () => {
    const value = JSON.parse('{"__proto__": 1, "a": 2}') as unknown;
    expect(canonicalize(value)).toBe('{"__proto__":1,"a":2}');
  });

  class Example {
    a = 1;
  }

  it.each([
    ["undefined", undefined],
    ["NaN", Number.NaN],
    ["Infinity", Infinity],
    ["a fraction", 1.5],
    ["an unsafe integer", 2 ** 53],
    ["a bigint", 10n],
    ["a symbol", Symbol("x")],
    ["a function", () => 1],
    ["a Date", new Date(0)],
    ["a Map", new Map()],
    ["a class instance", new Example()],
    ["an object with a non-plain prototype", Object.create({ inherited: 1 })],
    ["undefined inside an object", { a: undefined }],
    ["undefined inside an array", [1, undefined]],
    ["a hole in a sparse array", new Array(3)],
  ])("rejects %s", (_name, value) => {
    expect(() => canonicalize(value)).toThrow(CanonicalizationError);
  });

  it("allows nesting to depth 32 and rejects depth 33", () => {
    const nest = (levels: number): unknown => {
      let value: unknown = 1;
      for (let i = 0; i < levels; i++) value = [value];
      return value;
    };
    expect(() => canonicalize(nest(32))).not.toThrow();
    expect(() => canonicalize(nest(33))).toThrow(CanonicalizationError);
  });

  it("rejects a circular structure instead of looping", () => {
    const cycle: Record<string, unknown> = {};
    cycle["self"] = cycle;
    expect(() => canonicalize(cycle)).toThrow(CanonicalizationError);
  });
});

describe("canonicalMandateBinding", () => {
  // The expected string is written out by hand; keys are in sorted order and
  // arrays keep their order. The matching SHA-256 is pinned in
  // apps/api/src/mandate-hash.test.ts and was computed with sha256sum.
  const GOLDEN =
    '{"id":"mandate-1","terms":{"currency":"USD","expiresAt":"2026-11-02T00:00:00.000Z",' +
    '"items":[{"allowedVariantIds":["jacket-m","jacket-l"],"maxQuantity":2,"maxUnitPriceMinor":8000,"productId":"jacket"},' +
    '{"maxQuantity":3,"maxUnitPriceMinor":2500,"productId":"gloves"}],"maxTotalMinor":20000},"version":1}';

  it("matches the golden string for the fixture mandate", () => {
    expect(canonicalMandateBinding(makeMandate())).toBe(GOLDEN);
  });

  it("is not changed by the fields that are left out on purpose", () => {
    const original = canonicalMandateBinding(makeMandate());
    expect(canonicalMandateBinding(makeMandate({ status: "revoked" }))).toBe(original);
    expect(canonicalMandateBinding(makeMandate({ hash: "b".repeat(64) }))).toBe(original);
    expect(canonicalMandateBinding(makeMandate({ intentSummary: "Something else" }))).toBe(original);
    expect(canonicalMandateBinding(makeMandate({ confirmedAt: "2026-11-01T11:00:00.000Z" }))).toBe(original);
  });

  it("is changed by every enforced field", () => {
    const original = canonicalMandateBinding(makeMandate());
    const changes = [
      makeMandate({ id: "mandate-2" }),
      makeMandate({ terms: { ...baseTerms(), maxTotalMinor: 20001 } }),
      makeMandate({ terms: { ...baseTerms(), expiresAt: "2026-11-02T00:00:01.000Z" } }),
      makeMandate({ terms: { ...baseTerms(), items: baseTerms().items.slice(0, 1) } }),
      makeMandate({ terms: { ...baseTerms(), items: [...baseTerms().items].reverse() } }),
    ];
    for (const changed of changes) {
      expect(canonicalMandateBinding(changed)).not.toBe(original);
    }
  });

  it("gives the same string whatever key order the mandate was built with", () => {
    const mandate = makeMandate();
    const reordered = {
      version: mandate.version,
      terms: {
        items: mandate.terms.items.map((item) => Object.fromEntries(Object.entries(item).reverse())),
        expiresAt: mandate.terms.expiresAt,
        maxTotalMinor: mandate.terms.maxTotalMinor,
        currency: mandate.terms.currency,
      },
      id: mandate.id,
    } as unknown as typeof mandate;
    expect(canonicalMandateBinding(reordered)).toBe(canonicalMandateBinding(mandate));
  });

  it("refuses a mandate that has an explicit undefined value", () => {
    const mandate = makeMandate({
      terms: {
        ...baseTerms(),
        items: [{ productId: "gloves", maxQuantity: 1, maxUnitPriceMinor: 1, allowedVariantIds: undefined }],
      },
    });
    expect(() => canonicalMandateBinding(mandate)).toThrow(CanonicalizationError);
  });
});
