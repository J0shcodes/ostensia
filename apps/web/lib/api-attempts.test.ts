import { describe, expect, it, vi } from "vitest";
import { createApiClient, parseAttemptEnvelope } from "./api.ts";
import type { Fetcher } from "./api.ts";

// The 7b half of the API client: proposals, attempts, settling, reconciling and revoking.
// The same rules as 7a hold: every path is same-origin, nothing is retried, a reply that
// does not match what the API documents is "unexpected" and never shown as understood.

const PROPOSAL = {
  mandateId: "m-1",
  currency: "USD",
  declaredTotalMinor: 1200,
  lines: [{ productId: "ceramic-mug", variantId: "blue", quantity: 1, unitPriceMinor: 1200 }],
};

const ATTEMPT = {
  attemptId: "att-1",
  mandateId: "m-1",
  proposal: PROPOSAL,
  status: "authorized",
  precheck: { decision: "allow", computedTotalMinor: 1200 },
  finalDecision: null,
  orderId: "ORDER123",
  authorizationId: "AUTH123",
  authorization: { state: "created", statusRaw: "CREATED", amountMinor: 1200, currency: "USD", customId: "x", expirationTime: null },
  intendedAction: null,
  captureId: null,
  startedAt: "2026-11-06T10:00:00.000Z",
  updatedAt: "2026-11-06T10:00:01.000Z",
};

const ENVELOPE = { attempt: ATTEMPT, explanation: { precheck: ["All purchase rules passed. The total is $12.00."], final: null } };

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function clientWith(respond: () => Response | Promise<Response>) {
  const fetcher = vi.fn<Fetcher>(async () => respond());
  return { fetcher, client: createApiClient({ fetcher }) };
}

describe("requests", () => {
  it("posts the scenario to build a simulated cart", async () => {
    const { fetcher, client } = clientWith(() => json({}, 400));
    await client.simulatedProposal("m-1", "over_total");
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("/api/mandates/m-1/simulated-proposal");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({ scenario: "over_total" });
  });

  it("sends the agent's mode, and a task only when there is one", async () => {
    const withTask = clientWith(() => json({}, 400));
    await withTask.client.agentProposal("m-1", "informed", "  a desk gift  ");
    expect(JSON.parse(withTask.fetcher.mock.calls[0]![1]?.body as string)).toEqual({ mode: "informed", task: "a desk gift" });

    const without = clientWith(() => json({}, 400));
    await without.client.agentProposal("m-1", "uninformed", "   ");
    expect(JSON.parse(without.fetcher.mock.calls[0]![1]?.body as string)).toEqual({ mode: "uninformed" });
    await without.client.agentProposal("m-1", "uninformed");
    expect(JSON.parse(without.fetcher.mock.calls[1]![1]?.body as string)).toEqual({ mode: "uninformed" });
  });

  it("sends exactly the attempt id, the mandate, the cart and the settle choice", async () => {
    const { fetcher, client } = clientWith(() => json(ENVELOPE, 200));
    await client.createAttempt({ attemptId: "att-1", mandateId: "m-1", proposal: PROPOSAL, settleNow: false });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("/api/attempts");
    expect(JSON.parse(init?.body as string)).toEqual({ attemptId: "att-1", mandateId: "m-1", proposal: PROPOSAL, settleNow: false });
  });

  it("settles and reconciles with a POST and no body, and reads with a GET", async () => {
    const { fetcher, client } = clientWith(() => json({}, 400));
    await client.settleAttempt("att-1");
    await client.reconcileAttempt("att-1");
    await client.getAttempt("att-1");
    await client.getMandate("m-1");
    await client.revokeMandate("m-1");
    const calls = fetcher.mock.calls.map(([url, init]) => [url, init?.method, init?.body]);
    expect(calls).toEqual([
      ["/api/attempts/att-1/settle", "POST", undefined],
      ["/api/attempts/att-1/reconcile", "POST", undefined],
      ["/api/attempts/att-1", "GET", undefined],
      ["/api/mandates/m-1", "GET", undefined],
      ["/api/mandates/m-1/revoke", "POST", undefined],
    ]);
  });

  it("encodes an id in a path, so a strange id cannot reach another route", async () => {
    const { fetcher, client } = clientWith(() => json({}, 404));
    await client.getAttempt("a/b?c#d");
    await client.settleAttempt("../mandates");
    expect(fetcher.mock.calls[0]![0]).toBe("/api/attempts/a%2Fb%3Fc%23d");
    expect(fetcher.mock.calls[1]![0]).toBe("/api/attempts/..%2Fmandates/settle");
  });
});

