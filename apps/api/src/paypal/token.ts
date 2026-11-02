import { z } from "zod";
import { paypalFetch } from "./http.ts";
import type { FetchFn } from "./http.ts";

// OAuth client-credentials token, as in the E-1 collection (00.1). The token and
// the secret only ever appear in the Authorization headers sent to PayPal. They
// are never part of a result, an error or a log line.

export type TokenFailure = "rejected" | "unavailable" | "unreadable";

export type TokenResult =
  | { readonly kind: "ok"; readonly token: string }
  | { readonly kind: "failed"; readonly failure: TokenFailure };

export type TokenProvider = {
  getToken(): Promise<TokenResult>;
  // Called after a 401 so the next call fetches a fresh token. It is not a
  // retry: the failed call is not repeated.
  invalidate(): void;
};

export type TokenProviderOptions = {
  readonly fetch: FetchFn;
  readonly timeoutMs: number;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly now: () => number;
};

const TokenResponseSchema = z.looseObject({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
});

// A token this close to expiry is treated as expired.
const REFRESH_MARGIN_MS = 60_000;

export function createTokenProvider(options: TokenProviderOptions): TokenProvider {
  const deps = { fetch: options.fetch, timeoutMs: options.timeoutMs };
  const basic = Buffer.from(`${options.clientId}:${options.clientSecret}`, "utf8").toString("base64");
  let cached: { token: string; expiresAtMs: number } | null = null;
  let inflight: Promise<TokenResult> | null = null;

  async function fetchToken(): Promise<TokenResult> {
    const outcome = await paypalFetch(deps, {
      method: "POST",
      path: "/v1/oauth2/token",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (outcome.kind === "no_response") return { kind: "failed", failure: "unavailable" };
    if (outcome.status === 200) {
      const parsed = outcome.body.kind === "json" ? TokenResponseSchema.safeParse(outcome.body.value) : null;
      if (parsed === null || !parsed.success) return { kind: "failed", failure: "unreadable" };
      cached = {
        token: parsed.data.access_token,
        expiresAtMs: options.now() + parsed.data.expires_in * 1000,
      };
      return { kind: "ok", token: parsed.data.access_token };
    }
    return { kind: "failed", failure: outcome.status >= 400 && outcome.status < 500 ? "rejected" : "unavailable" };
  }

  return {
    async getToken() {
      if (cached !== null && options.now() < cached.expiresAtMs - REFRESH_MARGIN_MS) {
        return { kind: "ok", token: cached.token };
      }
      // One token request at a time, so concurrent calls share the result.
      inflight ??= fetchToken().finally(() => {
        inflight = null;
      });
      return inflight;
    },
    invalidate() {
      cached = null;
    },
  };
}
