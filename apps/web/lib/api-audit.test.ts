import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api.ts";
import type { Fetcher } from "./api.ts";

// The 7c half of the API client: the list of attempts, and the fields of the audit events
// that the audit record shows. Same rules as before: same-origin, never retried, and a
// reply that is not what the API documents is "unexpected", not shown as if understood.

const PROPOSAL = {
  mandateId: "m-1",
  currency: "USD",
  declaredTotalMinor: 1200,
  lines: [{ productId: "ceramic-mug", variantId: "blue", quantity: 1, unitPriceMinor: 1200 }],
};

const attempt = (id: string, status = "authorized") => ({
  attemptId: id,
  mandateId: "m-1",
  proposal: PROPOSAL,
  status,
  precheck: { decision: "allow", computedTotalMinor: 1200 },
  finalDecision: null,
  orderId: null,
  authorizationId: null,
  authorization: null,
  captureId: null,
  startedAt: "2026-11-07T10:00:00.000Z",
  updatedAt: "2026-11-07T10:00:01.000Z",
});

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function clientWith(respond: () => Response | Promise<Response>) {
  const fetcher = vi.fn<Fetcher>(async () => respond());
  return { fetcher, client: createApiClient({ fetcher }) };
}

describe("listing attempts", () => {
  it("reads GET /attempts through the same-origin rewrite, once", async () => {
    const { fetcher, client } = clientWith(() => json({ attempts: [] }));
    await client.listAttempts();
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("/api/attempts");
    expect(init?.method).toBe("GET");
  });

  it("returns the attempts in the order the API sent them", async () => {
    const { client } = clientWith(() => json({ attempts: [attempt("b"), attempt("a", "captured")] }));
    const result = await client.listAttempts();
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.body.attempts.map((entry) => entry.attemptId)).toEqual(["b", "a"]);
  });

  it("reads an empty list", async () => {
    const result = await clientWith(() => json({ attempts: [] })).client.listAttempts();
    expect(result).toMatchObject({ kind: "ok", body: { attempts: [] } });
  });

  it("reports a list with one record it does not understand, instead of skipping the record", async () => {
    const result = await clientWith(() => json({ attempts: [attempt("a"), attempt("b", "approved")] })).client.listAttempts();
    expect(result).toEqual({ kind: "unexpected", status: 200 });
  });

  it("reports a body that is not a list", async () => {
    expect(await clientWith(() => json({ attempts: "none" })).client.listAttempts()).toEqual({ kind: "unexpected", status: 200 });
    expect(await clientWith(() => json({})).client.listAttempts()).toEqual({ kind: "unexpected", status: 200 });
  });

  it("is unreachable, never retried, when the proxy gives up", async () => {
    const { fetcher, client } = clientWith(() => new Response("Internal Server Error", { status: 500 }));
    expect(await client.listAttempts()).toEqual({ kind: "unreachable", reason: "non_json" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("the fields of an audit event", () => {
  const read = async (events: unknown) => {
    const result = await clientWith(() =>
      json({ attempt: attempt("att-1"), explanation: { precheck: null, final: null }, events }),
    ).client.getAttempt("att-1");
    if (result.kind !== "ok") throw new Error(`not ok: ${result.kind}`);
    return result.body.events;
  };

  it("keeps the time, the action, the ids and the outcome of the decision", async () => {
    const events = await read([
      { v: 1, at: "2026-11-07T10:00:00.000Z", type: "precheck_decided", attemptId: "att-1", decision: { decision: "allow", computedTotalMinor: 1200 } },
      { v: 1, at: "2026-11-07T10:00:02.000Z", type: "order_result", attemptId: "att-1", outcome: "created", orderId: "ORDER1", authorizationId: "AUTH1", detail: "created" },
      { v: 1, at: "2026-11-07T10:00:03.000Z", type: "write_result", attemptId: "att-1", action: "capture", outcome: "captured", captureId: "CAP1", detail: "ok" },
    ]);
    expect(events).toEqual([
      { type: "precheck_decided", outcome: null, detail: null, at: "2026-11-07T10:00:00.000Z", decision: "allow" },
      { type: "order_result", outcome: "created", detail: "created", at: "2026-11-07T10:00:02.000Z", orderId: "ORDER1", authorizationId: "AUTH1" },
      { type: "write_result", outcome: "captured", detail: "ok", at: "2026-11-07T10:00:03.000Z", action: "capture", captureId: "CAP1" },
    ]);
  });

  it("keeps what PayPal reported about the authorization, and nothing else from it", async () => {
    const events = await read([
      {
        v: 1,
        at: "2026-11-07T10:00:02.000Z",
        type: "authorization_read",
        attemptId: "att-1",
        authorization: { state: "created", statusRaw: "CREATED", amountMinor: 950, currency: "USD", customId: "ref-1", expirationTime: "2026-12-01T00:00:00Z" },
      },
    ]);
    expect(events).toEqual([
      { type: "authorization_read", outcome: null, detail: null, at: "2026-11-07T10:00:02.000Z", authorization: { statusRaw: "CREATED", amountMinor: 950, customId: "ref-1" } },
    ]);
  });

  it("keeps the state of a no_action and the result of a reconcile", async () => {
    const events = await read([
      { v: 1, at: "t", type: "no_action", attemptId: "att-1", authorizationState: "voided" },
      { v: 1, at: "t", type: "reconciled", attemptId: "att-1", authorizationState: "captured", captureStates: ["completed"], result: "captured" },
    ]);
    expect(events).toMatchObject([
      { type: "no_action", authorizationState: "voided" },
      { type: "reconciled", authorizationState: "captured", result: "captured" },
    ]);
  });

  it("ignores an action or a decision it does not know instead of guessing", async () => {
    const events = await read([
      { v: 1, at: "t", type: "write_requested", attemptId: "att-1", action: "refund" },
      { v: 1, at: "t", type: "precheck_decided", attemptId: "att-1", decision: { decision: "maybe" } },
    ]);
    expect(events).toEqual([
      { type: "write_requested", outcome: null, detail: null, at: "t" },
      { type: "precheck_decided", outcome: null, detail: null, at: "t" },
    ]);
  });

  it("leaves out an authorization it cannot read", async () => {
    const events = await read([{ v: 1, at: "t", type: "authorization_read", attemptId: "att-1", authorization: { statusRaw: 3 } }]);
    expect(events).toEqual([{ type: "authorization_read", outcome: null, detail: null, at: "t" }]);
  });
});
