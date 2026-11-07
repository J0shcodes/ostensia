import { ConfirmedMandateSchema, MandateTermsSchema, formatUsd } from "@ostensia/domain";
import type { MandateDraft, MandateTerms } from "@ostensia/domain";
import type { CatalogueProduct } from "./api-types.ts";
import { formatLocalInstant, localInputToUtcIso, utcIsoToLocalInput } from "./datetime.ts";
import { formatMinorAsDecimal, parseMoneyToMinor, parseWholeNumber } from "./money.ts";

// The mandate form, as plain data, and the two things done with it: turning it into
// mandate terms (validation) and filling it from an AI draft.
//
// Validation is deliberate in two stages (D-028, D1). First the typed text becomes
// values: "12.50" becomes 1250 cents, a local date becomes a UTC timestamp. Then the
// domain's own MandateTermsSchema, the same schema the gate uses, judges the values.
// No limit is copied into this app: the messages quote the numbers the schema itself
// reports. This is for usability only. The gate on the server stays authoritative and
// checks everything again.

export type ItemForm = {
  // A stable id for this row (not the product id), so React and error messages can
  // refer to a row after another row is removed.
  readonly key: string;
  readonly productId: string; // "" until chosen
  readonly variantMode: "any" | "only";
  readonly variantIds: readonly string[];
  readonly maxQuantity: string;
  readonly maxUnitPrice: string; // dollars as typed, for example "1.50"
};

export type MandateFormState = {
  readonly intentSummary: string;
  readonly maxTotal: string; // dollars as typed
  readonly expiresLocal: string; // an <input type="datetime-local"> value, or ""
  readonly items: readonly ItemForm[];
  // Fields whose value came from an AI draft and has not been edited since. The form
  // marks them, so the person can see what the AI wrote (guidelines section 8).
  readonly fromDraft: Readonly<Record<string, true>>;
};

export function emptyItem(key: string): ItemForm {
  return { key, productId: "", variantMode: "any", variantIds: [], maxQuantity: "", maxUnitPrice: "" };
}

export function emptyForm(firstItemKey: string): MandateFormState {
  return { intentSummary: "", maxTotal: "", expiresLocal: "", items: [emptyItem(firstItemKey)], fromDraft: {} };
}

// Names of the form's fields, used for error messages and the "from AI draft" marks.
export const FIELD_INTENT = "intentSummary";
export const FIELD_TOTAL = "maxTotal";
export const FIELD_EXPIRES = "expires";
export const FIELD_ITEMS = "items";
export type ItemFieldName = "product" | "variants" | "quantity" | "unitPrice";
export function itemField(key: string, name: ItemFieldName): string {
  return `item.${key}.${name}`;
}
// Field names contain dots; element ids are made from them.
export function domId(field: string): string {
  return `field-${field.replaceAll(".", "-")}`;
}

export function withoutMark(form: MandateFormState, field: string): MandateFormState {
  if (!(field in form.fromDraft)) return form;
  const { [field]: _removed, ...rest } = form.fromDraft;
  return { ...form, fromDraft: rest };
}

export type Issue = { readonly field: string; readonly message: string };

export type ValidationResult =
  | {
      readonly ok: true;
      readonly terms: MandateTerms;
      readonly intentSummary: string;
    }
  | { readonly ok: false; readonly issues: readonly Issue[] };

type TermsParse = ReturnType<typeof MandateTermsSchema.safeParse>;
type SchemaIssue = NonNullable<TermsParse["error"]>["issues"][number];

const MESSAGE_TOTAL_FORMAT = "Enter an amount in dollars, such as 12.50 (at most two decimals).";
const MESSAGE_VARIANTS_NONE = "Tick at least one variant, or choose Any variant.";

function groupedNumber(value: number | bigint): string {
  return Number(value).toLocaleString("en-US");
}

// Where a schema issue belongs in the form, from its path in the terms.
function fieldForSchemaIssue(path: readonly PropertyKey[], items: readonly ItemForm[]): string {
  const [head, index, leaf] = path;
  if (head === "maxTotalMinor") return FIELD_TOTAL;
  if (head === "expiresAt") return FIELD_EXPIRES;
  if (head === "items") {
    if (typeof index !== "number") return FIELD_ITEMS;
    const item = items[index];
    if (item === undefined) return FIELD_ITEMS;
    if (leaf === "productId") return itemField(item.key, "product");
    if (leaf === "allowedVariantIds") return itemField(item.key, "variants");
    if (leaf === "maxQuantity") return itemField(item.key, "quantity");
    if (leaf === "maxUnitPriceMinor") return itemField(item.key, "unitPrice");
  }
  return FIELD_ITEMS;
}

