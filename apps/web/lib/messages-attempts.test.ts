import { describe, expect, it } from "vitest";
import type { ApiResult } from "./api.ts";
import {
  AGENT_OFF_NOTICE,
  SCENARIO_TEXT,
  describeAgentFailure,
  describeAttemptDetail,
  describeAttemptRefusal,
  describeSimulatedFailure,
} from "./messages.ts";
import { SCENARIOS } from "./api-types.ts";

type Failed = Exclude<ApiResult<unknown>, { kind: "ok" }>;
const apiError = (status: number, error: string, extra: Record<string, unknown> = {}): Failed => ({
  kind: "api_error",
  status,
  error,
  body: { error, ...extra },
});

describe("scenarios", () => {
  it("describes every scenario the API lists", () => {
    expect(Object.keys(SCENARIO_TEXT).sort()).toEqual([...SCENARIOS].sort());
    for (const name of SCENARIOS) {
      expect(SCENARIO_TEXT[name].name.trim(), name).not.toBe("");
      expect(SCENARIO_TEXT[name].line.trim(), name).not.toBe("");
    }
  });
});

describe("describeSimulatedFailure", () => {
  it("shows the API's reason for a scenario it cannot build, as a neutral note and not an error", () => {
    const failure = describeSimulatedFailure(apiError(422, "scenario_not_buildable", { reason: "No catalogue product fits this mandate." }));
    expect(failure).toEqual({ tone: "neutral", text: "No catalogue product fits this mandate." });
  });

  it("has a sentence when the API gives no reason", () => {
    expect(describeSimulatedFailure(apiError(422, "scenario_not_buildable")).text).toContain("cannot be built");
  });

  it("says nothing was sent to PayPal when the API could not be reached", () => {
    const failure = describeSimulatedFailure({ kind: "unreachable", reason: "network" });
    expect(failure.tone).toBe("error");
    expect(failure.text).toContain("Nothing was sent to PayPal.");
  });

  it("explains an unknown mandate and an answer it does not understand", () => {
    expect(describeSimulatedFailure(apiError(404, "mandate_not_found")).text).toContain("mandate_not_found");
    expect(describeSimulatedFailure({ kind: "unexpected", status: 200 }).text).toContain("does not understand");
  });
});

describe("describeAgentFailure", () => {
  it("shows the approved notice, with a neutral tone, when the agent is not configured", () => {
    expect(describeAgentFailure(apiError(503, "agent_unavailable", { reason: "not_configured" }))).toEqual({
      tone: "off",
      text: AGENT_OFF_NOTICE,
    });
  });

  it.each(["auth", "rate_limited", "timeout", "connection", "bad_request", "server"])(
    "explains an unavailable AI service (%s) as an error that leaves the simulated shop open",
    (reason) => {
      const failure = describeAgentFailure(apiError(503, "agent_unavailable", { reason }));
      expect(failure.tone).toBe("error");
      expect(failure.text.toLowerCase()).toMatch(/simulated shop|try again/);
    },
  );

  it("does not echo a reason that is not a plain code", () => {
    expect(describeAgentFailure(apiError(503, "agent_unavailable", { reason: "<script>x</script>" })).text).not.toContain("<script>");
  });

  it("explains a refusal and an unusable answer", () => {
    expect(describeAgentFailure(apiError(422, "agent_refused")).text).toContain("agent_refused");
    expect(describeAgentFailure(apiError(502, "agent_invalid")).text).toContain("agent_invalid");
  });

  it("says nothing was sent to PayPal for any other error", () => {
    expect(describeAgentFailure(apiError(500, "internal_error")).text).toContain("Nothing was sent to PayPal.");
  });
});

describe("describeAttemptRefusal", () => {
  it.each([
    "invalid_attempt_id",
    "invalid_proposal",
    "invalid_mandate",
    "mandate_not_found",
    "attempt_id_reused",
    "mandate_in_use",
    "invalid_request",
    "gate_faulted",
  ])("explains %s and names its code", (code) => {
    expect(describeAttemptRefusal(code)).toContain(code);
  });

  it("says a refused request sent nothing", () => {
    for (const code of ["invalid_proposal", "mandate_in_use", "gate_faulted", "attempt_id_reused"]) {
      expect(describeAttemptRefusal(code), code).toContain("Nothing was sent.");
    }
  });

  it("tells a person to restart the API when the gate has stopped", () => {
    expect(describeAttemptRefusal("gate_faulted")).toContain("Restart the API");
  });

  it("includes an unknown code only when it is a plain code", () => {
    expect(describeAttemptRefusal("something_new")).toBe("Ostensia returned an error (something_new).");
    expect(describeAttemptRefusal("<b>x</b>")).toBe("Ostensia returned an error.");
  });
});

describe("describeAttemptDetail", () => {
  it("says why there was no clear answer, for each kind of non-answer", () => {
    expect(describeAttemptDetail({ kind: "unreachable", reason: "timeout" })).toContain("too long");
    expect(describeAttemptDetail({ kind: "unreachable", reason: "non_json" })).toContain("could not reach");
    expect(describeAttemptDetail({ kind: "unexpected", status: 200 })).toContain("does not understand");
    expect(describeAttemptDetail(apiError(500, "internal_error"))).toContain("internal_error");
  });
});
