import { describe, expect, it } from "vitest";
import { completeDraft } from "./draft.ts";
import { MandateDraftSchema, MandateTermsSchema } from "./mandate.ts";
import type { MandateDraft } from "./mandate.ts";

const FULL: MandateDraft = {
  intentSummary: "Two matte sticker packs and one pin, up to $5 in total.",
  currency: "USD",
  maxTotalMinor: 500,
  expiresAt: "2026-11-12T23:59:59.000Z",
  items: [
    { productId: "sticker-pack", allowedVariantIds: ["matte"], maxQuantity: 2, maxUnitPriceMinor: 150 },
    { productId: "enamel-pin", maxQuantity: 1, maxUnitPriceMinor: 300 },
  ],
  notes: ["The deadline was given as a date only; the end of that day was used."],
};

const copy = (): any => JSON.parse(JSON.stringify(FULL));

function incomplete(input: unknown) {
  const result = completeDraft(input);
  if (result.kind !== "incomplete") throw new Error(`expected incomplete, got ${result.kind}`);
  return result;
}

describe("completeDraft", () => {
  it("returns exactly the terms the draft held when everything is present", () => {
    const result = completeDraft(FULL);
    expect(result).toEqual({
      kind: "complete",
      terms: {
        currency: "USD",
        maxTotalMinor: 500,
        expiresAt: "2026-11-12T23:59:59.000Z",
        items: [
          { productId: "sticker-pack", allowedVariantIds: ["matte"], maxQuantity: 2, maxUnitPriceMinor: 150 },
          { productId: "enamel-pin", maxQuantity: 1, maxUnitPriceMinor: 300 },
        ],
      },
    });
  });

  it("produces terms that the confirmed-mandate rules accept", () => {
    const result = completeDraft(FULL);
    if (result.kind !== "complete") throw new Error("expected complete");
    expect(MandateTermsSchema.safeParse(result.terms).success).toBe(true);
  });

  it("does not add a key for an omitted allowedVariantIds", () => {
    const result = completeDraft(FULL);
    if (result.kind !== "complete") throw new Error("expected complete");
    expect("allowedVariantIds" in (result.terms.items[1] as object)).toBe(false);
  });

  it("ignores the summary and the notes", () => {
    const changed = { ...copy(), intentSummary: "", notes: [] };
    expect(completeDraft(changed).kind).toBe("complete");
  });

  describe("a missing field is reported and never filled in", () => {
    it.each([
      ["currency", (d: any) => (d.currency = null), "currency"],
      ["maxTotalMinor", (d: any) => (d.maxTotalMinor = null), "maxTotalMinor"],
      ["expiresAt", (d: any) => (d.expiresAt = null), "expiresAt"],
      ["no items", (d: any) => (d.items = []), "items"],
      ["an item productId", (d: any) => (d.items[1].productId = null), "items[1].productId"],
      ["an item maxQuantity", (d: any) => (d.items[0].maxQuantity = null), "items[0].maxQuantity"],
      ["an item maxUnitPriceMinor", (d: any) => (d.items[1].maxUnitPriceMinor = null), "items[1].maxUnitPriceMinor"],
    ])("%s", (_name, change, path) => {
      const draft = copy();
      change(draft);
      const result = incomplete(draft);
      expect(result.missing).toEqual([path]);
      expect(result.problems).toEqual([]);
    });

    it("lists every gap at once, in a fixed order", () => {
      const draft = copy();
      draft.currency = null;
      draft.expiresAt = null;
      draft.items[0].maxQuantity = null;
      draft.items[1].productId = null;
      expect(incomplete(draft).missing).toEqual(["currency", "expiresAt", "items[0].maxQuantity", "items[1].productId"]);
    });

    it("reports a draft with nothing filled in as all missing, with no defaults", () => {
      const empty = { intentSummary: "Something nice", currency: null, maxTotalMinor: null, items: [], expiresAt: null, notes: [] };
      const result = incomplete(empty);
      expect(result.missing).toEqual(["currency", "maxTotalMinor", "expiresAt", "items"]);
      expect(result.problems).toEqual([]);
    });
  });

  describe("a present value that is not acceptable is a problem, not a gap", () => {
    it.each([
      ["a non-date expiry", (d: any) => (d.expiresAt = "tomorrow"), "expiresAt"],
      ["an expiry with an offset", (d: any) => (d.expiresAt = "2026-11-12T00:00:00+01:00"), "expiresAt"],
      ["a total of zero", (d: any) => (d.maxTotalMinor = 0), "maxTotalMinor"],
      ["a quantity of zero", (d: any) => (d.items[0].maxQuantity = 0), "items[0].maxQuantity"],
      ["a unit price of zero", (d: any) => (d.items[1].maxUnitPriceMinor = 0), "items[1].maxUnitPriceMinor"],
      ["an id with a space", (d: any) => (d.items[0].productId = "sticker pack"), "items[0].productId"],
      ["an empty variant list", (d: any) => (d.items[0].allowedVariantIds = []), "items[0].allowedVariantIds"],
      ["duplicate products", (d: any) => (d.items[1].productId = "sticker-pack"), "items"],
    ])("%s", (_name, change, path) => {
      const draft = copy();
      change(draft);
      const result = incomplete(draft);
      expect(result.missing).toEqual([]);
      expect(result.problems).toHaveLength(1);
      expect(result.problems[0]?.startsWith(`${path}:`)).toBe(true);
    });

    it("reports a gap and a problem together", () => {
      const draft = copy();
      draft.currency = null;
      draft.expiresAt = "tomorrow";
      const result = incomplete(draft);
      expect(result.missing).toEqual(["currency"]);
      expect(result.problems).toHaveLength(1);
      expect(result.problems[0]?.startsWith("expiresAt:")).toBe(true);
    });
  });

  describe("an input that is not a draft", () => {
    it.each([
      ["null", null],
      ["a string", "hello"],
      ["an array", []],
      ["an empty object", {}],
      ["an unknown key", { ...FULL, extra: 1 }],
      ["a EUR currency", { ...FULL, currency: "EUR" }],
      ["a string total", { ...FULL, maxTotalMinor: "500" }],
      ["a fractional total", { ...FULL, maxTotalMinor: 5.5 }],
      ["an unknown key in an item", { ...FULL, items: [{ ...FULL.items[0], extra: 1 }] }],
    ])("%s is invalid", (_name, input) => {
      expect(completeDraft(input)).toEqual({ kind: "invalid" });
    });
  });

  describe("properties", () => {
    it("is complete exactly when no field is null and the terms are valid", () => {
      // Null out every subset of the seven fields of a two-item draft.
      const setters: ((d: any) => void)[] = [
        (d) => (d.currency = null),
        (d) => (d.maxTotalMinor = null),
        (d) => (d.expiresAt = null),
        (d) => (d.items[0].productId = null),
        (d) => (d.items[0].maxQuantity = null),
        (d) => (d.items[1].maxUnitPriceMinor = null),
      ];
      for (let mask = 0; mask < 1 << setters.length; mask++) {
        const draft = copy();
        setters.forEach((set, bit) => {
          if (mask & (1 << bit)) set(draft);
        });
        const result = completeDraft(draft);
        expect(result.kind).toBe(mask === 0 ? "complete" : "incomplete");
        if (result.kind === "incomplete") expect(result.missing).toHaveLength(popcount(mask));
      }
    });

    it("is deterministic and does not change its input", () => {
      const draft = copy();
      const before = JSON.stringify(draft);
      draft.expiresAt = null;
      const once = completeDraft(draft);
      expect(completeDraft(draft)).toEqual(once);
      expect(JSON.stringify(draft)).toBe(before.replace('"2026-11-12T23:59:59.000Z"', "null"));
      expect(MandateDraftSchema.safeParse(draft).success).toBe(true);
    });
  });
});

function popcount(mask: number): number {
  let count = 0;
  for (let rest = mask; rest > 0; rest >>= 1) count += rest & 1;
  return count;
}