// Plain words for what the schema reported. Numbers come from the issue, never from a
// constant in this file.
function messageForSchemaIssue(field: string, issue: SchemaIssue): string {
  if (field === FIELD_TOTAL || field.endsWith(".unitPrice")) {
    if (issue.code === "too_small") return `Must be at least ${formatUsd(Number(issue.minimum))} USD.`;
    if (issue.code === "too_big") return `Must be at most ${formatUsd(Number(issue.maximum))} USD.`;
  }
  if (field.endsWith(".quantity")) {
    if (issue.code === "too_small") return `Must be at least ${groupedNumber(issue.minimum)}.`;
    if (issue.code === "too_big") return `Must be at most ${groupedNumber(issue.maximum)}.`;
  }
  if (field === FIELD_ITEMS) {
    if (issue.code === "too_small") return "Add at least one item.";
    if (issue.code === "too_big") return `Add at most ${groupedNumber(issue.maximum)} items.`;
    if (issue.code === "custom" && issue.message.includes("unique")) return "Each product can appear only once.";
  }
  if (field.endsWith(".variants")) {
    if (issue.code === "too_small") return MESSAGE_VARIANTS_NONE;
    if (issue.code === "custom" && issue.message.includes("unique")) return "Each variant can be listed only once.";
    if (issue.code === "invalid_format") return "A variant id is not valid.";
  }
  if (field.endsWith(".product") && issue.code === "invalid_format") return "This product id is not valid.";
  if (field === FIELD_EXPIRES && issue.code === "invalid_format") return "Enter a valid date and time.";
  return "This value is not accepted.";
}

export function validateForm(form: MandateFormState): ValidationResult {
  const issues: Issue[] = [];
  const add = (field: string, message: string): void => {
    // The first message for a field wins; the schema is not asked again about a field
    // that could not even be converted.
    if (!issues.some((issue) => issue.field === field)) issues.push({ field, message });
  };

  const intentSummary = form.intentSummary.trim();
  const intentRule = ConfirmedMandateSchema.shape.intentSummary.safeParse(intentSummary);
  if (!intentRule.success) {
    const first = intentRule.error.issues[0];
    if (first?.code === "too_big") add(FIELD_INTENT, `Use at most ${groupedNumber(first.maximum)} characters.`);
    else add(FIELD_INTENT, "Describe what this mandate is for.");
  }

  const total = parseMoneyToMinor(form.maxTotal);
  if (!total.ok) add(FIELD_TOTAL, total.reason === "empty" ? "Enter the maximum total." : MESSAGE_TOTAL_FORMAT);

  const expires = localInputToUtcIso(form.expiresLocal);
  if (!expires.ok) {
    add(
      FIELD_EXPIRES,
      expires.reason === "empty"
        ? "Choose when the mandate expires."
        : "Enter a date and time that exists in your time zone.",
    );
  }

  const candidateItems = form.items.map((item) => {
    if (item.productId === "") add(itemField(item.key, "product"), "Choose a product.");

    const onlyVariants = item.variantMode === "only";
    if (onlyVariants && item.variantIds.length === 0) add(itemField(item.key, "variants"), MESSAGE_VARIANTS_NONE);

    const quantity = parseWholeNumber(item.maxQuantity);
    if (!quantity.ok) {
      add(
        itemField(item.key, "quantity"),
        quantity.reason === "empty" ? "Enter the maximum quantity." : "Enter a whole number, such as 2.",
      );
    }

    const unitPrice = parseMoneyToMinor(item.maxUnitPrice);
    if (!unitPrice.ok) {
      add(
        itemField(item.key, "unitPrice"),
        unitPrice.reason === "empty" ? "Enter the maximum unit price." : MESSAGE_TOTAL_FORMAT,
      );
    }

    return {
      ...(item.productId === "" ? {} : { productId: item.productId }),
      // "Any variant" sends no field at all. An empty list is never sent: it is not a
      // valid term and must not be read as "no restriction" (D-024).
      ...(onlyVariants && item.variantIds.length > 0 ? { allowedVariantIds: [...item.variantIds] } : {}),
      ...(quantity.ok ? { maxQuantity: quantity.value } : {}),
      ...(unitPrice.ok ? { maxUnitPriceMinor: unitPrice.minor } : {}),
    };
  });

  const candidate = {
    currency: "USD",
    ...(total.ok ? { maxTotalMinor: total.minor } : {}),
    ...(expires.ok ? { expiresAt: expires.iso } : {}),
    items: candidateItems,
  };
  const parsed = MandateTermsSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = fieldForSchemaIssue(issue.path, form.items);
      // A missing field is already explained by the conversion above.
      if (issue.code === "invalid_type") continue;
      add(field, messageForSchemaIssue(field, issue));
    }
    // Something failed the schema that no message above explains. Say so rather than
    // let the form look valid.
    if (issues.length === 0) add(FIELD_ITEMS, "These terms are not accepted.");
  }

  if (issues.length === 0 && parsed.success) return { ok: true, terms: parsed.data, intentSummary };

  const order = [
    FIELD_INTENT,
    FIELD_TOTAL,
    FIELD_EXPIRES,
    FIELD_ITEMS,
    ...form.items.flatMap((item) => (["product", "variants", "quantity", "unitPrice"] as const).map((name) => itemField(item.key, name))),
  ];
  const rank = (field: string): number => {
    const position = order.indexOf(field);
    return position === -1 ? order.length : position;
  };
  return { ok: false, issues: [...issues].sort((a, b) => rank(a.field) - rank(b.field)) };
}

