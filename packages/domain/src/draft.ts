import { MandateDraftSchema, MandateTermsSchema } from "./mandate.ts";
import type { MandateTerms } from "./mandate.ts";

// Turns an AI-proposed draft into confirmable terms, or says what is missing.
//
// It never fills a gap. A field the draft left null is reported as missing, and
// a person has to supply it (D-009, D-024): an AI must not invent a limit. A
// complete result carries exactly the values the draft held, validated by the
// same schema the gate uses to confirm a mandate.

export type DraftCompletion =
  // The draft was not even a valid draft (wrong shape).
  | { readonly kind: "invalid" }
  // Every required field is present and valid. `terms` can be confirmed as is,
  // or after the person edits them.
  | { readonly kind: "complete"; readonly terms: MandateTerms }
  // Something is missing (null in the draft) or present but not acceptable.
  // `missing` and `problems` name fields by path, for example
  // "items[0].maxUnitPriceMinor".
  | { readonly kind: "incomplete"; readonly missing: readonly string[]; readonly problems: readonly string[] };

function pathText(path: readonly PropertyKey[]): string {
  let text = "";
  for (const part of path) {
    if (typeof part === "number") text += `[${part}]`;
    else text += text === "" ? String(part) : `.${String(part)}`;
  }
  return text;
}

export function completeDraft(input: unknown): DraftCompletion {
  const parsed = MandateDraftSchema.safeParse(input);
  if (!parsed.success) return { kind: "invalid" };
  const draft = parsed.data;

  const missing: string[] = [];
  if (draft.currency === null) missing.push("currency");
  if (draft.maxTotalMinor === null) missing.push("maxTotalMinor");
  if (draft.expiresAt === null) missing.push("expiresAt");
  if (draft.items.length === 0) missing.push("items");
  draft.items.forEach((item, index) => {
    if (item.productId === null) missing.push(`items[${index}].productId`);
    if (item.maxQuantity === null) missing.push(`items[${index}].maxQuantity`);
    if (item.maxUnitPriceMinor === null) missing.push(`items[${index}].maxUnitPriceMinor`);
  });

  // What is present is checked by the confirmed-mandate rules. A null is left
  // undefined here, and the issue it causes is skipped because it is already
  // reported as missing.
  const candidate = {
    currency: draft.currency ?? undefined,
    maxTotalMinor: draft.maxTotalMinor ?? undefined,
    expiresAt: draft.expiresAt ?? undefined,
    items: draft.items.map((item) => ({
      productId: item.productId ?? undefined,
      ...(item.allowedVariantIds === undefined ? {} : { allowedVariantIds: item.allowedVariantIds }),
      maxQuantity: item.maxQuantity ?? undefined,
      maxUnitPriceMinor: item.maxUnitPriceMinor ?? undefined,
    })),
  };
  const checked = MandateTermsSchema.safeParse(candidate);
  if (checked.success) {
    return missing.length === 0
      ? { kind: "complete", terms: checked.data }
      : { kind: "incomplete", missing, problems: [] };
  }

  const reported = new Set(missing);
  const problems: string[] = [];
  for (const issue of checked.error.issues) {
    const path = pathText(issue.path);
    if (reported.has(path)) continue;
    problems.push(`${path === "" ? "terms" : path}: ${issue.message}`);
  }
  return { kind: "incomplete", missing, problems };
}
