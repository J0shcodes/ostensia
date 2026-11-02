import { describe, expect, it } from "vitest";
import { paypalFetch } from "./http.ts";
import type { FetchFn } from "./http.ts";
import { createFakeFetch, emptyResponse, jsonResponse, textResponse } from "./test-support.ts";

const get = (path: string) => ({ method: "GET" as const, path, headers: { Authorization: "Bearer synthetic" } });

describe("paypalFetch: the request", () => {
  it("calls the sandbox host with the method, headers and body given", async () => {
    const fake = createFakeFetch();
    fake.on("POST", "/v2/checkout/orders", jsonResponse(201, { ok: true }));
    await paypalFetch(
      { fetch: fake.fetch, timeoutMs: 1000 },
      { method: "POST", path: "/v2/checkout/orders", headers: { "X-Test": "1" }, body: '{"a":1}' },
    );
    const [call] = fake.calls;
    expect(call?.url).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders");
    expect(call?.method).toBe("POST");
    expect(call?.headers).toEqual({ "X-Test": "1" });
    expect(call?.body).toBe('{"a":1}');
  });

  it("never follows redirects, and always sets a timeout signal", async () => {
    const fake = createFakeFetch();
    fake.on("GET", "/v2/x", jsonResponse(200, {}));
    await paypalFetch({ fetch: fake.fetch, timeoutMs: 1000 }, get("/v2/x"));
    expect(fake.calls[0]?.redirect).toBe("error");
    expect(fake.calls[0]?.hasSignal).toBe(true);
  });

  it("sends no body on a GET", async () => {
    const fake = createFakeFetch();
    fake.on("GET", "/v2/x", jsonResponse(200, {}));
    await paypalFetch({ fetch: fake.fetch, timeoutMs: 1000 }, get("/v2/x"));
    expect(fake.calls[0]?.body).toBeNull();
  });
});

describe("paypalFetch: the sandbox guard", () => {
  it.each([
    "https://evil.example.test/x",
    "//evil.example.test/x",
    "relative/path",
    "/a/../b",
    "//evil.example.test",
    "///evil.example.test/x",
    "/a?b=1",
    "/a#b",
    "/a b",
    "/a\\b",
    "",
  ])("refuses the path %j and makes no call", async (path) => {
    const fake = createFakeFetch();
    await expect(paypalFetch({ fetch: fake.fetch, timeoutMs: 1000 }, get(path))).rejects.toThrow(
      "outside the PayPal sandbox",
    );
    expect(fake.calls).toHaveLength(0);
  });
});

describe("paypalFetch: when there is no response", () => {
  it("reports a timeout from the fetch layer", async () => {
    const fake = createFakeFetch();
    fake.on("GET", "/v2/x", "timeout");
    expect(await paypalFetch({ fetch: fake.fetch, timeoutMs: 1000 }, get("/v2/x"))).toEqual({
      kind: "no_response",
      reason: "timeout",
    });
  });

  it("reports a network error", async () => {
    const fake = createFakeFetch();
    fake.on("GET", "/v2/x", "network");
    expect(await paypalFetch({ fetch: fake.fetch, timeoutMs: 1000 }, get("/v2/x"))).toEqual({
      kind: "no_response",
      reason: "network",
    });
  });

  it("really times out when the server never answers", async () => {
    const hanging: FetchFn = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    const started = Date.now();
    const outcome = await paypalFetch({ fetch: hanging, timeoutMs: 30 }, get("/v2/x"));
    expect(outcome).toEqual({ kind: "no_response", reason: "timeout" });
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe("paypalFetch: the body", () => {
  const run = async (response: Response) => {
    const fake = createFakeFetch();
    fake.on("GET", "/v2/x", response);
    return paypalFetch({ fetch: fake.fetch, timeoutMs: 1000 }, get("/v2/x"));
  };

  it("parses a JSON body", async () => {
    expect(await run(jsonResponse(200, { a: 1 }))).toMatchObject({
      kind: "response",
      status: 200,
      body: { kind: "json", value: { a: 1 } },
    });
  });

  it("reports an empty body, for example after a 204", async () => {
    expect(await run(emptyResponse(204))).toMatchObject({ status: 204, body: { kind: "empty" } });
  });

  it("reports text that is not JSON as unreadable, keeping the status", async () => {
    expect(await run(textResponse(502, "<html>bad gateway</html>"))).toMatchObject({
      status: 502,
      body: { kind: "unreadable" },
    });
  });

  it("reports a body over the size cap as unreadable", async () => {
    expect(await run(textResponse(200, JSON.stringify({ pad: "x".repeat(1_000_001) })))).toMatchObject({
      body: { kind: "unreadable" },
    });
  });

  it("reports a body that fails part-way as unreadable, keeping the status", async () => {
    const broken = {
      status: 201,
      headers: new Headers(),
      text: () => Promise.reject(new Error("connection reset")),
    } as unknown as Response;
    expect(await run(broken)).toMatchObject({ kind: "response", status: 201, body: { kind: "unreadable" } });
  });
});

describe("paypalFetch: the debug id", () => {
  const run = async (headers: Record<string, string>) => {
    const fake = createFakeFetch();
    fake.on("GET", "/v2/x", jsonResponse(200, {}, headers));
    return paypalFetch({ fetch: fake.fetch, timeoutMs: 1000 }, get("/v2/x"));
  };

  it("returns a well-formed paypal-debug-id", async () => {
    expect(await run({ "paypal-debug-id": "abc123_DEF-4" })).toMatchObject({ debugId: "abc123_DEF-4" });
  });

  it.each(["has space", "x".repeat(65), "bad/char", ""])("drops the malformed value %j", async (value) => {
    expect(await run({ "paypal-debug-id": value })).toMatchObject({ debugId: null });
  });

  it("is null when the header is absent", async () => {
    expect(await run({})).toMatchObject({ debugId: null });
  });
});
