import { IdentifierSchema, mapAuthorizationStatus, mapCaptureStatus, mapOrderStatus } from "@ostensia/domain";
import type { AuthorizationState, CaptureState, OrderState } from "@ostensia/domain";
import { formatPayPalAmount, parsePayPalUsdAmount } from "./amount.ts";
import { paypalFetch } from "./http.ts";
import type { FetchFn, HttpOutcome } from "./http.ts";
import type { PayPalConfig } from "./paypal-config.ts";
import { requestIdFor } from "./request-id.ts";
import {
  AuthorizationResponseSchema,
  CaptureResponseSchema,
  ErrorResponseSchema,
  OrderResponseSchema,
  PAYPAL_ID,
} from "./responses.ts";
import type { AuthorizationResponse, CaptureResponse, OrderResponse } from "./responses.ts";
import { createTokenProvider } from "./token.ts";
import type { TokenFailure } from "./token.ts";

// The PayPal adapter (D-010, D-019, D-021). It has no authorize method: an
// order created from a vault id is already authorized. The two payment writes,
// captureAuthorization and voidAuthorization, only send a request. Deciding to
// call them is the gate's job (nextPaymentAction), not the adapter's.
//
// Every method returns a value for everything PayPal or the network can do. It
// throws only AdapterInputError, for arguments our own code got wrong. Nothing
// is retried: a write is sent exactly once, and a timeout means the outcome is
// unknown, to be settled by reading state.

export class AdapterInputError extends Error {
  override name = "AdapterInputError";
}

// ----- Results -----

export type NotSent = {
  readonly kind: "not_sent";
  readonly reason: "token_unavailable";
  readonly tokenFailure: TokenFailure;
};

// PayPal answered with an error that says the request was not processed.
export type Rejected = {
  readonly kind: "rejected";
  readonly error: {
    readonly status: number;
    readonly errorName: string | null;
    readonly issues: readonly string[];
    readonly debugId: string | null;
  };
};

export type UnknownReason =
  | "timeout"
  | "network"
  | "server_error"
  | "conflict"
  | "rate_limited"
  | "unreadable_response"
  | "unexpected_status"
  | "authorization_unconfirmed"
  | "void_unconfirmed";

// The outcome cannot be told from what we received. For a write, the operation
// may or may not have happened.
export type Unknown = {
  readonly kind: "unknown";
  readonly reason: UnknownReason;
  readonly status: number | null;
  readonly debugId: string | null;
};

export type Failure = NotSent | Rejected | Unknown;

export type AuthorizationRef = {
  readonly id: string;
  readonly statusRaw: string;
  readonly state: AuthorizationState;
};

export type CaptureRef = {
  readonly id: string;
  readonly statusRaw: string;
  readonly state: CaptureState;
};

export type OrderSnapshot = {
  readonly orderId: string;
  readonly statusRaw: string;
  readonly state: OrderState;
  readonly authorizations: readonly AuthorizationRef[];
  // Read from purchase_units[].payments.captures (E-1, request E1-C.6). After a
  // capture whose outcome is unknown, this is where its id can be found.
  readonly captures: readonly CaptureRef[];
};

export type AuthorizationSnapshot = {
  readonly id: string;
  readonly statusRaw: string;
  readonly state: AuthorizationState;
  readonly amountMinor: number | null;
  readonly currency: string;
  readonly customId: string | null;
  readonly expirationTime: string | null;
  readonly createTime: string | null;
  readonly orderId: string | null;
};

export type VaultCheckResult = { readonly kind: "ok" } | { readonly kind: "vault_unavailable" } | Failure;

export type CreateOrderResult =
  | { readonly kind: "created"; readonly order: OrderSnapshot; readonly authorizationId: string }
  | {
      readonly kind: "anomaly";
      readonly reason: "no_authorization" | "multiple_authorizations";
      readonly order: OrderSnapshot;
    }
  | NotSent
  | Rejected
  | (Unknown & { readonly orderId: string | null });

export type GetOrderResult =
  | { readonly kind: "ok"; readonly order: OrderSnapshot }
  | { readonly kind: "not_found" }
  | Failure;

export type GetAuthorizationResult =
  | { readonly kind: "ok"; readonly authorization: AuthorizationSnapshot }
  | { readonly kind: "not_found" }
  | Failure;

