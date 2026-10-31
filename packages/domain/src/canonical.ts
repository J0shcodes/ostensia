import type { ConfirmedMandate } from "./mandate.ts";

// Canonical JSON: the same value always produces the same string, whatever
// the key order it was built with. Only the value types a mandate needs are
// accepted, and anything else throws, so a mandate that cannot be represented
// exactly can never be hashed.
//
// Strings are used as given. They are not Unicode-normalised, so two visually
// identical strings in different normal forms hash differently.

export class CanonicalizationError extends Error {
  override name = "CanonicalizationError";
}

const MAX_DEPTH = 32;

export function canonicalize(value: unknown): string {
  return encode(value, 0);
}

function encode(value: unknown, depth: number): string {
  if (depth > MAX_DEPTH) {
    throw new CanonicalizationError("Value is nested too deeply to canonicalize.");
  }
  if (value === null) return "null";

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isSafeInteger(value)) {
        throw new CanonicalizationError("Numbers must be safe integers.");
      }
      return String(value);
    case "object":
      return encodeObject(value, depth);
    default:
      throw new CanonicalizationError(`Cannot canonicalize a value of type ${typeof value}.`);
  }
}

function encodeObject(value: object, depth: number): string {
  if (Array.isArray(value)) {
    // Array.from visits holes in a sparse array as undefined, which then throws.
    return `[${Array.from(value, (item: unknown) => encode(item, depth + 1)).join(",")}]`;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new CanonicalizationError("Only plain objects and arrays can be canonicalized.");
  }
  const record = value as Record<string, unknown>;
  const members = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${encode(record[key], depth + 1)}`);
  return `{${members.join(",")}}`;
}

export type MandateBindingInput = Pick<ConfirmedMandate, "id" | "version" | "terms">;

// The binding payload is only what the user confirmed and what is enforced:
// id, version and terms. status, confirmedAt, intentSummary and hash are left
// out on purpose, so revoking a mandate does not change its hash.
export function canonicalMandateBinding(mandate: MandateBindingInput): string {
  return canonicalize({ id: mandate.id, version: mandate.version, terms: mandate.terms });
}