describe("proposals", () => {
  it("reads a simulated cart", async () => {
    const result = await clientWith(() =>
      json({ simulated: true, label: "Simulated shopping agent", scenario: "compliant", proposal: PROPOSAL }),
    ).client.simulatedProposal("m-1", "compliant");
    expect(result).toMatchObject({ kind: "ok", body: { scenario: "compliant", proposal: { declaredTotalMinor: 1200 } } });
  });

  it("does not accept a simulated cart that is not labelled simulated, or names an unknown scenario", async () => {
    for (const bad of [
      { simulated: false, label: "x", scenario: "compliant", proposal: PROPOSAL },
      { simulated: true, label: "x", scenario: "made_up", proposal: PROPOSAL },
      { simulated: true, label: "x", scenario: "compliant", proposal: { ...PROPOSAL, lines: [{ productId: "a" }] } },
    ]) {
      expect((await clientWith(() => json(bad)).client.simulatedProposal("m-1", "compliant")).kind).toBe("unexpected");
    }
  });

  it("keeps the reason a scenario cannot be built", async () => {
    const result = await clientWith(() => json({ error: "scenario_not_buildable", simulated: true, reason: "No product fits." }, 422)).client.simulatedProposal("m-1", "compliant");
    expect(result).toMatchObject({ kind: "api_error", status: 422, error: "scenario_not_buildable", body: { reason: "No product fits." } });
  });

  const agent = {
    aiGenerated: true,
    simulatedShop: true,
    label: "AI shopping agent",
    mode: "informed",
    modeNote: "The agent was shown the mandate's limits.",
    rationale: "Two mugs for the desk.",
  };

  it("reads an agent's cart", async () => {
    const result = await clientWith(() => json({ ...agent, proposal: PROPOSAL, declined: null })).client.agentProposal("m-1", "informed");
    expect(result).toMatchObject({ kind: "ok", body: { mode: "informed", declinedReason: null, proposal: { mandateId: "m-1" } } });
  });

  it("reads a decline as an answer, with its reason", async () => {
    const result = await clientWith(() => json({ ...agent, proposal: null, declined: { reason: "Nothing fits." } })).client.agentProposal("m-1", "informed");
    expect(result).toMatchObject({ kind: "ok", body: { proposal: null, declinedReason: "Nothing fits." } });
  });

  it("does not accept an agent answer that is both a cart and a decline, or neither, or not marked AI", async () => {
    for (const bad of [
      { ...agent, proposal: PROPOSAL, declined: { reason: "x" } },
      { ...agent, proposal: null, declined: null },
      { ...agent, aiGenerated: false, proposal: PROPOSAL, declined: null },
      { ...agent, mode: "other", proposal: PROPOSAL, declined: null },
    ]) {
      expect((await clientWith(() => json(bad)).client.agentProposal("m-1", "informed")).kind).toBe("unexpected");
    }
  });
});