export type CreateVaultOrderInput = {
  readonly attemptId: string;
  readonly amountMinor: number;
  readonly mandateHash: string;
};

export type CaptureSnapshot = {
  readonly captureId: string;
  readonly statusRaw: string;
  readonly state: CaptureState;
  readonly amountMinor: number | null;
  readonly currency: string | null;
};

// The two refusals E-1 recorded for a write on an authorization that has
// already reached an end state: capture after capture or void after capture
// (PREVIOUSLY_CAPTURED), and capture after void (AUTHORIZATION_VOIDED). Both mean
// "settled already, read the state to see which" (D-019).
export type TerminalIssue = "PREVIOUSLY_CAPTURED" | "AUTHORIZATION_VOIDED";

export type AlreadyTerminal = {
  readonly kind: "already_terminal";
  readonly issue: TerminalIssue;
  readonly status: number;
  readonly debugId: string | null;
};

// "accepted" means PayPal returned a capture. Money has moved only when the
// capture state is "completed"; "pending" and "unknown" are not completion.
export type CaptureResult =
  | { readonly kind: "accepted"; readonly capture: CaptureSnapshot }
  | AlreadyTerminal
  | Failure;

// "voided" is returned only after a GET showed the authorization as VOIDED (D-019).
export type VoidResult = { readonly kind: "voided" } | AlreadyTerminal | Failure;

export type AuthorizationWriteInput = {
  readonly attemptId: string;
  readonly authorizationId: string;
};

export type PayPalAdapter = {
  checkVault(): Promise<VaultCheckResult>;
  createVaultOrder(input: CreateVaultOrderInput): Promise<CreateOrderResult>;
  getOrder(orderId: string): Promise<GetOrderResult>;
  getAuthorization(authorizationId: string): Promise<GetAuthorizationResult>;
  captureAuthorization(input: AuthorizationWriteInput): Promise<CaptureResult>;
  voidAuthorization(input: AuthorizationWriteInput): Promise<VoidResult>;
};

export type PayPalAdapterOptions = {
  readonly config: PayPalConfig;
  readonly fetch: FetchFn;
  readonly timeoutMs?: number;
  readonly now?: () => number;
};

const DEFAULT_TIMEOUT_MS = 15_000;
// PayPal limits invoice_id to 127 characters, and ours is "ostensia-" + the
// attempt id.
const MAX_ATTEMPT_ID_LENGTH = 100;
const MANDATE_HASH = /^[0-9a-f]{64}$/;
const MAX_ISSUES = 10;
const MAX_ISSUE_LENGTH = 64;

// ----- Conversions (pure) -----

function orderSnapshot(order: OrderResponse): OrderSnapshot {
  const authorizations = (order.purchase_units ?? []).flatMap((unit) => unit.payments?.authorizations ?? []);
  const captures = (order.purchase_units ?? []).flatMap((unit) => unit.payments?.captures ?? []);
  return {
    orderId: order.id,
    statusRaw: order.status,
    state: mapOrderStatus(order.status),
    authorizations: authorizations.map((authorization) => ({
      id: authorization.id,
      statusRaw: authorization.status,
      state: mapAuthorizationStatus(authorization.status),
    })),
    captures: captures.map((capture) => ({
      id: capture.id,
      statusRaw: capture.status,
      state: mapCaptureStatus(capture.status),
    })),
  };
}

function captureSnapshot(capture: CaptureResponse): CaptureSnapshot {
  return {
    captureId: capture.id,
    statusRaw: capture.status,
    state: mapCaptureStatus(capture.status),
    amountMinor: capture.amount === undefined ? null : parsePayPalUsdAmount(capture.amount.value),
    currency: capture.amount?.currency_code ?? null,
  };
}

function authorizationSnapshot(authorization: AuthorizationResponse): AuthorizationSnapshot {
  return {
    id: authorization.id,
    statusRaw: authorization.status,
    state: mapAuthorizationStatus(authorization.status),
    amountMinor: parsePayPalUsdAmount(authorization.amount.value),
    currency: authorization.amount.currency_code,
    customId: authorization.custom_id ?? null,
    expirationTime: authorization.expiration_time ?? null,
    createTime: authorization.create_time ?? null,
    orderId: authorization.supplementary_data?.related_ids?.order_id ?? null,
  };
}

