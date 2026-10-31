import { createHash } from "node:crypto";
import { canonicalMandateBinding } from "@ostensia/domain";
import type { MandateBindingInput } from "@ostensia/domain";

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// The only place a mandate hash is computed (D-015). The domain package
// produces the canonical string and stays free of Node; this hashes it.
// The hash is metadata that binds a payment to a mandate through PayPal's
// custom_id. It is not a signature, and it enforces nothing (D-009).
export function hashMandate(mandate: MandateBindingInput): string {
  return sha256Hex(canonicalMandateBinding(mandate));
}
