import { describe, expect, it } from "vitest";
import { MAX_LINES_PER_PURCHASE, MAX_QUANTITY } from "./primitives.ts";
import { PurchaseProposalSchema } from "./purchase.ts";
import { makeProposal } from "./test-fixtures.ts";

function mutated(change: (proposal: any) => void): unknown {
  const proposal = JSON.parse(JSON.stringify(makeProposal()));
  change(proposal);
  return proposal;
}

describe("PurchaseProposalSchema", () => {
  it("accepts a valid proposal and keeps it unchanged", () => {
    const result = PurchaseProposalSchema.safeParse(makeProposal());
    expect(result.success).toBe(true);
    expect(result.data).toEqual(makeProposal());
  });

  it("accepts an empty cart and a wrong currency, so they reach the policy rules", () => {
    expect(PurchaseProposalSchema.safeParse(makeProposal({ lines: [], declaredTotalMinor: 0 })).success).toBe(true);
    expect(PurchaseProposalSchema.safeParse(makeProposal({ currency: "EUR" })).success).toBe(true);
  });

  it("accepts a zero unit price and the maximum quantity", () => {
    const lines = [{ productId: "gloves", quantity: MAX_QUANTITY, unitPriceMinor: 0 }];
    expect(PurchaseProposalSchema.safeParse(makeProposal({ lines })).success).toBe(true);
  });

  it.each([
    ["an unknown key", (p: any) => (p.extra = 1)],
    ["an unknown key in a line", (p: any) => (p.lines[0].extra = 1)],
    ["a missing mandateId", (p: any) => delete p.mandateId],
    ["an empty currency", (p: any) => (p.currency = "")],
    ["a numeric currency", (p: any) => (p.currency = 840)],
    ["a negative declared total", (p: any) => (p.declaredTotalMinor = -1)],
    ["a fractional declared total", (p: any) => (p.declaredTotalMinor = 95.5)],
    ["a string declared total", (p: any) => (p.declaredTotalMinor = "9500")],
    ["quantity 0", (p: any) => (p.lines[0].quantity = 0)],
    ["a negative quantity", (p: any) => (p.lines[0].quantity = -1)],
    ["a fractional quantity", (p: any) => (p.lines[0].quantity = 1.5)],
    ["a quantity above the bound", (p: any) => (p.lines[0].quantity = MAX_QUANTITY + 1)],
    ["a negative unit price", (p: any) => (p.lines[0].unitPriceMinor = -1)],
    ["a fractional unit price", (p: any) => (p.lines[0].unitPriceMinor = 75.5)],
    ["an unsafe unit price", (p: any) => (p.lines[0].unitPriceMinor = Number.MAX_SAFE_INTEGER + 1)],
    ["a productId with a space", (p: any) => (p.lines[0].productId = "rain jacket")],
    ["an empty variantId", (p: any) => (p.lines[0].variantId = "")],
    ["lines that are not an array", (p: any) => (p.lines = "none")],
    ["too many lines", (p: any) => (p.lines = Array.from({ length: MAX_LINES_PER_PURCHASE + 1 }, () => p.lines[0]))],
  ])("rejects %s", (_name, change) => {
    expect(PurchaseProposalSchema.safeParse(mutated(change)).success).toBe(false);
  });
});