// The input of finalEvaluatePurchase. The values are passed on as they are: an
// amount we could not read stays null, and the evaluator then blocks with
// OBSERVATION_INVALID.
export function toObservedPayment(authorization: AuthorizationSnapshot): {
  amountMinor: number | null;
  currency: string;
  customId: string | null;
} {
  return {
    amountMinor: authorization.amountMinor,
    currency: authorization.currency,
    customId: authorization.customId,
  };
}

function unknownResult(reason: UnknownReason, status: number | null, debugId: string | null): Unknown {
  return { kind: "unknown", reason, status, debugId };
}

function clip(value: string): string {
  return value.slice(0, MAX_ISSUE_LENGTH);
}

function rejectedFrom(outcome: Extract<HttpOutcome, { kind: "response" }>): Rejected {
  const parsed = outcome.body.kind === "json" ? ErrorResponseSchema.safeParse(outcome.body.value) : null;
  const data = parsed !== null && parsed.success ? parsed.data : null;
  const issues = (data?.details ?? [])
    .flatMap((detail) => (detail.issue === undefined ? [] : [clip(detail.issue)]))
    .slice(0, MAX_ISSUES);
  return {
    kind: "rejected",
    error: {
      status: outcome.status,
      errorName: data?.name === undefined ? null : clip(data.name),
      issues,
      debugId: outcome.debugId,
    },
  };
}

// Anything that could mean "PayPal may have acted" is unknown. Only a 4xx that
// says the request was not processed is a rejection.
function failureFrom(outcome: HttpOutcome): Rejected | Unknown {
  if (outcome.kind === "no_response") return unknownResult(outcome.reason, null, null);
  const { status, debugId } = outcome;
  if (status === 408) return unknownResult("timeout", status, debugId);
  if (status === 409) return unknownResult("conflict", status, debugId);
  if (status === 429) return unknownResult("rate_limited", status, debugId);
  if (status >= 500) return unknownResult("server_error", status, debugId);
  if (status >= 400) return rejectedFrom(outcome);
  return unknownResult("unexpected_status", status, debugId);
}

const TERMINAL_ISSUES: readonly TerminalIssue[] = ["PREVIOUSLY_CAPTURED", "AUTHORIZATION_VOIDED"];

// For the two payment writes. A 422 whose issue is one of the two refusals E-1
// recorded means the authorization is already settled; everything else is
// classified as for any other call.
function writeFailureFrom(outcome: HttpOutcome): AlreadyTerminal | Rejected | Unknown {
  const failure = failureFrom(outcome);
  if (failure.kind === "rejected" && failure.error.status === 422) {
    const issue = TERMINAL_ISSUES.find((candidate) => failure.error.issues.includes(candidate));
    if (issue !== undefined) {
      return { kind: "already_terminal", issue, status: failure.error.status, debugId: failure.error.debugId };
    }
  }
  return failure;
}

function requireAttemptId(value: string): string {
  if (!IdentifierSchema.safeParse(value).success || value.length > MAX_ATTEMPT_ID_LENGTH) {
    throw new AdapterInputError("attemptId is not a valid attempt id.");
  }
  return value;
}

// ----- The adapter -----

