import { describe, expect, it } from "vitest";
import type { Attempt } from "./api-types.ts";
import { newestFirst } from "./attempts-order.ts";

const attempt = (attemptId: string, startedAt: string): Attempt => ({
  attemptId,
  mandateId: "m-1",
  proposal: { mandateId: "m-1", currency: "USD", declaredTotalMinor: 100, lines: [] },
  status: "authorized",
  precheck: null,
  finalDecision: null,
  orderId: null,
  authorizationId: null,
  authorization: null,
  captureId: null,
  startedAt,
  updatedAt: startedAt,
});

describe("newestFirst", () => {
  it("puts the attempt that started last on top", () => {
    const list = [attempt("a", "2026-11-07T10:00:00.000Z"), attempt("c", "2026-11-07T12:00:00.000Z"), attempt("b", "2026-11-07T11:00:00.000Z")];
    expect(newestFirst(list).map((entry) => entry.attemptId)).toEqual(["c", "b", "a"]);
  });

  it("does not change the list it was given, and drops nothing", () => {
    const list = [attempt("a", "2026-11-07T10:00:00.000Z"), attempt("b", "2026-11-07T11:00:00.000Z")];
    const sorted = newestFirst(list);
    expect(list.map((entry) => entry.attemptId)).toEqual(["a", "b"]);
    expect(sorted).toHaveLength(2);
  });

  it("keeps the API's order for attempts that started at the same time", () => {
    const list = [attempt("a", "2026-11-07T10:00:00.000Z"), attempt("b", "2026-11-07T10:00:00.000Z")];
    expect(newestFirst(list).map((entry) => entry.attemptId)).toEqual(["a", "b"]);
  });

  it("puts an attempt whose time cannot be read last instead of hiding it", () => {
    const list = [attempt("bad", "not a time"), attempt("a", "2026-11-07T10:00:00.000Z")];
    expect(newestFirst(list).map((entry) => entry.attemptId)).toEqual(["a", "bad"]);
  });

  it("returns an empty list for an empty list", () => {
    expect(newestFirst([])).toEqual([]);
  });
});
