import { describe, expect, it } from "vitest";
import { ATTEMPT_ID_PATTERN, newAttemptId } from "./attempt-id.ts";

describe("newAttemptId", () => {
  it("makes an id the API accepts, and a different one each time", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newAttemptId()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(ATTEMPT_ID_PATTERN.test(id), id).toBe(true);
  });

  it("refuses an id the API would reject, instead of sending it", () => {
    expect(() => newAttemptId(() => "")).toThrow();
    expect(() => newAttemptId(() => "has space")).toThrow();
    expect(() => newAttemptId(() => "-leading-dash")).toThrow();
    expect(() => newAttemptId(() => "a".repeat(101))).toThrow();
  });

  it("accepts the longest id the API allows", () => {
    expect(newAttemptId(() => "a".repeat(100))).toHaveLength(100);
  });
});