export function createPayPalAdapter(options: PayPalAdapterOptions): PayPalAdapter {
  const { config } = options;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deps = { fetch: options.fetch, timeoutMs };
  const tokens = createTokenProvider({
    fetch: options.fetch,
    timeoutMs,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    now: options.now ?? Date.now,
  });

  async function authorizedCall(
    method: "GET" | "POST",
    path: string,
    extra: { headers?: Readonly<Record<string, string>>; body?: string } = {},
  ): Promise<NotSent | HttpOutcome> {
    const token = await tokens.getToken();
    if (token.kind === "failed") {
      return { kind: "not_sent", reason: "token_unavailable", tokenFailure: token.failure };
    }
    const outcome = await paypalFetch(deps, {
      method,
      path,
      headers: { Authorization: `Bearer ${token.token}`, ...extra.headers },
      ...(extra.body === undefined ? {} : { body: extra.body }),
    });
    if (outcome.kind === "response" && outcome.status === 401) tokens.invalidate();
    return outcome;
  }

  function requirePayPalId(value: string, name: string): string {
    if (!PAYPAL_ID.test(value)) throw new AdapterInputError(`${name} is not a valid PayPal id.`);
    return value;
  }

  async function getOrder(orderId: string): Promise<GetOrderResult> {
    const id = requirePayPalId(orderId, "orderId");
    const outcome = await authorizedCall("GET", `/v2/checkout/orders/${id}`);
    if (outcome.kind === "not_sent") return outcome;
    if (outcome.kind === "response" && outcome.status === 200) {
      const parsed = outcome.body.kind === "json" ? OrderResponseSchema.safeParse(outcome.body.value) : null;
      if (parsed === null || !parsed.success) {
        return unknownResult("unreadable_response", outcome.status, outcome.debugId);
      }
      return { kind: "ok", order: orderSnapshot(parsed.data) };
    }
    if (outcome.kind === "response" && outcome.status === 404) return { kind: "not_found" };
    return failureFrom(outcome);
  }

  async function getAuthorization(authorizationId: string): Promise<GetAuthorizationResult> {
    const id = requirePayPalId(authorizationId, "authorizationId");
    const outcome = await authorizedCall("GET", `/v2/payments/authorizations/${id}`);
    if (outcome.kind === "not_sent") return outcome;
    if (outcome.kind === "response" && outcome.status === 200) {
      const parsed =
        outcome.body.kind === "json" ? AuthorizationResponseSchema.safeParse(outcome.body.value) : null;
      if (parsed === null || !parsed.success) {
        return unknownResult("unreadable_response", outcome.status, outcome.debugId);
      }
      return { kind: "ok", authorization: authorizationSnapshot(parsed.data) };
    }
    if (outcome.kind === "response" && outcome.status === 404) return { kind: "not_found" };
    return failureFrom(outcome);
  }

  async function checkVault(): Promise<VaultCheckResult> {
    // The body is not read: E-1 recorded only the status (200) for this call.
    // The vault id was held to the safe id alphabet when the config was loaded.
    const outcome = await authorizedCall("GET", `/v3/vault/payment-tokens/${config.vaultId}`);
    if (outcome.kind === "not_sent") return outcome;
    if (outcome.kind === "response" && outcome.status === 200) return { kind: "ok" };
    if (outcome.kind === "response" && outcome.status === 404) {
      const rejected = rejectedFrom(outcome);
      // E-1 recorded "404 RESOURCE_NOT_FOUND" without saying whether that was
      // the error name or the issue, so either counts.
      const notFound =
        rejected.error.errorName === "RESOURCE_NOT_FOUND" || rejected.error.issues.includes("RESOURCE_NOT_FOUND");
      return notFound ? { kind: "vault_unavailable" } : rejected;
    }
    return failureFrom(outcome);
  }

  // The order body keeps the shape of the E-1 and spike requests: intent
  // AUTHORIZE, payment_source.paypal.vault_id only (no stored_credential, TD-004)
  // and no authorize call afterwards.
  function orderBody(input: CreateVaultOrderInput, value: string): string {
    return JSON.stringify({
      intent: "AUTHORIZE",
      payment_source: { paypal: { vault_id: config.vaultId } },
      purchase_units: [
        {
          reference_id: input.attemptId,
          custom_id: input.mandateHash,
          invoice_id: `ostensia-${input.attemptId}`,
          description: "Ostensia purchase authorization",
          amount: { currency_code: "USD", value },
        },
      ],
    });
  }

  async function resolveAuthorization(
    order: OrderSnapshot,
    first: Extract<HttpOutcome, { kind: "response" }>,
  ): Promise<CreateOrderResult> {
    const outcomeFor = (found: OrderSnapshot): CreateOrderResult | null => {
      if (found.authorizations.length === 1) {
        const [only] = found.authorizations;
        return only === undefined ? null : { kind: "created", order: found, authorizationId: only.id };
      }
      if (found.authorizations.length > 1) {
        return { kind: "anomaly", reason: "multiple_authorizations", order: found };
      }
      return null;
    };

    const direct = outcomeFor(order);
    if (direct !== null) return direct;

    // A 2xx is not proof of an authorization (D-010). Read the order once.
    const again = await getOrder(order.orderId);
    if (again.kind === "ok") {
      return outcomeFor(again.order) ?? { kind: "anomaly", reason: "no_authorization", order: again.order };
    }
    return { ...unknownResult("authorization_unconfirmed", first.status, first.debugId), orderId: order.orderId };
  }

  async function createVaultOrder(input: CreateVaultOrderInput): Promise<CreateOrderResult> {
    requireAttemptId(input.attemptId);
    const amount = input.amountMinor >= 1 ? formatPayPalAmount(input.amountMinor) : null;
    if (amount === null) throw new AdapterInputError("amountMinor must be a positive safe integer.");
    if (!MANDATE_HASH.test(input.mandateHash)) throw new AdapterInputError("mandateHash is not a SHA-256 hex string.");

    const outcome = await authorizedCall("POST", "/v2/checkout/orders", {
      headers: {
        "Content-Type": "application/json",
        "PayPal-Request-Id": requestIdFor(input.attemptId, "create_order"),
        Prefer: "return=representation",
      },
      body: orderBody(input, amount),
    });
    if (outcome.kind === "not_sent") return outcome;

    if (outcome.kind === "response" && (outcome.status === 200 || outcome.status === 201)) {
      const parsed = outcome.body.kind === "json" ? OrderResponseSchema.safeParse(outcome.body.value) : null;
      if (parsed === null || !parsed.success) {
        // PayPal said yes but we cannot read the order, so one may exist.
        return { ...unknownResult("unreadable_response", outcome.status, outcome.debugId), orderId: null };
      }
      return resolveAuthorization(orderSnapshot(parsed.data), outcome);
    }

    const failure = failureFrom(outcome);
    return failure.kind === "unknown" ? { ...failure, orderId: null } : failure;
  }

  // The E-1 capture request (E1-C.4): a full capture with no amount, which the
  // final evaluation has already compared with the authorization. Sent once.
  async function captureAuthorization(input: AuthorizationWriteInput): Promise<CaptureResult> {
    const attemptId = requireAttemptId(input.attemptId);
    const id = requirePayPalId(input.authorizationId, "authorizationId");

    const outcome = await authorizedCall("POST", `/v2/payments/authorizations/${id}/capture`, {
      headers: {
        "Content-Type": "application/json",
        "PayPal-Request-Id": requestIdFor(attemptId, "capture"),
        Prefer: "return=representation",
      },
      body: JSON.stringify({ final_capture: true }),
    });
    if (outcome.kind === "not_sent") return outcome;

    // E-1: 201 for the capture, and 200 with the same capture id for a replay.
    if (outcome.kind === "response" && (outcome.status === 200 || outcome.status === 201)) {
      const parsed = outcome.body.kind === "json" ? CaptureResponseSchema.safeParse(outcome.body.value) : null;
      if (parsed === null || !parsed.success) {
        // PayPal said yes but we cannot read the capture, so money may have moved.
        return unknownResult("unreadable_response", outcome.status, outcome.debugId);
      }
      return { kind: "accepted", capture: captureSnapshot(parsed.data) };
    }
    return writeFailureFrom(outcome);
  }

  // The E-1 void request (E1-C.7, E1-V.3): an empty JSON body. PayPal answers
  // 204 with no body, so success is confirmed by one GET (D-019).
  async function voidAuthorization(input: AuthorizationWriteInput): Promise<VoidResult> {
    const attemptId = requireAttemptId(input.attemptId);
    const id = requirePayPalId(input.authorizationId, "authorizationId");

    const outcome = await authorizedCall("POST", `/v2/payments/authorizations/${id}/void`, {
      headers: {
        "Content-Type": "application/json",
        "PayPal-Request-Id": requestIdFor(attemptId, "void"),
      },
      body: "{}",
    });
    if (outcome.kind === "not_sent") return outcome;

    if (outcome.kind === "response" && (outcome.status === 204 || outcome.status === 200)) {
      const read = await getAuthorization(id);
      if (read.kind === "ok" && read.authorization.state === "voided") return { kind: "voided" };
      return unknownResult("void_unconfirmed", outcome.status, outcome.debugId);
    }
    return writeFailureFrom(outcome);
  }

  return { checkVault, createVaultOrder, getOrder, getAuthorization, captureAuthorization, voidAuthorization };
}