export type PrefillResult = {
  readonly form: MandateFormState;
  // Where the form differs from the draft, said in words, so nothing changes silently.
  readonly adjustments: readonly string[];
};

// Copies an AI draft into the form. Only called when the person presses "Use this draft
// in the form". A field the AI left empty stays empty (D-024). Nothing is filled in.
export function draftToForm(draft: MandateDraft, newKey: () => string): PrefillResult {
  const marks: Record<string, true> = {};
  const adjustments: string[] = [];

  const mark = (field: string, present: boolean): void => {
    if (present) marks[field] = true;
  };

  mark(FIELD_INTENT, draft.intentSummary.trim() !== "");

  const maxTotal = draft.maxTotalMinor === null ? "" : formatMinorAsDecimal(draft.maxTotalMinor);
  mark(FIELD_TOTAL, maxTotal !== "");

  let expiresLocal = "";
  if (draft.expiresAt !== null && draft.expiresAt.trim() !== "") {
    const local = utcIsoToLocalInput(draft.expiresAt.trim());
    if (local === null) {
      adjustments.push(`The draft's expiry ("${draft.expiresAt}") could not be read as a date and time. Choose one.`);
    } else {
      expiresLocal = local.value;
      mark(FIELD_EXPIRES, true);
      if (!local.exact) {
        adjustments.push("The draft's expiry had seconds. The form uses the minute before it, which is the stricter side.");
      }
    }
  }

  const items: ItemForm[] = draft.items.map((item) => {
    const key = newKey();
    const variantMode = item.allowedVariantIds === undefined ? "any" : "only";
    const row: ItemForm = {
      key,
      productId: item.productId ?? "",
      variantMode,
      variantIds: item.allowedVariantIds ?? [],
      maxQuantity: item.maxQuantity === null ? "" : String(item.maxQuantity),
      maxUnitPrice: item.maxUnitPriceMinor === null ? "" : formatMinorAsDecimal(item.maxUnitPriceMinor),
    };
    mark(itemField(key, "product"), row.productId !== "");
    mark(itemField(key, "variants"), item.allowedVariantIds !== undefined);
    mark(itemField(key, "quantity"), row.maxQuantity !== "");
    mark(itemField(key, "unitPrice"), row.maxUnitPrice !== "");
    return row;
  });

  return {
    form: {
      intentSummary: draft.intentSummary.trim(),
      maxTotal,
      expiresLocal,
      items: items.length === 0 ? [emptyItem(newKey())] : items,
      fromDraft: marks,
    },
    adjustments,
  };
}

// The terms in plain words, shown above "Confirm mandate" and on the confirmed card.
export type TermsDescription = {
  readonly headline: string;
  readonly lines: readonly string[];
};

export function describeTerms(terms: MandateTerms, products: readonly CatalogueProduct[], locale?: string): TermsDescription {
  const headline = `Up to ${formatUsd(terms.maxTotalMinor)} USD in total, until ${formatLocalInstant(terms.expiresAt, locale)} (${terms.expiresAt} UTC).`;
  const lines = terms.items.map((item) => {
    const name = products.find((product) => product.productId === item.productId)?.name ?? item.productId;
    const variants =
      item.allowedVariantIds === undefined ? "any variant" : `only ${item.allowedVariantIds.join(", ")}`;
    return `${name}: at most ${item.maxQuantity} at up to ${formatUsd(item.maxUnitPriceMinor)} USD each (${variants}).`;
  });
  return { headline, lines };
}
