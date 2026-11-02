import { describe, expect, it } from "vitest";
import { requestIdFor } from "./request-id.ts";

describe("requestIdFor", () => {
  it("gives the same id for the same attempt and operation", () => {
    expect(requestIdFor("attempt-1", "create_order")).toBe(requestIdFor("attempt-1", "create_order"));
  });

  it("has a fixed, readable format", () => {
    expect(requestIdFor("attempt-1", "create_order")).toMatch(/^ostensia-create_order-[0-9a-f]{32}$/);
  });

  it("matches an independently computed digest", () => {
    // printf 'attempt-1:create_order' | sha256sum | cut -c1-32
    expect(requestIdFor("attempt-1", "create_order")).toBe("ostensia-create_order-aac760f92309a26e12ca6ea05dbcfcde");
  });

  it("differs per attempt", () => {
    expect(requestIdFor("attempt-1", "create_order")).not.toBe(requestIdFor("attempt-2", "create_order"));
  });

  it("differs per operation", () => {
    const ids = [
      requestIdFor("attempt-1", "create_order"),
      requestIdFor("attempt-1", "capture"),
      requestIdFor("attempt-1", "void"),
    ];
    expect(new Set(ids).size).toBe(3);
  });

  it("does not collide when the attempt id contains the separator", () => {
    expect(requestIdFor("a:create_order", "capture")).not.toBe(requestIdFor("a", "capture"));
  });

  it("stays short for the longest attempt id the adapter accepts", () => {
    expect(requestIdFor("x".repeat(100), "create_order").length).toBeLessThan(80);
  });
});
