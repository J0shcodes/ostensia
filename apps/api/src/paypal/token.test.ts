import { describe, expect, it } from "vitest";
import { createTokenProvider } from "./token.ts";
import { SYNTH, createFakeFetch, emptyResponse, jsonResponse, textResponse, tokenBody } from "./test-support.ts";
import type { Step } from "./test-support.ts";

const TOKEN_PATH = "/v1/oauth2/token";

function setup(...steps: Step[]) {
  const fake = createFakeFetch();
  fake.on("POST", TOKEN_PATH, ...steps);
  let clock = 1_000_000;
  const provider = createTokenProvider({
    fetch: fake.fetch,
    timeoutMs: 1000,
    clientId: SYNTH.clientId,
    clientSecret: SYNTH.clientSecret,
    now: () => clock,
  });
  return { fake, provider, advance: (ms: number) => (clock += ms) };
}

describe("token request", () => {
  it("posts client credentials with Basic auth, as in the E-1 collection", async () => {
    const { fake, provider } = setup(jsonResponse(200, tokenBody()));
    expect(await provider.getToken()).toEqual({ kind: "ok", token: SYNTH.accessToken });

    const [call] = fake.calls;
    const expectedBasic = Buffer.from(`${SYNTH.clientId}:${SYNTH.clientSecret}`).toString("base64");
    expect(call?.url).toBe("https://api-m.sandbox.paypal.com/v1/oauth2/token");
    expect(call?.method).toBe("POST");
    expect(call?.headers).toEqual({
      Authorization: `Basic ${expectedBasic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    });
    expect(call?.body).toBe("grant_type=client_credentials");
  });
});

describe("token cache", () => {
  it("reuses a token that is still valid", async () => {
    const { fake, provider, advance } = setup(jsonResponse(200, tokenBody(3600)));
    await provider.getToken();
    advance(3_539_999);
    expect(await provider.getToken()).toEqual({ kind: "ok", token: SYNTH.accessToken });
    expect(fake.calls).toHaveLength(1);
  });

  it("refreshes once the token is within 60 seconds of expiry", async () => {
    const { fake, provider, advance } = setup(jsonResponse(200, tokenBody(3600)), jsonResponse(200, tokenBody(3600)));
    await provider.getToken();
    advance(3_540_000);
    await provider.getToken();
    expect(fake.calls).toHaveLength(2);
  });

  it("shares one request between concurrent callers", async () => {
    const { fake, provider } = setup(jsonResponse(200, tokenBody()));
    const results = await Promise.all([provider.getToken(), provider.getToken(), provider.getToken()]);
    expect(results.every((result) => result.kind === "ok")).toBe(true);
    expect(fake.calls).toHaveLength(1);
  });

  it("fetches a new token after invalidate()", async () => {
    const { fake, provider } = setup(jsonResponse(200, tokenBody()), jsonResponse(200, tokenBody()));
    await provider.getToken();
    provider.invalidate();
    await provider.getToken();
    expect(fake.calls).toHaveLength(2);
  });

  it("does not cache a failure", async () => {
    const { fake, provider } = setup(jsonResponse(401, { error: "invalid_client" }), jsonResponse(200, tokenBody()));
    expect(await provider.getToken()).toEqual({ kind: "failed", failure: "rejected" });
    expect(await provider.getToken()).toEqual({ kind: "ok", token: SYNTH.accessToken });
    expect(fake.calls).toHaveLength(2);
  });
});

describe("token failures", () => {
  it.each<[string, Step, string]>([
    ["401 (bad credentials)", jsonResponse(401, { error: "invalid_client" }), "rejected"],
    ["400", jsonResponse(400, {}), "rejected"],
    ["500", jsonResponse(500, {}), "unavailable"],
    ["503", jsonResponse(503, {}), "unavailable"],
    ["a timeout", "timeout", "unavailable"],
    ["a network error", "network", "unavailable"],
    ["a 200 with no body", emptyResponse(200), "unreadable"],
    ["a 200 that is not JSON", textResponse(200, "nope"), "unreadable"],
    ["a 200 without access_token", jsonResponse(200, { expires_in: 100 }), "unreadable"],
    ["a 200 with an empty access_token", jsonResponse(200, { access_token: "", expires_in: 100 }), "unreadable"],
    ["a 200 without expires_in", jsonResponse(200, { access_token: "t" }), "unreadable"],
    ["a 200 with expires_in 0", jsonResponse(200, { access_token: "t", expires_in: 0 }), "unreadable"],
    ["a 200 with a string expires_in", jsonResponse(200, { access_token: "t", expires_in: "100" }), "unreadable"],
  ])("reports %s as %s", async (_label, step, failure) => {
    const { provider } = setup(step);
    expect(await provider.getToken()).toEqual({ kind: "failed", failure });
  });

  it("never puts the secret or the credentials header in a failure", async () => {
    const { provider } = setup(jsonResponse(401, { error: "invalid_client", echoed: SYNTH.clientSecret }));
    const text = JSON.stringify(await provider.getToken());
    expect(text).not.toContain(SYNTH.clientSecret);
    expect(text).not.toContain(SYNTH.clientId);
    expect(text).not.toContain("Basic");
  });
});
