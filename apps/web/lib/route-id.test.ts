import { describe, expect, it } from "vitest";
import { createApiClient } from "./api.ts";
import type { Fetcher } from "./api.ts";
import { decodeRouteId } from "./route-id.ts";

describe("decodeRouteId", () => {
  it("leaves an ordinary id alone", () => {
    expect(decodeRouteId("668d7cbd-459c-419b-aa89-8f637d2d7a9e")).toBe("668d7cbd-459c-419b-aa89-8f637d2d7a9e");
  });

  it("decodes a character the address bar encoded, such as the colon the API allows", () => {
    expect(decodeRouteId("run%3A1")).toBe("run:1");
  });

  it("leaves a malformed escape as it is instead of throwing", () => {
    expect(decodeRouteId("bad%E0%A4%A")).toBe("bad%E0%A4%A");
    expect(decodeRouteId("100%")).toBe("100%");
  });

  it("together with the client, sends the id the link named exactly once-encoded", async () => {
    const urls: string[] = [];
    const fetcher: Fetcher = async (input) => {
      urls.push(input);
      return new Response(JSON.stringify({ error: "attempt_not_found" }), { status: 404, headers: { "content-type": "application/json" } });
    };
    await createApiClient({ fetcher }).getAttempt(decodeRouteId("run%3A1"));
    // Without decoding first, this would be /api/attempts/run%253A1.
    expect(urls).toEqual(["/api/attempts/run%3A1"]);
  });
});
