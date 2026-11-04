import type { Decision, Violation } from "./decision.ts";
import { formatUsd } from "./money.ts";

// Explanations are fixed templates filled with validated values. No AI text
// is involved, so the same decision always produces the same explanation.

function money(minor: number | undefined): string {
  return minor === undefined ? "an unknown amount" : formatUsd(minor);
}

function count(value: number | undefined): string {
  return value === undefined ? "an unknown number" : String(value);
}

export function explainViolation(violation: Violation): string {
  const product = violation.productId ?? "an unknown product";
  switch (violation.code) {
    case "MANDATE_INVALID":
      return "The mandate is missing or invalid, so the purchase could not be checked.";
    case "PROPOSAL_INVALID":
      return "The proposed purchase is missing or invalid, so it could not be checked.";
    case "OBSERVATION_INVALID":
      return "The payment details reported by PayPal were missing or invalid, so they could not be checked.";
    case "CLOCK_INVALID":
      return "The current time was not valid, so the mandate's expiry could not be checked.";
    case "MANDATE_MISMATCH":
      return "The purchase refers to a different mandate than the one that was confirmed.";
    case "MANDATE_REVOKED":
      return "The mandate has been revoked.";
    case "MANDATE_EXPIRED":
      return "The mandate has expired.";
    case "CURRENCY_MISMATCH":
      return "The purchase currency does not match the mandate currency (USD).";
    case "EMPTY_PURCHASE":
      return "The purchase contains no items.";
    case "PRODUCT_NOT_ALLOWED":
      return `Product ${product} is not allowed by the mandate.`;
    case "VARIANT_NOT_ALLOWED":
      return violation.variantId === undefined
        ? `Product ${product} requires one of the allowed variants, but no variant was given.`
        : `Variant ${violation.variantId} of product ${product} is not allowed by the mandate.`;
    case "UNIT_PRICE_EXCEEDED":
      return `The unit price of product ${product} is ${money(violation.actual)}, above the limit of ${money(violation.limit)}.`;
    case "QUANTITY_EXCEEDED":
      return `The total quantity of product ${product} is ${count(violation.actual)}, above the limit of ${count(violation.limit)}.`;
    case "AMOUNT_OVERFLOW":
      return "The purchase total is too large to be calculated safely.";
    case "TOTAL_EXCEEDED":
      return `The purchase total of ${money(violation.actual)} is above the mandate limit of ${money(violation.limit)}.`;
    case "TOTAL_MISMATCH":
      return `The declared total of ${money(violation.actual)} does not match the calculated total of ${money(violation.expected)}.`;
    case "OBSERVED_AMOUNT_MISMATCH":
      return `PayPal reports an amount of ${money(violation.actual)}, but the calculated purchase total is ${money(violation.expected)}.`;
    case "OBSERVED_CURRENCY_MISMATCH":
      return "The currency PayPal reports does not match the mandate currency (USD).";
    case "BINDING_MISMATCH":
      return "The payment is not bound to the confirmed mandate: the reference stored with the payment does not match the mandate's hash.";
    case "MANDATE_HASH_MISMATCH":
      return "The stored mandate no longer matches the hash it was confirmed with, so it cannot be trusted.";
    default: {
      const unhandled: never = violation.code;
      return String(unhandled);
    }
  }
}

export function explainDecision(decision: Decision): readonly string[] {
  if (decision.decision === "allow") {
    return [`All purchase rules passed. The total is ${formatUsd(decision.computedTotalMinor)}.`];
  }
  if (decision.violations.length === 0) {
    return ["The purchase was blocked."];
  }
  return decision.violations.map(explainViolation);
}
