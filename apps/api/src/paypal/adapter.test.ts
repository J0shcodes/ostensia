import { afterEach, describe, expect, it } from "vitest";
import { AdapterInputError, createPayPalAdapter } from "./adapter.ts";
import type { CreateVaultOrderInput, PayPalAdapter } from "./adapter.ts";
import { requestIdFor } from "./request-id.ts";
import {
  SYNTH,
  authorizationBody,
  createFakeFetch,
  emptyResponse,
  errorBody,
  jsonResponse,
  orderBody,
  testConfig,
  textResponse,
  tokenBody,
} from "./test-support.ts";
import type { FakeFetch, Step } from "./test-support.ts";

const TOKEN = "/v1/oauth2/token";
const ORDERS = "/v2/checkout/orders";
const ORDER = `/v2/checkout/orders/${SYNTH.orderId}`;
const AUTH = `/v2/payments/authorizations/${SYNTH.authorizationId}`;
const VAULT = `/v3/vault/payment-tokens/${SYNTH.vaultId}`;

const INPUT: CreateVaultOrderInput = { attemptId: "attempt-1", amountMinor: 7200, mandateHash: SYNTH.mandateHash };

let fake: FakeFetch;

function setup(options: { token?: Step } = {}): PayPalAdapter {
  fake = createFakeFetch();
  fake.on("POST", TOKEN, options.token ?? jsonResponse(200, tokenBody()));
  return createPayPalAdapter({ config: testConfig(), fetch: fake.fetch, timeoutMs: 1000 });
}

// A test that triggers a request nobody scripted fails here, even if the
// adapter turned the failure into a harmless-looking result.
afterEach(() => {
  expect(fake.unscripted).toEqual([]);
});

