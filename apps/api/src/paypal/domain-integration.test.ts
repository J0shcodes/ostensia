import { finalEvaluatePurchase, nextPaymentAction } from "@ostensia/domain";
import type { ConfirmedMandate, PurchaseProposal } from "@ostensia/domain";
import { describe, expect, it } from "vitest";
import { createPayPalAdapter, toObservedPayment } from "./adapter.ts";
import { SYNTH, authorizationBody, createFakeFetch, jsonResponse, testConfig, tokenBody } from "./test-support.ts";

// Adapter snapshot -> toObservedPayment -> finalEvaluatePurchase ->
// nextPaymentAction: the path the gate will follow in Increment 5, with a fake
// PayPal that returns the E-1 response shape.

const NOW = new Date("2026-11-02T13:00:00.000Z");

const MANDATE: ConfirmedMandate = {
  id: "mandate-1",
  version: 1,
  terms: {
    currency: "USD",
    maxTotalMinor: 20000,
    expiresAt: "2026-11-03T00:00:00.000Z",
    items: [{ productId: "jacket", maxQuantity: 2, maxUnitPriceMinor: 8000 }],
  },
  intentSummary: "A jacket, up to $200",
  confirmedAt: "2026-11-02T10:00:00.000Z",
  status: "confirmed",
  hash: SYNTH.mandateHash,
};

const PROPOSAL: PurchaseProposal = {
  mandateId: "mandate-1",
  currency: "USD",
  declaredTotalMinor: 7200,
  lines: [{ productId: "jacket", quantity: 1, unitPriceMinor: 7200 }],
};

async function observe(overrides: Record<string, unknown>) {
  const fake = createFakeFetch();
  fake.on("POST", "/v1/oauth2/token", jsonResponse(200, tokenBody()));
  fake.on("GET", `/v2/payments/authorizations/${SYNTH.authorizationId}`, jsonResponse(200, authorizationBody(overrides)));
  const adapter = createPayPalAdapter({ config: testConfig(), fetch: fake.fetch, timeoutMs: 1000 });
  const result = await adapter.getAuthorization(SYNTH.authorizationId);
  if (result.kind !== "ok") throw new Error(`expected ok, got ${result.kind}`);
  return result.authorization;
}

function codes(decision: ReturnType<typeof finalEvaluatePurchase>): string[] {
  return decision.decision === "block" ? decision.violations.map((violation) => violation.code) : [];
}

describe("adapter output through the final evaluation and the payment-action rule", () => {
  it("allows and captures when amount, currency and custom_id all match", async () => {
    const authorization = await observe({});
    const decision = finalEvaluatePurchase(MANDATE, PROPOSAL, toObservedPayment(authorization), NOW);
    expect(decision).toEqual({ decision: "allow", computedTotalMinor: 7200 });
    expect(nextPaymentAction(decision, authorization.state)).toBe("capture");
  });

  it.each<[string, Record<string, unknown>, string]>([
    ["a different amount", { amount: { currency_code: "USD", value: "72.01" } }, "OBSERVED_AMOUNT_MISMATCH"],
    ["a different currency", { amount: { currency_code: "EUR", value: "72.00" } }, "OBSERVED_CURRENCY_MISMATCH"],
    ["a different custom_id", { custom_id: "b".repeat(64) }, "BINDING_MISMATCH"],
    ["an upper-case custom_id", { custom_id: SYNTH.mandateHash.toUpperCase() }, "BINDING_MISMATCH"],
    ["no custom_id", { custom_id: null }, "BINDING_MISMATCH"],
    ["an amount that cannot be read exactly", { amount: { currency_code: "USD", value: "72" } }, "OBSERVATION_INVALID"],
  ])("blocks and voids for %s", async (_label, overrides, code) => {
    const authorization = await observe(overrides);
    const decision = finalEvaluatePurchase(MANDATE, PROPOSAL, toObservedPayment(authorization), NOW);
    expect(codes(decision)).toEqual([code]);
    expect(nextPaymentAction(decision, authorization.state)).toBe("void");
  });

  it.each([
    ["CAPTURED", "captured"],
    ["VOIDED", "voided"],
    ["EXPIRED", "expired"],
    ["PENDING", "pending"],
    ["DENIED", "denied"],
    ["SOMETHING_NEW", "unknown"],
  ])("performs no write when the authorization is %s", async (raw, state) => {
    const authorization = await observe({ status: raw });
    expect(authorization.state).toBe(state);
    const allow = finalEvaluatePurchase(MANDATE, PROPOSAL, toObservedPayment(authorization), NOW);
    expect(allow.decision).toBe("allow");
    expect(nextPaymentAction(allow, authorization.state)).toBe("none");
    const block = finalEvaluatePurchase({ ...MANDATE, status: "revoked" }, PROPOSAL, toObservedPayment(authorization), NOW);
    expect(nextPaymentAction(block, authorization.state)).toBe("none");
  });

  it("voids a mandate revoked after authorization", async () => {
    const authorization = await observe({});
    const decision = finalEvaluatePurchase(
      { ...MANDATE, status: "revoked" },
      PROPOSAL,
      toObservedPayment(authorization),
      NOW,
    );
    expect(codes(decision)).toEqual(["MANDATE_REVOKED"]);
    expect(nextPaymentAction(decision, authorization.state)).toBe("void");
  });
});
