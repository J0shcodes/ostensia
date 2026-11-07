import type { ConfirmedMandate, MandateTerms } from "@ostensia/domain";
import { describe, expect, it } from "vitest";
import { findMatchingMandates } from "./mandate-match.ts";

const terms: MandateTerms = {
  currency: "USD",
  maxTotalMinor: 500,
  expiresAt: "2030-01-15T17:00:00.000Z",
  items: [{ productId: "sticker-pack", allowedVariantIds: ["matte"], maxQuantity: 2, maxUnitPriceMinor: 150 }],
};

function mandate(over: Partial<ConfirmedMandate> = {}): ConfirmedMandate {
  return {
    id: "m-1",
    version: 1,
    terms,
    intentSummary: "Two matte sticker packs",
    confirmedAt: "2026-11-06T10:00:00.000Z",
    status: "confirmed",
    hash: "a".repeat(64),
    ...over,
  };
}

describe("findMatchingMandates", () => {
  it("finds a mandate with exactly these terms and this summary", () => {
    const found = findMatchingMandates([mandate()], terms, "Two matte sticker packs");
    expect(found.map((m) => m.id)).toEqual(["m-1"]);
  });

  it("does not depend on key order", () => {
    const reordered: MandateTerms = {
      items: [{ maxUnitPriceMinor: 150, maxQuantity: 2, allowedVariantIds: ["matte"], productId: "sticker-pack" }],
      expiresAt: terms.expiresAt,
      maxTotalMinor: 500,
      currency: "USD",
    };
    expect(findMatchingMandates([mandate()], reordered, "Two matte sticker packs")).toHaveLength(1);
  });

  it("finds every match, in the order given", () => {
    const found = findMatchingMandates([mandate({ id: "m-1" }), mandate({ id: "m-2" })], terms, "Two matte sticker packs");
    expect(found.map((m) => m.id)).toEqual(["m-1", "m-2"]);
  });

  it("ignores a revoked mandate: it can no longer be used", () => {
    expect(findMatchingMandates([mandate({ status: "revoked" })], terms, "Two matte sticker packs")).toEqual([]);
  });

  it("ignores a different summary", () => {
    expect(findMatchingMandates([mandate()], terms, "Something else")).toEqual([]);
  });

  it.each([
    ["total", { ...terms, maxTotalMinor: 501 }],
    ["expiry", { ...terms, expiresAt: "2030-01-15T17:00:01.000Z" }],
    ["quantity", { ...terms, items: [{ ...terms.items[0]!, maxQuantity: 3 }] }],
    ["price", { ...terms, items: [{ ...terms.items[0]!, maxUnitPriceMinor: 151 }] }],
    ["variants", { ...terms, items: [{ ...terms.items[0]!, allowedVariantIds: ["gloss"] }] }],
    ["product", { ...terms, items: [{ ...terms.items[0]!, productId: "enamel-pin" }] }],
  ])("does not match when the %s differs", (_name, other) => {
    expect(findMatchingMandates([mandate()], other as MandateTerms, "Two matte sticker packs")).toEqual([]);
  });

  it("does not match a mandate with no variant restriction against one with a restriction", () => {
    const { allowedVariantIds: _omit, ...openItem } = terms.items[0]!;
    const open: MandateTerms = { ...terms, items: [openItem] };
    expect(findMatchingMandates([mandate()], open, "Two matte sticker packs")).toEqual([]);
  });

  it("returns nothing for an empty list", () => {
    expect(findMatchingMandates([], terms, "x")).toEqual([]);
  });
});