describe("createVaultOrder: the request", () => {
  it("sends the E-1 request shape once, with no authorize call and no stored_credential", async () => {
    const adapter = setup();
    fake.on("POST", ORDERS, jsonResponse(201, orderBody()));
    await adapter.createVaultOrder(INPUT);

    const posts = fake.callsTo("POST", ORDERS);
    expect(posts).toHaveLength(1);
    const [post] = posts;
    expect(post?.url).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders");
    expect(post?.headers).toEqual({
      Authorization: `Bearer ${SYNTH.accessToken}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": requestIdFor("attempt-1", "create_order"),
      Prefer: "return=representation",
    });
    expect(JSON.parse(post?.body ?? "null")).toEqual({
      intent: "AUTHORIZE",
      payment_source: { paypal: { vault_id: SYNTH.vaultId } },
      purchase_units: [
        {
          reference_id: "attempt-1",
          custom_id: SYNTH.mandateHash,
          invoice_id: "ostensia-attempt-1",
          description: "Ostensia purchase authorization",
          amount: { currency_code: "USD", value: "72.00" },
        },
      ],
    });
    expect(post?.body).not.toContain("stored_credential");
    expect(fake.calls.map((call) => call.path)).toEqual([TOKEN, ORDERS]);
  });

  it("formats the amount from minor units", async () => {
    const adapter = setup();
    fake.on("POST", ORDERS, jsonResponse(201, orderBody()));
    await adapter.createVaultOrder({ ...INPUT, amountMinor: 5 });
    const body = JSON.parse(fake.callsTo("POST", ORDERS)[0]?.body ?? "null") as {
      purchase_units: { amount: { value: string } }[];
    };
    expect(body.purchase_units[0]?.amount.value).toBe("0.05");
  });

  it("sends the same request id for the same attempt", async () => {
    const adapter = setup();
    fake.on("POST", ORDERS, jsonResponse(201, orderBody()), jsonResponse(200, orderBody()));
    await adapter.createVaultOrder(INPUT);
    await adapter.createVaultOrder(INPUT);
    const ids = fake.callsTo("POST", ORDERS).map((call) => call.headers["PayPal-Request-Id"]);
    expect(ids[0]).toBe(ids[1]);
  });
});

describe("createVaultOrder: an authorization is present", () => {
  it.each([200, 201])("returns created for a %d", async (status) => {
    const adapter = setup();
    fake.on("POST", ORDERS, jsonResponse(status, orderBody()));
    expect(await adapter.createVaultOrder(INPUT)).toEqual({
      kind: "created",
      authorizationId: SYNTH.authorizationId,
      order: {
        orderId: SYNTH.orderId,
        statusRaw: "COMPLETED",
        state: "completed",
        authorizations: [{ id: SYNTH.authorizationId, statusRaw: "CREATED", state: "created" }],
      },
    });
    expect(fake.callsTo("GET", ORDER)).toHaveLength(0);
  });

  it("keeps an order status it does not know as unknown, and still returns created", async () => {
    const adapter = setup();
    fake.on("POST", ORDERS, jsonResponse(201, orderBody({ status: "SOMETHING_NEW" })));
    const result = await adapter.createVaultOrder(INPUT);
    expect(result).toMatchObject({ kind: "created", order: { statusRaw: "SOMETHING_NEW", state: "unknown" } });
  });
});

describe("createVaultOrder: no authorization in the response (D-010, D-019)", () => {
  it("reads the order once and uses the authorization it finds", async () => {
    const adapter = setup();
    fake.on("POST", ORDERS, jsonResponse(201, orderBody({ authorizations: [] })));
    fake.on("GET", ORDER, jsonResponse(200, orderBody()));
    expect(await adapter.createVaultOrder(INPUT)).toMatchObject({
      kind: "created",
      authorizationId: SYNTH.authorizationId,
    });
    expect(fake.callsTo("POST", ORDERS)).toHaveLength(1);
    expect(fake.callsTo("GET", ORDER)).toHaveLength(1);
  });

  it.each(["COMPLETED", "APPROVED"])("is an anomaly when the %s order still has none after the re-read", async (status) => {
    const adapter = setup();
    fake.on("POST", ORDERS, jsonResponse(201, orderBody({ status, authorizations: [] })));
    fake.on("GET", ORDER, jsonResponse(200, orderBody({ status, authorizations: [] })));
    expect(await adapter.createVaultOrder(INPUT)).toMatchObject({
      kind: "anomaly",
      reason: "no_authorization",
      order: { authorizations: [] },
    });
    expect(fake.callsTo("GET", ORDER)).toHaveLength(1);
    expect(fake.callsTo("POST", ORDERS)).toHaveLength(1);
  });

  it.each<[string, Step]>([
    ["a 500", jsonResponse(500, {})],
    ["a 404", jsonResponse(404, errorBody("RESOURCE_NOT_FOUND"))],
    ["a timeout", "timeout"],
    ["an unreadable body", textResponse(200, "nope")],
  ])("is unconfirmed, with the order id, when the re-read gives %s", async (_label, step) => {
    const adapter = setup();
    fake.on("POST", ORDERS, jsonResponse(201, orderBody({ authorizations: [] })));
    fake.on("GET", ORDER, step);
    expect(await adapter.createVaultOrder(INPUT)).toMatchObject({
      kind: "unknown",
      reason: "authorization_unconfirmed",
      orderId: SYNTH.orderId,
    });
  });

  it("is an anomaly, without a re-read, when there is more than one authorization", async () => {
    const adapter = setup();
    fake.on(
      "POST",
      ORDERS,
      jsonResponse(
        201,
        orderBody({
          authorizations: [
            { id: "SYNTH-AUTH-1", status: "CREATED" },
            { id: "SYNTH-AUTH-2", status: "CREATED" },
          ],
        }),
      ),
    );
    expect(await adapter.createVaultOrder(INPUT)).toMatchObject({ kind: "anomaly", reason: "multiple_authorizations" });
    expect(fake.callsTo("GET", ORDER)).toHaveLength(0);
  });
});

describe("createVaultOrder: failures send exactly one POST", () => {
  it.each<[string, Step, number]>([
    ["400", jsonResponse(400, errorBody("INVALID_REQUEST", ["MISSING_REQUIRED_PARAMETER"])), 400],
    ["401", jsonResponse(401, errorBody("AUTHENTICATION_FAILURE")), 401],
    ["403", jsonResponse(403, errorBody("NOT_AUTHORIZED")), 403],
    ["404", jsonResponse(404, errorBody("RESOURCE_NOT_FOUND")), 404],
    ["422", jsonResponse(422, errorBody("UNPROCESSABLE_ENTITY", ["INVALID_RESOURCE_ID"])), 422],
  ])("treats a %s as rejected", async (_label, step, status) => {
    const adapter = setup();
    fake.on("POST", ORDERS, step);
    expect(await adapter.createVaultOrder(INPUT)).toMatchObject({ kind: "rejected", error: { status } });
    expect(fake.callsTo("POST", ORDERS)).toHaveLength(1);
  });

  it.each<[string, Step, string]>([
    ["408", jsonResponse(408, {}), "timeout"],
    ["409 PREVIOUS_REQUEST_IN_PROGRESS", jsonResponse(409, errorBody("RESOURCE_CONFLICT", ["PREVIOUS_REQUEST_IN_PROGRESS"])), "conflict"],
    ["429", jsonResponse(429, {}), "rate_limited"],
    ["500", jsonResponse(500, {}), "server_error"],
    ["502", textResponse(502, "<html>"), "server_error"],
    ["503", jsonResponse(503, {}), "server_error"],
    ["a timeout", "timeout", "timeout"],
    ["a network error", "network", "network"],
    ["a 202", jsonResponse(202, {}), "unexpected_status"],
    ["a 204", emptyResponse(204), "unexpected_status"],
    ["a 2xx with no body", emptyResponse(201), "unreadable_response"],
    ["a 2xx that is not JSON", textResponse(201, "ok"), "unreadable_response"],
    ["a 2xx with no order id", jsonResponse(201, { status: "COMPLETED" }), "unreadable_response"],
    ["a 2xx with an unsafe order id", jsonResponse(201, orderBody({ id: "a/b" })), "unreadable_response"],
  ])("treats %s as unknown (%s) and never retries", async (_label, step, reason) => {
    const adapter = setup();
    fake.on("POST", ORDERS, step);
    expect(await adapter.createVaultOrder(INPUT)).toMatchObject({ kind: "unknown", reason, orderId: null });
    expect(fake.callsTo("POST", ORDERS)).toHaveLength(1);
    expect(fake.callsTo("GET", ORDER)).toHaveLength(0);
  });

  it("returns only the error name and issue strings, clipped, and never the message", async () => {
    const adapter = setup();
    const issues = Array.from({ length: 20 }, (_unused, index) => `ISSUE_${index}_${"X".repeat(100)}`);
    fake.on("POST", ORDERS, jsonResponse(422, errorBody("N".repeat(200), issues, "MESSAGE_THAT_ECHOES_INPUT")));
    const result = await adapter.createVaultOrder(INPUT);
    expect(result).toMatchObject({ kind: "rejected" });
    if (result.kind !== "rejected") throw new Error("expected rejected");
    expect(result.error.issues).toHaveLength(10);
    expect(result.error.issues.every((issue) => issue.length <= 64)).toBe(true);
    expect(result.error.errorName).toHaveLength(64);
    expect(JSON.stringify(result)).not.toContain("MESSAGE_THAT_ECHOES_INPUT");
  });

  it("returns the debug id when PayPal sends one", async () => {
    const adapter = setup();
    fake.on("POST", ORDERS, jsonResponse(422, errorBody("UNPROCESSABLE_ENTITY"), { "paypal-debug-id": "dbg123" }));
    expect(await adapter.createVaultOrder(INPUT)).toMatchObject({ error: { debugId: "dbg123" } });
  });
});

describe("createVaultOrder: no token", () => {
  it.each<[string, Step, string]>([
    ["bad credentials", jsonResponse(401, { error: "invalid_client" }), "rejected"],
    ["an unavailable server", jsonResponse(503, {}), "unavailable"],
    ["a timeout", "timeout", "unavailable"],
    ["an unreadable response", textResponse(200, "x"), "unreadable"],
  ])("sends nothing to the orders endpoint after %s", async (_label, token, tokenFailure) => {
    const adapter = setup({ token });
    expect(await adapter.createVaultOrder(INPUT)).toEqual({
      kind: "not_sent",
      reason: "token_unavailable",
      tokenFailure,
    });
    expect(fake.callsTo("POST", ORDERS)).toHaveLength(0);
  });
});

describe("createVaultOrder: input checks", () => {
  it.each<[string, Partial<CreateVaultOrderInput>]>([
    ["an empty attempt id", { attemptId: "" }],
    ["an attempt id with a space", { attemptId: "bad id" }],
    ["an attempt id with a slash", { attemptId: "a/b" }],
    ["an attempt id over 100 characters", { attemptId: "x".repeat(101) }],
    ["a zero amount", { amountMinor: 0 }],
    ["a negative amount", { amountMinor: -1 }],
    ["a fractional amount", { amountMinor: 1.5 }],
    ["a NaN amount", { amountMinor: Number.NaN }],
    ["an unsafe amount", { amountMinor: Number.MAX_SAFE_INTEGER + 1 }],
    ["an upper-case hash", { mandateHash: "A".repeat(64) }],
    ["a short hash", { mandateHash: "a".repeat(63) }],
    ["a non-hex hash", { mandateHash: "g".repeat(64) }],
  ])("throws AdapterInputError for %s and sends nothing", async (_label, override) => {
    const adapter = setup();
    await expect(adapter.createVaultOrder({ ...INPUT, ...override })).rejects.toBeInstanceOf(AdapterInputError);
    expect(fake.calls).toHaveLength(0);
  });

  it("accepts an attempt id of exactly 100 characters", async () => {
    const adapter = setup();
    fake.on("POST", ORDERS, jsonResponse(201, orderBody()));
    expect(await adapter.createVaultOrder({ ...INPUT, attemptId: "x".repeat(100) })).toMatchObject({ kind: "created" });
  });
});

describe("a 401 invalidates the token without retrying the call", () => {
  it("fetches a new token for the next call and does not repeat the failed one", async () => {
    const adapter = setup();
    fake.on("POST", TOKEN, jsonResponse(200, tokenBody()));
    fake.on("POST", ORDERS, jsonResponse(401, errorBody("AUTHENTICATION_FAILURE")));
    fake.on("GET", ORDER, jsonResponse(200, orderBody()));

    expect(await adapter.createVaultOrder(INPUT)).toMatchObject({ kind: "rejected" });
    expect(fake.callsTo("POST", ORDERS)).toHaveLength(1);
    expect(await adapter.getOrder(SYNTH.orderId)).toMatchObject({ kind: "ok" });
    expect(fake.callsTo("POST", TOKEN)).toHaveLength(2);
  });
});

describe("checkVault", () => {
  it("reads the vault token and treats a 200 as ok without reading the body", async () => {
    const adapter = setup();
    fake.on("GET", VAULT, emptyResponse(200));
    expect(await adapter.checkVault()).toEqual({ kind: "ok" });
    const [call] = fake.callsTo("GET", VAULT);
    expect(call?.url).toBe("https://api-m.sandbox.paypal.com/v3/vault/payment-tokens/SYNTH-VAULT-1");
    expect(call?.headers).toEqual({ Authorization: `Bearer ${SYNTH.accessToken}` });
    expect(call?.body).toBeNull();
  });

  it.each<[string, Step]>([
    ["the error name", jsonResponse(404, errorBody("RESOURCE_NOT_FOUND"))],
    ["an issue", jsonResponse(404, errorBody("INVALID_RESOURCE", ["RESOURCE_NOT_FOUND"]))],
  ])("is vault_unavailable for a 404 RESOURCE_NOT_FOUND in %s", async (_label, step) => {
    const adapter = setup();
    fake.on("GET", VAULT, step);
    expect(await adapter.checkVault()).toEqual({ kind: "vault_unavailable" });
  });

  it("treats another 404 as a plain rejection", async () => {
    const adapter = setup();
    fake.on("GET", VAULT, jsonResponse(404, errorBody("SOMETHING_ELSE")));
    expect(await adapter.checkVault()).toMatchObject({ kind: "rejected", error: { status: 404 } });
  });

  it.each<[string, Step, string]>([
    ["a 401", jsonResponse(401, errorBody("AUTHENTICATION_FAILURE")), "rejected"],
    ["a 500", jsonResponse(500, {}), "unknown"],
    ["a timeout", "timeout", "unknown"],
    ["a 204", emptyResponse(204), "unknown"],
  ])("reports %s as %s", async (_label, step, kind) => {
    const adapter = setup();
    fake.on("GET", VAULT, step);
    expect(await adapter.checkVault()).toMatchObject({ kind });
  });

  it("sends nothing to the vault endpoint without a token", async () => {
    const adapter = setup({ token: jsonResponse(401, {}) });
    expect(await adapter.checkVault()).toMatchObject({ kind: "not_sent", tokenFailure: "rejected" });
    expect(fake.callsTo("GET", VAULT)).toHaveLength(0);
  });
});

describe("getOrder", () => {
  it("returns a snapshot with raw and mapped statuses", async () => {
    const adapter = setup();
    fake.on("GET", ORDER, jsonResponse(200, orderBody()));
    expect(await adapter.getOrder(SYNTH.orderId)).toEqual({
      kind: "ok",
      order: {
        orderId: SYNTH.orderId,
        statusRaw: "COMPLETED",
        state: "completed",
        authorizations: [{ id: SYNTH.authorizationId, statusRaw: "CREATED", state: "created" }],
      },
    });
    expect(fake.callsTo("GET", ORDER)[0]?.url).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders/SYNTH-ORDER-1");
  });

  it("keeps an authorization status it does not know as unknown", async () => {
    const adapter = setup();
    fake.on("GET", ORDER, jsonResponse(200, orderBody({ authorizations: [{ id: SYNTH.authorizationId, status: "WEIRD" }] })));
    expect(await adapter.getOrder(SYNTH.orderId)).toMatchObject({
      order: { authorizations: [{ statusRaw: "WEIRD", state: "unknown" }] },
    });
  });

  it("returns not_found for a 404", async () => {
    const adapter = setup();
    fake.on("GET", ORDER, jsonResponse(404, errorBody("RESOURCE_NOT_FOUND")));
    expect(await adapter.getOrder(SYNTH.orderId)).toEqual({ kind: "not_found" });
  });

  it.each<[string, Step, string]>([
    ["a 403", jsonResponse(403, errorBody("NOT_AUTHORIZED")), "rejected"],
    ["a 500", jsonResponse(500, {}), "unknown"],
    ["a timeout", "timeout", "unknown"],
    ["a network error", "network", "unknown"],
    ["a 200 that is not JSON", textResponse(200, "x"), "unknown"],
    ["a 200 with no id", jsonResponse(200, { status: "COMPLETED" }), "unknown"],
    ["a 201", jsonResponse(201, orderBody()), "unknown"],
  ])("reports %s as %s", async (_label, step, kind) => {
    const adapter = setup();
    fake.on("GET", ORDER, step);
    expect(await adapter.getOrder(SYNTH.orderId)).toMatchObject({ kind });
  });

  it.each(["", "a/b", "..", "a b", "a?b", "x".repeat(129)])("throws AdapterInputError for the id %j", async (id) => {
    const adapter = setup();
    await expect(adapter.getOrder(id)).rejects.toBeInstanceOf(AdapterInputError);
    expect(fake.calls).toHaveLength(0);
  });
});

describe("getAuthorization", () => {
  it("returns the E-1 fields, with the amount in minor units", async () => {
    const adapter = setup();
    fake.on("GET", AUTH, jsonResponse(200, authorizationBody()));
    expect(await adapter.getAuthorization(SYNTH.authorizationId)).toEqual({
      kind: "ok",
      authorization: {
        id: SYNTH.authorizationId,
        statusRaw: "CREATED",
        state: "created",
        amountMinor: 7200,
        currency: "USD",
        customId: SYNTH.mandateHash,
        expirationTime: "2026-12-01T12:29:15Z",
        createTime: "2026-11-02T12:29:15Z",
        orderId: SYNTH.orderId,
      },
    });
  });

  it("never follows the links in the response", async () => {
    const adapter = setup();
    fake.on("GET", AUTH, jsonResponse(200, authorizationBody()));
    await adapter.getAuthorization(SYNTH.authorizationId);
    expect(fake.calls.every((call) => call.url.startsWith("https://api-m.sandbox.paypal.com/"))).toBe(true);
    expect(fake.calls.some((call) => call.url.includes("attacker"))).toBe(false);
  });

  it.each([
    ["CAPTURED", "captured"],
    ["PARTIALLY_CAPTURED", "partially_captured"],
    ["VOIDED", "voided"],
    ["DENIED", "denied"],
    ["PENDING", "pending"],
    ["EXPIRED", "expired"],
    ["created", "unknown"],
    ["NEW_STATUS", "unknown"],
  ])("maps the status %s to %s and keeps the raw value", async (raw, state) => {
    const adapter = setup();
    fake.on("GET", AUTH, jsonResponse(200, authorizationBody({ status: raw })));
    expect(await adapter.getAuthorization(SYNTH.authorizationId)).toMatchObject({
      authorization: { statusRaw: raw, state },
    });
  });

  it("returns a null amount when PayPal's amount string cannot be read exactly", async () => {
    const adapter = setup();
    fake.on("GET", AUTH, jsonResponse(200, authorizationBody({ amount: { currency_code: "USD", value: "72" } })));
    expect(await adapter.getAuthorization(SYNTH.authorizationId)).toMatchObject({
      authorization: { amountMinor: null },
    });
  });

  it.each<[string, Record<string, unknown>]>([
    ["absent", { custom_id: undefined }],
    ["null", { custom_id: null }],
  ])("returns a null customId when custom_id is %s", async (_label, override) => {
    const adapter = setup();
    fake.on("GET", AUTH, jsonResponse(200, authorizationBody(override)));
    expect(await adapter.getAuthorization(SYNTH.authorizationId)).toMatchObject({ authorization: { customId: null } });
  });

  it("returns nulls for the optional fields PayPal leaves out", async () => {
    const adapter = setup();
    fake.on(
      "GET",
      AUTH,
      jsonResponse(200, {
        id: SYNTH.authorizationId,
        status: "CREATED",
        amount: { currency_code: "USD", value: "1.00" },
      }),
    );
    expect(await adapter.getAuthorization(SYNTH.authorizationId)).toMatchObject({
      authorization: { customId: null, expirationTime: null, createTime: null, orderId: null },
    });
  });

  it("returns not_found for a 404", async () => {
    const adapter = setup();
    fake.on("GET", AUTH, jsonResponse(404, errorBody("RESOURCE_NOT_FOUND")));
    expect(await adapter.getAuthorization(SYNTH.authorizationId)).toEqual({ kind: "not_found" });
  });

  it.each<[string, Step]>([
    ["a missing amount", jsonResponse(200, authorizationBody({ amount: undefined }))],
    ["a missing status", jsonResponse(200, authorizationBody({ status: undefined }))],
    ["a numeric amount value", jsonResponse(200, authorizationBody({ amount: { currency_code: "USD", value: 72 } }))],
    ["an empty body", emptyResponse(200)],
  ])("reports %s as unreadable", async (_label, step) => {
    const adapter = setup();
    fake.on("GET", AUTH, step);
    expect(await adapter.getAuthorization(SYNTH.authorizationId)).toMatchObject({
      kind: "unknown",
      reason: "unreadable_response",
    });
  });

  it.each(["", "a/b", "..", "a b"])("throws AdapterInputError for the id %j", async (id) => {
    const adapter = setup();
    await expect(adapter.getAuthorization(id)).rejects.toBeInstanceOf(AdapterInputError);
    expect(fake.calls).toHaveLength(0);
  });
});

describe("secrets", () => {
  it("never appear in any result", async () => {
    const adapter = setup();
    fake.on("GET", VAULT, jsonResponse(404, errorBody("RESOURCE_NOT_FOUND")));
    fake.on("POST", ORDERS, jsonResponse(422, errorBody("UNPROCESSABLE_ENTITY", ["X"])));
    fake.on("GET", AUTH, jsonResponse(200, authorizationBody()));
    fake.on("GET", ORDER, jsonResponse(200, orderBody()));
    const results = [
      await adapter.checkVault(),
      await adapter.createVaultOrder(INPUT),
      await adapter.getAuthorization(SYNTH.authorizationId),
      await adapter.getOrder(SYNTH.orderId),
    ];
    const text = JSON.stringify(results);
    for (const secret of [SYNTH.clientSecret, SYNTH.accessToken, "Basic ", "Bearer "]) {
      expect(text).not.toContain(secret);
    }
  });
});
