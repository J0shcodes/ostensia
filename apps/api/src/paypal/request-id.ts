import { createHash } from "node:crypto";

// Request ids are deterministic per attempt and operation (D-010): the same
// attempt and operation always produce the same PayPal-Request-Id, so a repeated
// request is recognisable to PayPal. The hash keeps the length fixed. Only
// create_order is used so far; the others are reserved for Increment 4.
export type PayPalOperation = "create_order" | "capture" | "void";

export function requestIdFor(attemptId: string, operation: PayPalOperation): string {
  const digest = createHash("sha256").update(`${attemptId}:${operation}`, "utf8").digest("hex");
  return `ostensia-${operation}-${digest.slice(0, 32)}`;
}