describe("attempts", () => {
  it("reads an attempt with its explanations", async () => {
    const result = await clientWith(() => json(ENVELOPE)).client.getAttempt("att-1");
    expect(result).toMatchObject({
      kind: "ok",
      body: {
        attempt: { status: "authorized", orderId: "ORDER123", precheck: { decision: "allow", computedTotalMinor: 1200 } },
        explanation: { precheck: ["All purchase rules passed. The total is $12.00."], final: null },
        events: null,
      },
    });
  });

  it("reduces audit events to their type, outcome and detail", async () => {
    const events = [
      { v: 1, at: "t", type: "order_result", attemptId: "att-1", outcome: "created", orderId: "ORDER123", authorizationId: "AUTH123", detail: "created" },
      { v: 1, at: "t", type: "attempt_started", attemptId: "att-1", mandateId: "m-1", proposal: PROPOSAL },
    ];
    const result = await clientWith(() => json({ ...ENVELOPE, events })).client.getAttempt("att-1");
    expect(result).toMatchObject({
      kind: "ok",
      body: { events: [{ type: "order_result", outcome: "created", detail: "created" }, { type: "attempt_started", outcome: null, detail: null }] },
    });
  });

  it("reads a block decision without needing its violations", async () => {
    const blocked = { ...ATTEMPT, status: "blocked_precheck", precheck: { decision: "block", violations: [{ code: "TOTAL_EXCEEDED" }] }, orderId: null, authorizationId: null, authorization: null };
    const result = await clientWith(() => json({ attempt: blocked, explanation: { precheck: ["The total is above the limit."], final: null } })).client.getAttempt("att-1");
    expect(result).toMatchObject({ kind: "ok", body: { attempt: { status: "blocked_precheck", precheck: { decision: "block" } } } });
  });

  it("does not accept an attempt with a status the gate does not have", async () => {
    const result = await clientWith(() => json({ ...ENVELOPE, attempt: { ...ATTEMPT, status: "approved" } })).client.getAttempt("att-1");
    expect(result.kind).toBe("unexpected");
  });

  it("does not accept an attempt whose parts are the wrong shape", async () => {
    for (const bad of [
      { ...ENVELOPE, attempt: { ...ATTEMPT, proposal: { ...PROPOSAL, lines: "none" } } },
      { ...ENVELOPE, attempt: { ...ATTEMPT, precheck: { decision: "maybe" } } },
      { ...ENVELOPE, attempt: { ...ATTEMPT, orderId: 5 } },
      { ...ENVELOPE, attempt: { ...ATTEMPT, authorization: { state: 1 } } },
      { ...ENVELOPE, explanation: { precheck: [1], final: null } },
      { ...ENVELOPE, explanation: null },
      { ...ENVELOPE, events: "none" },
      { attempt: null },
    ]) {
      expect((await clientWith(() => json(bad)).client.getAttempt("att-1")).kind).toBe("unexpected");
    }
  });

  it("reads a reconcile answer, and rejects an outcome it does not know", async () => {
    const ok = await clientWith(() => json({ ...ENVELOPE, outcome: "unchanged" })).client.reconcileAttempt("att-1");
    expect(ok).toMatchObject({ kind: "ok", body: { outcome: "unchanged", attempt: { attemptId: "att-1" } } });
    const bad = await clientWith(() => json({ ...ENVELOPE, outcome: "settled" })).client.reconcileAttempt("att-1");
    expect(bad.kind).toBe("unexpected");
  });

  it("keeps the attempt that comes with a refused settle, so the page can show it", async () => {
    const result = await clientWith(() => json({ error: "read_failed", detail: "reason=timeout", ...ENVELOPE }, 502)).client.settleAttempt("att-1");
    expect(result.kind).toBe("api_error");
    if (result.kind === "api_error") {
      expect(result.error).toBe("read_failed");
      expect(parseAttemptEnvelope(result.body)?.attempt.status).toBe("authorized");
    }
  });

  it("parses nothing from a body that is not an attempt", () => {
    expect(parseAttemptEnvelope({ error: "read_failed" })).toBeNull();
    expect(parseAttemptEnvelope(null)).toBeNull();
    expect(parseAttemptEnvelope("x")).toBeNull();
  });

  it("keeps the attempt that holds a mandate when it is in use", async () => {
    const result = await clientWith(() => json({ error: "mandate_in_use", byAttemptId: "att-0" }, 409)).client.createAttempt({ attemptId: "att-1", mandateId: "m-1", proposal: PROPOSAL, settleNow: false });
    expect(result).toMatchObject({ kind: "api_error", status: 409, error: "mandate_in_use", body: { byAttemptId: "att-0" } });
  });
});

describe("a reply that did not come back", () => {
  const request = { attemptId: "att-1", mandateId: "m-1", proposal: PROPOSAL, settleNow: true };

  it("is unreachable, and the request is sent once and never repeated by the client", async () => {
    const fetcher = vi.fn<Fetcher>(async () => {
      throw new TypeError("network down");
    });
    const result = await createApiClient({ fetcher }).createAttempt(request);
    expect(result).toEqual({ kind: "unreachable", reason: "network" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("treats the proxy's plain-text 500 as unreachable, not as a refusal", async () => {
    const fetcher = vi.fn<Fetcher>(async () => new Response("Internal Server Error", { status: 500 }));
    const result = await createApiClient({ fetcher }).settleAttempt("att-1");
    expect(result).toEqual({ kind: "unreachable", reason: "non_json" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reports a timeout, and sends once", async () => {
    const fetcher = vi.fn<Fetcher>(async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
    const result = await createApiClient({ fetcher }).reconcileAttempt("att-1");
    expect(result).toEqual({ kind: "unreachable", reason: "timeout" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("sends the identical request, with the same attempt id, when the caller sends it again", async () => {
    const fetcher = vi.fn<Fetcher>(async () => json(ENVELOPE));
    const client = createApiClient({ fetcher });
    await client.createAttempt(request);
    await client.createAttempt(request);
    expect(fetcher.mock.calls[0]![1]?.body).toBe(fetcher.mock.calls[1]![1]?.body);
  });
});
