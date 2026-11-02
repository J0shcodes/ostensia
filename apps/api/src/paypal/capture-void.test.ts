import { afterEach, describe, expect, it } from "vitest";
import { AdapterInputError, createPayPalAdapter } from "./adapter.ts";
import type { AuthorizationWriteInput, PayPalAdapter } from "./adapter.ts";
import { requestIdFor } from "./request-id.ts";
import {
  SYNTH,
  authorizationBody,
  captureBody,
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
const AUTH = `/v2/payments/authorizations/${SYNTH.authorizationId}`;
const CAPTURE = `${AUTH}/capture`;
const VOID = `${AUTH}/void`;
const ORDER = `/v2/checkout/orders/${SYNTH.orderId}`;

const INPUT: AuthorizationWriteInput = { attemptId: "attempt-1", authorizationId: SYNTH.authorizationId };

let fake: FakeFetch;

function setup(options: { token?: Step } = {}): PayPalAdapter {
  fake = createFakeFetch();
  fake.on("POST", TOKEN, options.token ?? jsonResponse(200, tokenBody()));
  return createPayPalAdapter({ config: testConfig(), fetch: fake.fetch, timeoutMs: 1000 });
}

// A request nobody scripted fails the test, even if the adapter turned it into
// a harmless-looking result. This is also how "no GET after a failed void" and
// "no second POST" are enforced.
afterEach(() => {
  expect(fake.unscripted).toEqual([]);
});

const E1_REFUSAL = (issue: string) => jsonResponse(422, errorBody("Unprocessable Entity", [issue]), { "paypal-debug-id": "dbg422" });

describe("captureAuthorization: the request", () => {
  it("sends the E-1 capture request once: a full capture with no amount", async () => {
    const adapter = setup();
    fake.on("POST", CAPTURE, jsonResponse(201, captureBody()));
    await adapter.captureAuthorization(INPUT);

    const posts = fake.callsTo("POST", CAPTURE);
    expect(posts).toHaveLength(1);
    const [post] = posts;
    expect(post?.url).toBe("https://api-m.sandbox.paypal.com/v2/payments/authorizations/SYNTH-AUTH-1/capture");
    expect(post?.headers).toEqual({
      Authorization: `Bearer ${SYNTH.accessToken}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": requestIdFor("attempt-1", "capture"),
      Prefer: "return=representation",
    });
    expect(JSON.parse(post?.body ?? "null")).toEqual({ final_capture: true });
    expect(fake.calls.map((call) => call.path)).toEqual([TOKEN, CAPTURE]);
  });

  it("uses the same request id for the same attempt, and a different one per attempt and per operation", async () => {
    const adapter = setup();
    fake.on("POST", CAPTURE, jsonResponse(201, captureBody()), jsonResponse(200, captureBody()), jsonResponse(201, captureBody()));
    await adapter.captureAuthorization(INPUT);
    await adapter.captureAuthorization(INPUT);
    await adapter.captureAuthorization({ ...INPUT, attemptId: "attempt-2" });
    const ids = fake.callsTo("POST", CAPTURE).map((call) => call.headers["PayPal-Request-Id"]);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[0]);
    expect(ids[0]).not.toBe(requestIdFor("attempt-1", "void"));
  });
});

describe("captureAuthorization: PayPal accepted it", () => {
  it.each([201, 200])("returns the capture for a %d (201 is the capture, 200 is the E-1 replay)", async (status) => {
    const adapter = setup();
    fake.on("POST", CAPTURE, jsonResponse(status, captureBody()));
    expect(await adapter.captureAuthorization(INPUT)).toEqual({
      kind: "accepted",
      capture: {
        captureId: SYNTH.captureId,
        statusRaw: "COMPLETED",
        state: "completed",
        amountMinor: 7200,
        currency: "USD",
      },
    });
  });

  it.each([
    ["PENDING", "pending"],
    ["DECLINED", "unknown"],
    ["completed", "unknown"],
    ["SOMETHING_NEW", "unknown"],
  ])("keeps the raw status %s and maps it to %s, so only completed means money moved", async (raw, state) => {
    const adapter = setup();
    fake.on("POST", CAPTURE, jsonResponse(201, captureBody({ status: raw })));
    expect(await adapter.captureAuthorization(INPUT)).toMatchObject({
      kind: "accepted",
      capture: { statusRaw: raw, state },
    });
  });

  it.each<[string, Record<string, unknown>]>([
    ["no amount", { amount: undefined }],
    ["an amount that cannot be read exactly", { amount: { currency_code: "USD", value: "72" } }],
  ])("returns a null amount for %s", async (_label, override) => {
    const adapter = setup();
    fake.on("POST", CAPTURE, jsonResponse(201, captureBody(override)));
    const result = await adapter.captureAuthorization(INPUT);
    expect(result).toMatchObject({ kind: "accepted", capture: { amountMinor: null } });
  });
});

describe("captureAuthorization: the authorization is already settled (E-1)", () => {
  it.each(["PREVIOUSLY_CAPTURED", "AUTHORIZATION_VOIDED"] as const)("reports a 422 %s", async (issue) => {
    const adapter = setup();
    fake.on("POST", CAPTURE, E1_REFUSAL(issue));
    expect(await adapter.captureAuthorization(INPUT)).toEqual({
      kind: "already_terminal",
      issue,
      status: 422,
      debugId: "dbg422",
    });
    expect(fake.callsTo("POST", CAPTURE)).toHaveLength(1);
  });

  it("finds the refusal among several issues", async () => {
    const adapter = setup();
    fake.on("POST", CAPTURE, jsonResponse(422, errorBody("UNPROCESSABLE_ENTITY", ["OTHER", "PREVIOUSLY_CAPTURED"])));
    expect(await adapter.captureAuthorization(INPUT)).toMatchObject({ kind: "already_terminal", issue: "PREVIOUSLY_CAPTURED" });
  });

  it.each<[string, Step]>([
    ["a 422 with another issue", jsonResponse(422, errorBody("UNPROCESSABLE_ENTITY", ["AUTHORIZATION_EXPIRED"]))],
    ["a 422 with no issue", jsonResponse(422, errorBody("UNPROCESSABLE_ENTITY"))],
    ["a 400 that names a settled issue", jsonResponse(400, errorBody("INVALID_REQUEST", ["PREVIOUSLY_CAPTURED"]))],
    ["a 403 that names a settled issue", jsonResponse(403, errorBody("NOT_AUTHORIZED", ["AUTHORIZATION_VOIDED"]))],
    ["a 422 whose issue is a different case", jsonResponse(422, errorBody("X", ["previously_captured"]))],
  ])("treats %s as an ordinary rejection", async (_label, step) => {
    const adapter = setup();
    fake.on("POST", CAPTURE, step);
    expect(await adapter.captureAuthorization(INPUT)).toMatchObject({ kind: "rejected" });
  });
});

describe("captureAuthorization: every failure sends exactly one POST", () => {
  it.each<[string, Step, number]>([
    ["400", jsonResponse(400, errorBody("INVALID_REQUEST")), 400],
    ["401", jsonResponse(401, errorBody("AUTHENTICATION_FAILURE")), 401],
    ["403", jsonResponse(403, errorBody("NOT_AUTHORIZED")), 403],
    ["404", jsonResponse(404, errorBody("RESOURCE_NOT_FOUND")), 404],
  ])("treats a %s as rejected", async (_label, step, status) => {
    const adapter = setup();
    fake.on("POST", CAPTURE, step);
    expect(await adapter.captureAuthorization(INPUT)).toMatchObject({ kind: "rejected", error: { status } });
    expect(fake.callsTo("POST", CAPTURE)).toHaveLength(1);
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
    ["a 202", jsonResponse(202, captureBody()), "unexpected_status"],
    ["a 204", emptyResponse(204), "unexpected_status"],
    ["a 2xx with no body", emptyResponse(201), "unreadable_response"],
    ["a 2xx that is not JSON", textResponse(201, "ok"), "unreadable_response"],
    ["a 2xx with no capture id", jsonResponse(201, { status: "COMPLETED" }), "unreadable_response"],
    ["a 2xx with an unsafe capture id", jsonResponse(201, captureBody({ id: "a/b" })), "unreadable_response"],
    ["a 2xx with no status", jsonResponse(201, captureBody({ status: undefined })), "unreadable_response"],
  ])("treats %s as unknown (%s): the capture may have happened, and it is never retried", async (_label, step, reason) => {
    const adapter = setup();
    fake.on("POST", CAPTURE, step);
    expect(await adapter.captureAuthorization(INPUT)).toMatchObject({ kind: "unknown", reason });
    expect(fake.callsTo("POST", CAPTURE)).toHaveLength(1);
    expect(fake.callsTo("GET", AUTH)).toHaveLength(0);
  });

  it.each<[string, Step, string]>([
    ["bad credentials", jsonResponse(401, {}), "rejected"],
    ["an unavailable server", jsonResponse(503, {}), "unavailable"],
    ["a timeout", "timeout", "unavailable"],
  ])("sends nothing to the capture endpoint after a token failure from %s", async (_label, token, tokenFailure) => {
    const adapter = setup({ token });
    expect(await adapter.captureAuthorization(INPUT)).toEqual({ kind: "not_sent", reason: "token_unavailable", tokenFailure });
    expect(fake.callsTo("POST", CAPTURE)).toHaveLength(0);
  });

  it("invalidates the token on a 401 without repeating the capture", async () => {
    const adapter = setup();
    fake.on("POST", TOKEN, jsonResponse(200, tokenBody()));
    fake.on("POST", CAPTURE, jsonResponse(401, errorBody("AUTHENTICATION_FAILURE")));
    fake.on("GET", AUTH, jsonResponse(200, authorizationBody()));
    expect(await adapter.captureAuthorization(INPUT)).toMatchObject({ kind: "rejected" });
    await adapter.getAuthorization(SYNTH.authorizationId);
    expect(fake.callsTo("POST", CAPTURE)).toHaveLength(1);
    expect(fake.callsTo("POST", TOKEN)).toHaveLength(2);
  });
});

describe("voidAuthorization: the request", () => {
  it("sends the E-1 void request once, then confirms with one GET", async () => {
    const adapter = setup();
    fake.on("POST", VOID, emptyResponse(204));
    fake.on("GET", AUTH, jsonResponse(200, authorizationBody({ status: "VOIDED" })));
    expect(await adapter.voidAuthorization(INPUT)).toEqual({ kind: "voided" });

    const [post] = fake.callsTo("POST", VOID);
    expect(post?.url).toBe("https://api-m.sandbox.paypal.com/v2/payments/authorizations/SYNTH-AUTH-1/void");
    expect(post?.headers).toEqual({
      Authorization: `Bearer ${SYNTH.accessToken}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": requestIdFor("attempt-1", "void"),
    });
    expect(post?.body).toBe("{}");
    expect(fake.calls.map((call) => `${call.method} ${call.path}`)).toEqual([`POST ${TOKEN}`, `POST ${VOID}`, `GET ${AUTH}`]);
  });

  it("has a request id that differs from the capture's for the same attempt", () => {
    expect(requestIdFor("attempt-1", "void")).not.toBe(requestIdFor("attempt-1", "capture"));
  });
});

describe("voidAuthorization: a 2xx is confirmed by reading the authorization (D-019)", () => {
  it.each([204, 200])("returns voided for a %d followed by VOIDED", async (status) => {
    const adapter = setup();
    fake.on("POST", VOID, status === 204 ? emptyResponse(204) : jsonResponse(200, {}));
    fake.on("GET", AUTH, jsonResponse(200, authorizationBody({ status: "VOIDED" })));
    expect(await adapter.voidAuthorization(INPUT)).toEqual({ kind: "voided" });
  });

  it.each<[string, Step]>([
    ["CREATED", jsonResponse(200, authorizationBody({ status: "CREATED" }))],
    ["CAPTURED", jsonResponse(200, authorizationBody({ status: "CAPTURED" }))],
    ["a status it does not know", jsonResponse(200, authorizationBody({ status: "SOMETHING_NEW" }))],
    ["a lower-case voided", jsonResponse(200, authorizationBody({ status: "voided" }))],
    ["a 404", jsonResponse(404, errorBody("RESOURCE_NOT_FOUND"))],
    ["a 500", jsonResponse(500, {})],
    ["a timeout", "timeout"],
    ["a network error", "network"],
    ["an unreadable body", textResponse(200, "nope")],
  ])("is unconfirmed when the read shows %s", async (_label, read) => {
    const adapter = setup();
    fake.on("POST", VOID, emptyResponse(204));
    fake.on("GET", AUTH, read);
    expect(await adapter.voidAuthorization(INPUT)).toMatchObject({
      kind: "unknown",
      reason: "void_unconfirmed",
      status: 204,
    });
    expect(fake.callsTo("POST", VOID)).toHaveLength(1);
    expect(fake.callsTo("GET", AUTH)).toHaveLength(1);
  });
});

describe("voidAuthorization: failures send exactly one POST and never read", () => {
  it.each(["PREVIOUSLY_CAPTURED", "AUTHORIZATION_VOIDED"] as const)("reports a 422 %s as already settled", async (issue) => {
    const adapter = setup();
    fake.on("POST", VOID, E1_REFUSAL(issue));
    expect(await adapter.voidAuthorization(INPUT)).toEqual({ kind: "already_terminal", issue, status: 422, debugId: "dbg422" });
    expect(fake.callsTo("POST", VOID)).toHaveLength(1);
    expect(fake.callsTo("GET", AUTH)).toHaveLength(0);
  });

  it.each<[string, Step, string]>([
    ["400", jsonResponse(400, errorBody("INVALID_REQUEST")), "rejected"],
    ["403", jsonResponse(403, errorBody("NOT_AUTHORIZED")), "rejected"],
    ["404", jsonResponse(404, errorBody("RESOURCE_NOT_FOUND")), "rejected"],
    ["a 422 with another issue", jsonResponse(422, errorBody("X", ["SOMETHING_ELSE"])), "rejected"],
    ["409", jsonResponse(409, errorBody("RESOURCE_CONFLICT", ["PREVIOUS_REQUEST_IN_PROGRESS"])), "unknown"],
    ["429", jsonResponse(429, {}), "unknown"],
    ["500", jsonResponse(500, {}), "unknown"],
    ["a timeout", "timeout", "unknown"],
    ["a network error", "network", "unknown"],
    ["a 201", jsonResponse(201, {}), "unknown"],
    ["a 202", emptyResponse(202), "unknown"],
  ])("treats %s as %s", async (_label, step, kind) => {
    const adapter = setup();
    fake.on("POST", VOID, step);
    expect(await adapter.voidAuthorization(INPUT)).toMatchObject({ kind });
    expect(fake.callsTo("POST", VOID)).toHaveLength(1);
    expect(fake.callsTo("GET", AUTH)).toHaveLength(0);
  });

  it("sends nothing to the void endpoint without a token", async () => {
    const adapter = setup({ token: jsonResponse(401, {}) });
    expect(await adapter.voidAuthorization(INPUT)).toMatchObject({ kind: "not_sent", tokenFailure: "rejected" });
    expect(fake.callsTo("POST", VOID)).toHaveLength(0);
  });
});

describe("input checks on both writes", () => {
  const write = (adapter: PayPalAdapter, name: "capture" | "void", input: AuthorizationWriteInput) =>
    name === "capture" ? adapter.captureAuthorization(input) : adapter.voidAuthorization(input);

  it.each(["capture", "void"] as const)("%s: throws AdapterInputError for a bad authorization id and sends nothing", async (name) => {
    const adapter = setup();
    for (const authorizationId of ["", "a/b", "..", "a b", "a?b", "x".repeat(129)]) {
      await expect(write(adapter, name, { ...INPUT, authorizationId })).rejects.toBeInstanceOf(AdapterInputError);
    }
    expect(fake.calls).toHaveLength(0);
  });

  it.each(["capture", "void"] as const)("%s: throws AdapterInputError for a bad attempt id and sends nothing", async (name) => {
    const adapter = setup();
    for (const attemptId of ["", "bad id", "a/b", "x".repeat(101)]) {
      await expect(write(adapter, name, { ...INPUT, attemptId })).rejects.toBeInstanceOf(AdapterInputError);
    }
    expect(fake.calls).toHaveLength(0);
  });
});

describe("after a capture whose outcome is unknown, the order shows the capture", () => {
  it("reads captures from purchase_units[].payments.captures (E-1, E1-C.6)", async () => {
    const adapter = setup();
    fake.on(
      "GET",
      ORDER,
      jsonResponse(200, orderBody({ captures: [{ id: SYNTH.captureId, status: "COMPLETED" }] })),
      jsonResponse(200, orderBody({ captures: [{ id: "SYNTH-CAPTURE-2", status: "PENDING" }, { id: "SYNTH-CAPTURE-3", status: "NEW" }] })),
      jsonResponse(200, orderBody()),
    );
    expect(await adapter.getOrder(SYNTH.orderId)).toMatchObject({
      order: { captures: [{ id: SYNTH.captureId, statusRaw: "COMPLETED", state: "completed" }] },
    });
    expect(await adapter.getOrder(SYNTH.orderId)).toMatchObject({
      order: {
        captures: [
          { id: "SYNTH-CAPTURE-2", statusRaw: "PENDING", state: "pending" },
          { id: "SYNTH-CAPTURE-3", statusRaw: "NEW", state: "unknown" },
        ],
      },
    });
    expect(await adapter.getOrder(SYNTH.orderId)).toMatchObject({ order: { captures: [] } });
  });
});

describe("secrets", () => {
  it("never appear in any write result", async () => {
    const adapter = setup();
    fake.on("POST", CAPTURE, jsonResponse(201, captureBody()), E1_REFUSAL("PREVIOUSLY_CAPTURED"), jsonResponse(500, {}));
    fake.on("POST", VOID, emptyResponse(204));
    fake.on("GET", AUTH, jsonResponse(200, authorizationBody({ status: "VOIDED" })));
    const results = [
      await adapter.captureAuthorization(INPUT),
      await adapter.captureAuthorization({ ...INPUT, attemptId: "attempt-2" }),
      await adapter.captureAuthorization({ ...INPUT, attemptId: "attempt-3" }),
      await adapter.voidAuthorization(INPUT),
    ];
    const text = JSON.stringify(results);
    for (const secret of [SYNTH.clientSecret, SYNTH.accessToken, "Basic ", "Bearer "]) {
      expect(text).not.toContain(secret);
    }
  });
});
