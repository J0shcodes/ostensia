import { PAYPAL_SANDBOX_BASE_URL } from "./paypal-config.ts";

// The one place that talks to PayPal. It never throws for what the network or
// PayPal does: every outcome comes back as a value, so callers cannot forget a
// catch block. A timeout or a network error means the outcome is unknown, not
// that the operation failed (D-010).

export type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

export type HttpDeps = {
  readonly fetch: FetchFn;
  readonly timeoutMs: number;
};

export type HttpRequest = {
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
};

export type HttpBody =
  | { readonly kind: "empty" }
  | { readonly kind: "json"; readonly value: unknown }
  | { readonly kind: "unreadable" };

export type HttpOutcome =
  | {
      readonly kind: "response";
      readonly status: number;
      readonly body: HttpBody;
      readonly debugId: string | null;
    }
  | { readonly kind: "no_response"; readonly reason: "timeout" | "network" };

const MAX_BODY_CHARS = 1_000_000;
const SANDBOX_ORIGIN = new URL(PAYPAL_SANDBOX_BASE_URL).origin;

// Paths are built by our own code from validated ids. This guard is a second
// line of defence: a bug can never send credentials to another host. A violation
// is a programming error, so it throws instead of returning an outcome.
//
// A path with a leading "//" would resolve to another host, so the resolved
// origin (which includes the scheme) is compared with the sandbox origin.
function sandboxUrl(path: string): string {
  const unsafe = !path.startsWith("/") || path.includes("..") || /[\\?#\s]/.test(path);
  const url = unsafe ? null : new URL(path, PAYPAL_SANDBOX_BASE_URL);
  if (url === null || url.origin !== SANDBOX_ORIGIN) {
    throw new Error("Refusing to call a URL outside the PayPal sandbox.");
  }
  return url.href;
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

// PayPal's debug id is safe to record and useful to PayPal support. Anything
// that does not look like one is dropped.
function readDebugId(response: Response): string | null {
  const value = response.headers.get("paypal-debug-id");
  return value !== null && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : null;
}

async function readBody(response: Response): Promise<HttpBody> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    // The status line arrived but the body did not (for example a timeout
    // part-way through).
    return { kind: "unreadable" };
  }
  if (text === "") return { kind: "empty" };
  if (text.length > MAX_BODY_CHARS) return { kind: "unreadable" };
  try {
    return { kind: "json", value: JSON.parse(text) as unknown };
  } catch {
    return { kind: "unreadable" };
  }
}

export async function paypalFetch(deps: HttpDeps, request: HttpRequest): Promise<HttpOutcome> {
  const url = sandboxUrl(request.path);
  const init: RequestInit = {
    method: request.method,
    headers: { ...request.headers },
    // A redirect would send credentials somewhere we did not choose.
    redirect: "error",
    signal: AbortSignal.timeout(deps.timeoutMs),
    ...(request.body === undefined ? {} : { body: request.body }),
  };

  let response: Response;
  try {
    response = await deps.fetch(url, init);
  } catch (error) {
    // fetch reports every network failure as a TypeError, so a bug in how we
    // build the call cannot be told apart here. Both end as "no response".
    return { kind: "no_response", reason: isTimeout(error) ? "timeout" : "network" };
  }

  return {
    kind: "response",
    status: response.status,
    body: await readBody(response),
    debugId: readDebugId(response),
  };
}
