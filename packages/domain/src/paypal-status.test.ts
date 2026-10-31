import { describe, expect, it } from "vitest";
import {
  AUTHORIZATION_STATES,
  CAPTURE_STATES,
  ORDER_STATES,
  mapAuthorizationStatus,
  mapCaptureStatus,
  mapOrderStatus,
} from "./paypal-status.ts";

// Values that must never match, in any family.
const NEAR_MISSES: readonly unknown[] = [
  "",
  " ",
  "created",
  "Created",
  " CREATED",
  "CREATED ",
  "CREATED\n",
  "CREATED\u0000",
  "ＣＲＥＡＴＥＤ",
  "constructor",
  "__proto__",
  "toString",
  "hasOwnProperty",
  "SOMETHING_NEW",
  undefined,
  null,
  0,
  1,
  true,
  false,
  {},
  [],
  ["CREATED"],
  { toString: () => "CREATED" },
  Symbol("CREATED"),
];

describe("mapAuthorizationStatus", () => {
  it.each<[string, string]>([
    ["CREATED", "created"],
    ["CAPTURED", "captured"],
    ["PARTIALLY_CAPTURED", "partially_captured"],
    ["VOIDED", "voided"],
    ["DENIED", "denied"],
    ["PENDING", "pending"],
    ["EXPIRED", "expired"],
  ])("maps %s to %s", (raw, expected) => {
    expect(mapAuthorizationStatus(raw)).toBe(expected);
  });

  it("covers every state except unknown", () => {
    const mapped = ["CREATED", "CAPTURED", "PARTIALLY_CAPTURED", "VOIDED", "DENIED", "PENDING", "EXPIRED"].map(
      mapAuthorizationStatus,
    );
    expect([...mapped, "unknown"].sort()).toEqual([...AUTHORIZATION_STATES].sort());
  });

  it.each(NEAR_MISSES.map((value) => [String(typeof value === "symbol" ? "symbol" : JSON.stringify(value)), value]))(
    "maps %s to unknown",
    (_label, value) => {
      expect(mapAuthorizationStatus(value)).toBe("unknown");
    },
  );
});

describe("mapCaptureStatus", () => {
  it.each<[string, string]>([
    ["COMPLETED", "completed"],
    ["PENDING", "pending"],
  ])("maps %s to %s", (raw, expected) => {
    expect(mapCaptureStatus(raw)).toBe(expected);
  });

  it("covers every state except unknown", () => {
    expect([...["COMPLETED", "PENDING"].map(mapCaptureStatus), "unknown"].sort()).toEqual([...CAPTURE_STATES].sort());
  });

  it.each(["CREATED", "CAPTURED", "VOIDED", "DECLINED", "REFUNDED"])("does not map the unlisted value %s", (raw) => {
    expect(mapCaptureStatus(raw)).toBe("unknown");
  });

  it.each(NEAR_MISSES.map((value) => [String(typeof value === "symbol" ? "symbol" : JSON.stringify(value)), value]))(
    "maps %s to unknown",
    (_label, value) => {
      expect(mapCaptureStatus(value)).toBe("unknown");
    },
  );
});

describe("mapOrderStatus", () => {
  it.each<[string, string]>([
    ["APPROVED", "approved"],
    ["COMPLETED", "completed"],
  ])("maps %s to %s", (raw, expected) => {
    expect(mapOrderStatus(raw)).toBe(expected);
  });

  it("covers every state except unknown", () => {
    expect([...["APPROVED", "COMPLETED"].map(mapOrderStatus), "unknown"].sort()).toEqual([...ORDER_STATES].sort());
  });

  it.each(["CREATED", "SAVED", "VOIDED", "PAYER_ACTION_REQUIRED"])("does not map the unlisted value %s", (raw) => {
    expect(mapOrderStatus(raw)).toBe("unknown");
  });

  it.each(NEAR_MISSES.map((value) => [String(typeof value === "symbol" ? "symbol" : JSON.stringify(value)), value]))(
    "maps %s to unknown",
    (_label, value) => {
      expect(mapOrderStatus(value)).toBe("unknown");
    },
  );
});

describe("the families are separate", () => {
  it("does not let a status from one family map in another", () => {
    // COMPLETED is a valid order and capture status but not an authorization one.
    expect(mapAuthorizationStatus("COMPLETED")).toBe("unknown");
    // APPROVED is an order status only.
    expect(mapAuthorizationStatus("APPROVED")).toBe("unknown");
    expect(mapCaptureStatus("APPROVED")).toBe("unknown");
    // CAPTURED is an authorization status only.
    expect(mapOrderStatus("CAPTURED")).toBe("unknown");
  });
});
