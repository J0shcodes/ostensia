import { finalEvaluatePurchase, nextPaymentAction } from "@ostensia/domain";
import type { ConfirmedMandate, PurchaseProposal } from "@ostensia/domain";
import { describe, expect, it } from "vitest";
import { createPayPalAdapter, toObservedPayment } from "./adapter.ts";
import type { PayPalAdapter } from "./adapter.ts";
import {
  SYNTH,
  authorizationBody,
  captureBody,
  createFakeFetch,
  emptyResponse,
  jsonResponse,
  testConfig,
  tokenBody,
} from "./test-support.ts";

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

// The final step of the gate (Increment 5), in miniature: the domain rule picks
// the action and only then does the adapter send a write. When the rule says
// "none", no request of any kind may leave, not even a token request.
describe("nextPaymentAction decides which adapter write is sent", () => {
  const WRITE = { attemptId: "attempt-1", authorizationId: SYNTH.authorizationId } as const;
  const AUTH = `/v2/payments/authorizations/${SYNTH.authorizationId}`;
  const ALLOW = { decision: "allow", computedTotalMinor: 7200 };
  const BLOCK = { decision: "block", violations: [{ code: "MANDATE_REVOKED" }] };

  function setup() {
    const fake = createFakeFetch();
    const adapter = createPayPalAdapter({ config: testConfig(), fetch: fake.fetch, timeoutMs: 1000 });
    return { fake, adapter };
  }

  async function act(adapter: PayPalAdapter, decision: unknown, state: unknown) {
    const action = nextPaymentAction(decision, state);
    if (action === "capture") return { action, result: await adapter.captureAuthorization(WRITE) };
    if (action === "void") return { action, result: await adapter.voidAuthorization(WRITE) };
    return { action, result: null };
  }

  it("captures for a valid allow and a created authorization, and never voids", async () => {
    const { fake, adapter } = setup();
    fake.on("POST", "/v1/oauth2/token", jsonResponse(200, tokenBody()));
    fake.on("POST", `${AUTH}/capture`, jsonResponse(201, captureBody()));
    const { action, result } = await act(adapter, ALLOW, "created");
    expect(action).toBe("capture");
    expect(result).toMatchObject({ kind: "accepted", capture: { state: "completed" } });
    expect(fake.callsTo("POST", `${AUTH}/capture`)).toHaveLength(1);
    expect(fake.callsTo("POST", `${AUTH}/void`)).toHaveLength(0);
    expect(fake.unscripted).toEqual([]);
  });

  it("voids for a valid block and a created authorization, and never captures", async () => {
    const { fake, adapter } = setup();
    fake.on("POST", "/v1/oauth2/token", jsonResponse(200, tokenBody()));
    fake.on("POST", `${AUTH}/void`, emptyResponse(204));
    fake.on("GET", AUTH, jsonResponse(200, authorizationBody({ status: "VOIDED" })));
    const { action, result } = await act(adapter, BLOCK, "created");
    expect(action).toBe("void");
    expect(result).toEqual({ kind: "voided" });
    expect(fake.callsTo("POST", `${AUTH}/void`)).toHaveLength(1);
    expect(fake.callsTo("POST", `${AUTH}/capture`)).toHaveLength(0);
    expect(fake.unscripted).toEqual([]);
  });

  it.each(["captured", "partially_captured", "voided", "denied", "pending", "expired", "unknown"])(
    "sends nothing at all when the authorization is %s, for an allow and for a block",
    async (state) => {
      for (const decision of [ALLOW, BLOCK]) {
        const { fake, adapter } = setup();
        const { action, result } = await act(adapter, decision, state);
        expect(action).toBe("none");
        expect(result).toBeNull();
        expect(fake.calls).toHaveLength(0);
      }
    },
  );

  it.each<[string, unknown]>([
    ["no decision", undefined],
    ["null", null],
    ["a block with no violations", { decision: "block", violations: [] }],
    ["an allow with a string total", { decision: "allow", computedTotalMinor: "7200" }],
    ["an unknown decision word", { decision: "maybe" }],
  ])("sends nothing at all for %s, even with a created authorization", async (_label, decision) => {
    const { fake, adapter } = setup();
    const { action } = await act(adapter, decision, "created");
    expect(action).toBe("none");
    expect(fake.calls).toHaveLength(0);
  });

  it("sends nothing for a raw PayPal status string that was not mapped first", async () => {
    const { fake, adapter } = setup();
    const { action } = await act(adapter, ALLOW, "CREATED");
    expect(action).toBe("none");
    expect(fake.calls).toHaveLength(0);
  });

  it("runs read -> final evaluation -> write: a tampered amount ends in a void, not a capture", async () => {
    const { fake, adapter } = setup();
    fake.on("POST", "/v1/oauth2/token", jsonResponse(200, tokenBody()));
    fake.on(
      "GET",
      AUTH,
      jsonResponse(200, authorizationBody({ amount: { currency_code: "USD", value: "72.01" } })),
      jsonResponse(200, authorizationBody({ status: "VOIDED" })),
    );
    fake.on("POST", `${AUTH}/void`, emptyResponse(204));

    const read = await adapter.getAuthorization(SYNTH.authorizationId);
    if (read.kind !== "ok") throw new Error("expected ok");
    const decision = finalEvaluatePurchase(MANDATE, PROPOSAL, toObservedPayment(read.authorization), NOW);
    expect(codes(decision)).toEqual(["OBSERVED_AMOUNT_MISMATCH"]);

    const { action, result } = await act(adapter, decision, read.authorization.state);
    expect(action).toBe("void");
    expect(result).toEqual({ kind: "voided" });
    expect(fake.callsTo("POST", `${AUTH}/capture`)).toHaveLength(0);
    expect(fake.unscripted).toEqual([]);
  });
});
