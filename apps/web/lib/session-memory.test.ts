import { describe, expect, it } from "vitest";
import { recallCartSource, rememberCartSource } from "./session-memory.ts";

describe("where a cart came from, in memory only", () => {
  it("recalls what was remembered for that attempt and nothing else", () => {
    rememberCartSource("attempt-a", { source: "ai", label: "AI shopping agent" });
    rememberCartSource("attempt-b", { source: "simulated", label: "Simulated shop" });
    expect(recallCartSource("attempt-a")).toEqual({ source: "ai", label: "AI shopping agent" });
    expect(recallCartSource("attempt-b")?.source).toBe("simulated");
  });

  it("knows nothing about an attempt it never saw, as after a reload", () => {
    expect(recallCartSource("never-seen")).toBeNull();
  });
});
