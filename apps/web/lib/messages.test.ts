import { describe, expect, it } from "vitest";
import type { ApiResult } from "./api.ts";
import type { DraftResponse } from "./api-types.ts";
import { AI_OFF_NOTICE, describeApiError, describeDraftFailure, describeUnreachable } from "./messages.ts";

type Failed = Exclude<ApiResult<DraftResponse>, { kind: "ok" }>;
const apiError = (status: number, error: string, extra: Record<string, unknown> = {}): Failed => ({
  kind: "api_error",
  status,
  error,
  body: { error, ...extra },
});

describe("describeDraftFailure", () => {
  it("shows the approved notice, and a neutral tone, when AI is not configured", () => {
    expect(describeDraftFailure(apiError(503, "drafting_unavailable", { reason: "not_configured" }))).toEqual({
      tone: "off",
      text: AI_OFF_NOTICE,
    });
  });

  it.each(["auth", "rate_limited", "timeout", "connection", "bad_request", "server"])(
    "explains an unavailable AI service (%s) as an error that leaves the manual path open",
    (reason) => {
      const failure = describeDraftFailure(apiError(503, "drafting_unavailable", { reason }));
      expect(failure.tone).toBe("error");
      expect(failure.text.toLowerCase()).toMatch(/fill in the terms yourself|try again/);
    },
  );

  it("does not echo an unexpected reason that is not a plain code", () => {
    const failure = describeDraftFailure(apiError(503, "drafting_unavailable", { reason: "<script>alert(1)</script>" }));
    expect(failure.text).not.toContain("<script>");
  });

  it("explains a refusal, an unusable answer and a bad request", () => {
    expect(describeDraftFailure(apiError(422, "draft_refused")).text).toContain("draft_refused");
    expect(describeDraftFailure(apiError(502, "draft_invalid")).text).toContain("draft_invalid");
    expect(describeDraftFailure(apiError(400, "invalid_request")).text).toContain("2,000");
  });

  it("says nothing was created when the API cannot be reached", () => {
    for (const reason of ["network", "timeout", "non_json"] as const) {
      const failure = describeDraftFailure({ kind: "unreachable", reason });
      expect(failure.tone).toBe("error");
      expect(failure.text).toContain("Nothing was created");
    }
  });

  it("says so when the answer is not understood", () => {
    expect(describeDraftFailure({ kind: "unexpected", status: 200 }).text).toContain("does not understand");
  });
});

describe("describeApiError", () => {
  it.each([
    ["invalid_mandate", "Ostensia rejected these terms (invalid_mandate). Check each field."],
    ["invalid_request", "Ostensia could not read the request (invalid_request)."],
    ["payload_too_large", "The request was too large (payload_too_large)."],
    ["internal_error", "The Ostensia API had an internal error (internal_error)."],
  ])("names %s in plain words", (code, text) => {
    expect(describeApiError(code)).toBe(text);
  });

  it("explains that a faulted gate needs a restart", () => {
    expect(describeApiError("gate_faulted")).toContain("Restart the API");
  });

  it("includes an unknown code only when it is a plain code", () => {
    expect(describeApiError("something_new")).toBe("Ostensia returned an error (something_new).");
    expect(describeApiError("<b>x</b>")).toBe("Ostensia returned an error.");
  });
});

describe("describeUnreachable", () => {
  it("separates a timeout from everything else", () => {
    expect(describeUnreachable("timeout")).toContain("too long");
    expect(describeUnreachable("network")).toContain("could not reach");
    expect(describeUnreachable("non_json")).toContain("could not reach");
  });
});
