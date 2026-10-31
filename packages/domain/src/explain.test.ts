import { describe, expect, it } from "vitest";
import { VIOLATION_CODES } from "./decision.ts";
import type { Decision, Violation } from "./decision.ts";
import { explainDecision, explainViolation } from "./explain.ts";

describe("explainViolation", () => {
  it.each(VIOLATION_CODES)("explains %s even when no detail is given", (code) => {
    const text = explainViolation({ code });
    expect(text.length).toBeGreaterThan(10);
    expect(text).not.toMatch(/undefined|NaN|\[object/);
  });

  it.each<[Violation, string]>([
    [{ code: "MANDATE_INVALID" }, "The mandate is missing or invalid, so the purchase could not be checked."],
    [{ code: "MANDATE_REVOKED" }, "The mandate has been revoked."],
    [{ code: "MANDATE_EXPIRED" }, "The mandate has expired."],
    [{ code: "PRODUCT_NOT_ALLOWED", productId: "hat" }, "Product hat is not allowed by the mandate."],
    [
      { code: "VARIANT_NOT_ALLOWED", productId: "jacket", variantId: "jacket-xl" },
      "Variant jacket-xl of product jacket is not allowed by the mandate.",
    ],
    [
      { code: "VARIANT_NOT_ALLOWED", productId: "jacket" },
      "Product jacket requires one of the allowed variants, but no variant was given.",
    ],
    [
      { code: "UNIT_PRICE_EXCEEDED", productId: "jacket", limit: 7499, actual: 7500 },
      "The unit price of product jacket is $75.00, above the limit of $74.99.",
    ],
    [
      { code: "QUANTITY_EXCEEDED", productId: "jacket", limit: 2, actual: 3 },
      "The total quantity of product jacket is 3, above the limit of 2.",
    ],
    [
      { code: "TOTAL_EXCEEDED", limit: 9499, actual: 9500 },
      "The purchase total of $95.00 is above the mandate limit of $94.99.",
    ],
    [
      { code: "TOTAL_MISMATCH", expected: 9500, actual: 100 },
      "The declared total of $1.00 does not match the calculated total of $95.00.",
    ],
    [
      { code: "OBSERVATION_INVALID" },
      "The payment details reported by PayPal were missing or invalid, so they could not be checked.",
    ],
    [
      { code: "OBSERVED_AMOUNT_MISMATCH", expected: 9500, actual: 9501 },
      "PayPal reports an amount of $95.01, but the calculated purchase total is $95.00.",
    ],
    [
      { code: "OBSERVED_CURRENCY_MISMATCH" },
      "The currency PayPal reports does not match the mandate currency (USD).",
    ],
    [
      { code: "BINDING_MISMATCH" },
      "The payment is not bound to the confirmed mandate: the reference stored with the payment does not match the mandate's hash.",
    ],
  ])("writes the expected text for %j", (violation, expected) => {
    expect(explainViolation(violation)).toBe(expected);
  });

  it("is deterministic", () => {
    const violation: Violation = { code: "TOTAL_EXCEEDED", limit: 100, actual: 200 };
    expect(explainViolation(violation)).toBe(explainViolation({ ...violation }));
  });
});

describe("explainDecision", () => {
  it("explains an allow decision with the total", () => {
    const decision: Decision = { decision: "allow", computedTotalMinor: 9500 };
    expect(explainDecision(decision)).toEqual(["All purchase rules passed. The total is $95.00."]);
  });

  it("explains every violation of a block decision, in order", () => {
    const decision: Decision = {
      decision: "block",
      violations: [{ code: "MANDATE_REVOKED" }, { code: "MANDATE_EXPIRED" }],
    };
    expect(explainDecision(decision)).toEqual(["The mandate has been revoked.", "The mandate has expired."]);
  });

  it("still says the purchase was blocked when a block has no listed violation", () => {
    expect(explainDecision({ decision: "block", violations: [] })).toEqual(["The purchase was blocked."]);
  });
});
