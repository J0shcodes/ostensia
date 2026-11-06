import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api.ts";
import type { Fetcher } from "./api.ts";

const MANDATE = {
  id: "m-1",
  version: 1,
  terms: {
    currency: "USD" as const,
    maxTotalMinor: 500,
    expiresAt: "2030-01-15T17:00:00.000Z",
    items: [{ productId: "sticker-pack", maxQuantity: 2, maxUnitPriceMinor: 150 }],
  },
  intentSummary: "Two sticker packs",
  confirmedAt: "2026-11-06T10:00:00.000Z",
  status: "confirmed",
  hash: "a".repeat(64),
};

const DRAFT = {
  intentSummary: "Two sticker packs",
  currency: "USD",
  maxTotalMinor: 500,
  items: [{ productId: "sticker-pack", maxQuantity: 2, maxUnitPriceMinor: 150 }],
  expiresAt: null,
  notes: [],
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function clientWith(respond: () => Response | Promise<Response>) {
  const fetcher = vi.fn<Fetcher>(async () => respond());
  return { fetcher, client: createApiClient({ fetcher }) };
}

describe("requests", () => {
  it("calls only same-origin /api paths, with no body on a GET", async () => {
    const { fetcher, client } = clientWith(() => json({ status: "ok", domain: "@ostensia/domain" }));
    await client.getHealth();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("/api/health");
    expect(init?.method).toBe("GET");
    expect(init?.cache).toBe("no-store");
    expect(init?.body).toBeUndefined();
    expect(init?.headers).toBeUndefined();
  });

  it("posts a draft request as JSON", async () => {
    const { fetcher, client } = clientWith(() => json({}, 400));
    await client.draftMandate("two sticker packs");
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("/api/mandates/draft");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(init?.body as string)).toEqual({ instruction: "two sticker packs" });
  });

  it("posts exactly the terms and the summary to confirm a mandate", async () => {
    const { fetcher, client } = clientWith(() => json({ mandate: MANDATE }, 201));
    await client.createMandate(MANDATE.terms, "Two sticker packs");
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("/api/mandates");
    expect(JSON.parse(init?.body as string)).toEqual({ terms: MANDATE.terms, intentSummary: "Two sticker packs" });
  });

  it("lists mandates with a GET", async () => {
    const { fetcher, client } = clientWith(() => json({ mandates: [] }));
    await client.listMandates();
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/mandates");
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe("GET");
  });
});

