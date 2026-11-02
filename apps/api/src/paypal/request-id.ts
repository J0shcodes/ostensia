import { createHash } from "node:crypto";

// Request ids are deterministic per attempt and operation (D-010): the same
// attempt and operation always produce the same PayPal-Request-Id, so a repeated
// request is recognisable to PayPal. The hash keeps the length fixed. The
// adapter never repeats a write by itself; the same id only matters if a later
// step deliberately sends the same attempt again.
export type PayPalOperation = "create_order" | "capture" | "void";

export function requestIdFor(attemptId: string, operation: PayPalOperation): string {
  const digest = createHash("sha256").update(`${attemptId}:${operation}`, "utf8").digest("hex");
  return `ostensia-${operation}-${digest.slice(0, 32)}`;
}
