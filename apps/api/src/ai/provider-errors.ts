import Anthropic from "@anthropic-ai/sdk";

// How a failed provider call is classified, shared by the drafter (D-024) and the
// shopping agent (D-025). Neither passes the provider's own message on.

export type UnavailableReason = "auth" | "rate_limited" | "timeout" | "connection" | "bad_request" | "server";

// null means the error is not one the provider can cause, so it is a bug of our
// own and the caller rethrows it.
export function unavailableReason(error: unknown): UnavailableReason | null {
  // Most specific first. A timeout is also a connection error.
  if (error instanceof Anthropic.APIConnectionTimeoutError) return "timeout";
  if (error instanceof Anthropic.APIConnectionError) return "connection";
  if (error instanceof Anthropic.RateLimitError) return "rate_limited";
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) return "auth";
  if (error instanceof Anthropic.BadRequestError) return "bad_request";
  if (error instanceof Anthropic.APIError) return "server";
  return null;
}

// The SDK reports a reply that does not match the schema as a plain
// AnthropicError, not an API error. Its message quotes the model's output, so it
// is never passed on.
export function isOutputParseError(error: unknown): boolean {
  return (
    error instanceof Anthropic.AnthropicError &&
    !(error instanceof Anthropic.APIError) &&
    error.message.startsWith("Failed to parse structured output")
  );
}