describe("results", () => {
  it("reads health", async () => {
    expect((await clientWith(() => json({ status: "ok", domain: "x" })).client.getHealth()).kind).toBe("ok");
  });

  it("does not call a different JSON answer healthy", async () => {
    expect((await clientWith(() => json({ status: "degraded" })).client.getHealth()).kind).toBe("unexpected");
  });

  it("reads a confirmed mandate with the domain's own schema", async () => {
    const result = await clientWith(() => json({ mandate: MANDATE }, 201)).client.createMandate(MANDATE.terms, "x");
    expect(result).toMatchObject({ kind: "ok", status: 201, body: { mandate: { id: "m-1", status: "confirmed" } } });
  });

  it("does not trust a mandate that does not match the schema", async () => {
    for (const bad of [{ mandate: { ...MANDATE, hash: "short" } }, { mandate: { ...MANDATE, status: "pending" } }, { mandate: null }, {}]) {
      const result = await clientWith(() => json(bad, 201)).client.createMandate(MANDATE.terms, "x");
      expect(result.kind).toBe("unexpected");
    }
  });

  it("reports an error the API sent, with its code and body", async () => {
    const result = await clientWith(() => json({ error: "invalid_mandate" }, 400)).client.createMandate(MANDATE.terms, "x");
    expect(result).toEqual({ kind: "api_error", status: 400, error: "invalid_mandate", body: { error: "invalid_mandate" } });
  });

  it("keeps extra fields of an API error, such as a reason", async () => {
    const result = await clientWith(() => json({ error: "drafting_unavailable", reason: "not_configured" }, 503)).client.draftMandate("x");
    expect(result).toMatchObject({ kind: "api_error", status: 503, error: "drafting_unavailable", body: { reason: "not_configured" } });
  });

  it("treats a JSON error without an error code as unexpected", async () => {
    expect((await clientWith(() => json({ message: "x" }, 400)).client.getHealth()).kind).toBe("unexpected");
  });

  it("treats a 5xx the proxy answered in plain text as unreachable", async () => {
    // What Next.js sends when the API is down or answers after its timeout.
    const result = await clientWith(() => new Response("Internal Server Error", { status: 500 })).client.getHealth();
    expect(result).toEqual({ kind: "unreachable", reason: "non_json" });
    for (const status of [502, 503, 504]) {
      expect(await clientWith(() => new Response("Bad Gateway", { status })).client.getHealth()).toEqual({
        kind: "unreachable",
        reason: "non_json",
      });
    }
  });

  it("does not call the API's own JSON 500 unreachable: that is the API speaking", async () => {
    const result = await clientWith(() => json({ error: "internal_error" }, 500)).client.getHealth();
    expect(result).toMatchObject({ kind: "api_error", status: 500, error: "internal_error" });
  });

  it("treats a non-JSON answer that is not a server error as unexpected", async () => {
    expect(await clientWith(() => new Response("<html>Not found</html>", { status: 404 })).client.getHealth()).toEqual({
      kind: "unexpected",
      status: 404,
    });
    expect(await clientWith(() => new Response("hello", { status: 200 })).client.getHealth()).toEqual({
      kind: "unexpected",
      status: 200,
    });
  });

  it("treats a rejected fetch as unreachable", async () => {
    const fetcher: Fetcher = async () => {
      throw new TypeError("fetch failed");
    };
    expect(await createApiClient({ fetcher }).getHealth()).toEqual({ kind: "unreachable", reason: "network" });
  });

  it("treats a body that cannot be read as unreachable", async () => {
    const fetcher: Fetcher = async () => {
      const response = new Response("x");
      response.text = async () => {
        throw new TypeError("terminated");
      };
      return response;
    };
    expect(await createApiClient({ fetcher }).getHealth()).toEqual({ kind: "unreachable", reason: "network" });
  });

  it("stops waiting after its own timeout and says it was a timeout", async () => {
    const fetcher: Fetcher = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    const result = await createApiClient({ fetcher, timeoutMs: 25 }).getHealth();
    expect(result).toEqual({ kind: "unreachable", reason: "timeout" });
  });

  it("never retries", async () => {
    const { fetcher, client } = clientWith(() => new Response("Internal Server Error", { status: 500 }));
    await client.createMandate(MANDATE.terms, "x");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("catalogue", () => {
  const catalogue = {
    simulated: true,
    label: "Simulated shopping agent",
    products: [{ productId: "sticker-pack", name: "Sticker pack", unitPriceMinor: 100, variantIds: ["matte", "gloss"] }],
  };

  it("reads the simulated catalogue", async () => {
    const result = await clientWith(() => json(catalogue)).client.getCatalogue();
    expect(result).toEqual({
      kind: "ok",
      status: 200,
      body: { label: "Simulated shopping agent", products: catalogue.products },
    });
  });

  it("refuses a catalogue that is not marked simulated", async () => {
    expect((await clientWith(() => json({ ...catalogue, simulated: false })).client.getCatalogue()).kind).toBe("unexpected");
  });

  it("refuses a malformed product", async () => {
    for (const product of [
      { productId: "p", name: "P", unitPriceMinor: "100", variantIds: [] },
      { productId: "p", name: "P", unitPriceMinor: 100, variantIds: [1] },
      { name: "P", unitPriceMinor: 100, variantIds: [] },
    ]) {
      expect((await clientWith(() => json({ ...catalogue, products: [product] })).client.getCatalogue()).kind).toBe("unexpected");
    }
  });
});

describe("draft response", () => {
  const complete = {
    aiGenerated: true,
    label: "AI-generated draft.",
    draft: DRAFT,
    completeness: { status: "complete", terms: MANDATE.terms, missing: [], problems: [] },
    warnings: [],
  };
  const incomplete = {
    ...complete,
    completeness: { status: "incomplete", missing: ["expiresAt"], problems: [] },
    warnings: ["Product x is not in the catalogue."],
  };

  it("reads a complete draft", async () => {
    const result = await clientWith(() => json(complete)).client.draftMandate("x");
    expect(result).toMatchObject({ kind: "ok", body: { label: "AI-generated draft.", completeness: { status: "complete" } } });
  });

  it("reads an incomplete draft with what is missing and the warnings", async () => {
    const result = await clientWith(() => json(incomplete)).client.draftMandate("x");
    expect(result).toMatchObject({
      kind: "ok",
      body: { completeness: { status: "incomplete", missing: ["expiresAt"] }, warnings: ["Product x is not in the catalogue."] },
    });
  });

  it("refuses a response that is not marked AI-generated", async () => {
    expect((await clientWith(() => json({ ...complete, aiGenerated: false })).client.draftMandate("x")).kind).toBe("unexpected");
  });

  it.each([
    ["a draft with a wrong field type", { ...complete, draft: { ...DRAFT, maxTotalMinor: "500" } }],
    ["a draft item with a wrong field type", { ...complete, draft: { ...DRAFT, items: [{ productId: 1, maxQuantity: 1, maxUnitPriceMinor: 1 }] } }],
    ["a draft in another currency", { ...complete, draft: { ...DRAFT, currency: "EUR" } }],
    ["unknown completeness", { ...complete, completeness: { status: "maybe", missing: [], problems: [] } }],
    ["warnings that are not text", { ...complete, warnings: [1] }],
    ["no draft", { ...complete, draft: undefined }],
  ])("refuses %s", async (_name, body) => {
    expect((await clientWith(() => json(body)).client.draftMandate("x")).kind).toBe("unexpected");
  });
});

describe("mandate list", () => {
  it("returns the valid mandates and skips malformed entries", async () => {
    const result = await clientWith(() => json({ mandates: [MANDATE, { id: "broken" }, { ...MANDATE, id: "m-2" }] })).client.listMandates();
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.body.mandates.map((m) => m.id)).toEqual(["m-1", "m-2"]);
  });

  it("refuses an answer with no list", async () => {
    expect((await clientWith(() => json({ mandates: "none" })).client.listMandates()).kind).toBe("unexpected");
  });
});
