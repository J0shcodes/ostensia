import {
  ConfirmedMandateSchema,
  MAX_ITEMS_PER_MANDATE,
  MAX_QUANTITY,
  MandateTermsSchema,
} from "@ostensia/domain";
import type { MandateDraft } from "@ostensia/domain";
import { beforeAll, describe, expect, it } from "vitest";
import type { CatalogueProduct } from "./api-types.ts";
import {
  FIELD_EXPIRES,
  FIELD_INTENT,
  FIELD_ITEMS,
  FIELD_TOTAL,
  describeTerms,
  domId,
  draftToForm,
  emptyForm,
  emptyItem,
  itemField,
  validateForm,
  withoutMark,
} from "./mandate-form.ts";
import type { ItemForm, MandateFormState } from "./mandate-form.ts";

beforeAll(() => {
  process.env["TZ"] = "America/New_York";
});

const row = (over: Partial<ItemForm> = {}): ItemForm => ({
  key: "a",
  productId: "sticker-pack",
  variantMode: "only",
  variantIds: ["matte"],
  maxQuantity: "2",
  maxUnitPrice: "1.50",
  ...over,
});

const valid = (over: Partial<MandateFormState> = {}): MandateFormState => ({
  intentSummary: "Two matte sticker packs for my laptop",
  maxTotal: "5.00",
  expiresLocal: "2030-01-15T12:00",
  items: [row()],
  fromDraft: {},
  ...over,
});

function issuesOf(form: MandateFormState): Record<string, string> {
  const result = validateForm(form);
  if (result.ok) throw new Error("expected the form to be invalid");
  return Object.fromEntries(result.issues.map((issue) => [issue.field, issue.message]));
}

describe("validateForm: a valid form", () => {
  it("builds exactly the terms the gate will receive", () => {
    const result = validateForm(valid());
    expect(result).toEqual({
      ok: true,
      intentSummary: "Two matte sticker packs for my laptop",
      terms: {
        currency: "USD",
        maxTotalMinor: 500,
        // 12:00 in New York in January is UTC-5.
        expiresAt: "2030-01-15T17:00:00.000Z",
        items: [{ productId: "sticker-pack", allowedVariantIds: ["matte"], maxQuantity: 2, maxUnitPriceMinor: 150 }],
      },
    });
  });

  it("produces terms the domain's own schema accepts", () => {
    const result = validateForm(valid());
    expect(result.ok).toBe(true);
    if (result.ok) expect(MandateTermsSchema.safeParse(result.terms).success).toBe(true);
  });

  it("sends no allowedVariantIds at all for 'Any variant'", () => {
    const result = validateForm(valid({ items: [row({ variantMode: "any", variantIds: [] })] }));
    expect(result.ok).toBe(true);
    if (result.ok) expect("allowedVariantIds" in (result.terms.items[0] ?? {})).toBe(false);
  });

  it("ignores variants that were ticked before switching back to 'Any variant'", () => {
    const result = validateForm(valid({ items: [row({ variantMode: "any", variantIds: ["matte", "gloss"] })] }));
    expect(result.ok).toBe(true);
    if (result.ok) expect("allowedVariantIds" in (result.terms.items[0] ?? {})).toBe(false);
  });

  it("trims the summary", () => {
    const result = validateForm(valid({ intentSummary: "   Two packs  " }));
    expect(result.ok && result.intentSummary).toBe("Two packs");
  });

  it("does not block an expiry in the past: the gate decides expiry", () => {
    expect(validateForm(valid({ expiresLocal: "2020-01-01T00:00" })).ok).toBe(true);
  });

  it("accepts several distinct products", () => {
    const result = validateForm(valid({ items: [row(), row({ key: "b", productId: "enamel-pin", variantMode: "any", variantIds: [] })] }));
    expect(result.ok && result.terms.items.map((item) => item.productId)).toEqual(["sticker-pack", "enamel-pin"]);
  });
});

describe("validateForm: an empty form", () => {
  it("says what is missing, in form order", () => {
    const result = validateForm(emptyForm("a"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      { field: FIELD_INTENT, message: "Describe what this mandate is for." },
      { field: FIELD_TOTAL, message: "Enter the maximum total." },
      { field: FIELD_EXPIRES, message: "Choose when the mandate expires." },
      { field: itemField("a", "product"), message: "Choose a product." },
      { field: itemField("a", "quantity"), message: "Enter the maximum quantity." },
      { field: itemField("a", "unitPrice"), message: "Enter the maximum unit price." },
    ]);
  });

  it("gives one message per field", () => {
    const result = validateForm(emptyForm("a"));
    if (result.ok) throw new Error("expected invalid");
    const fields = result.issues.map((issue) => issue.field);
    expect(new Set(fields).size).toBe(fields.length);
  });
});

describe("validateForm: values the schema judges", () => {
  it("takes the minimum from the schema, not from this file", () => {
    expect(issuesOf(valid({ maxTotal: "0" }))[FIELD_TOTAL]).toBe("Must be at least $0.01 USD.");
    expect(issuesOf(valid({ items: [row({ maxUnitPrice: "0" })] }))[itemField("a", "unitPrice")]).toBe(
      "Must be at least $0.01 USD.",
    );
  });

  it("takes the quantity limits from the schema", () => {
    expect(issuesOf(valid({ items: [row({ maxQuantity: "0" })] }))[itemField("a", "quantity")]).toBe("Must be at least 1.");
    const over = String(MAX_QUANTITY + 1);
    expect(issuesOf(valid({ items: [row({ maxQuantity: over })] }))[itemField("a", "quantity")]).toBe(
      `Must be at most ${MAX_QUANTITY.toLocaleString("en-US")}.`,
    );
    expect(validateForm(valid({ items: [row({ maxQuantity: String(MAX_QUANTITY) })] })).ok).toBe(true);
  });

  it("takes the summary length from the schema", () => {
    const max = ConfirmedMandateSchema.shape.intentSummary.maxLength;
    expect(max).toBeGreaterThan(0);
    expect(validateForm(valid({ intentSummary: "x".repeat(max as number) })).ok).toBe(true);
    expect(issuesOf(valid({ intentSummary: "x".repeat((max as number) + 1) }))[FIELD_INTENT]).toBe(
      `Use at most ${(max as number).toLocaleString("en-US")} characters.`,
    );
  });

  it("takes the item-count limit from the schema", () => {
    const rows = Array.from({ length: MAX_ITEMS_PER_MANDATE + 1 }, (_, index) =>
      row({ key: `k${index}`, productId: `product-${index}` }),
    );
    expect(issuesOf(valid({ items: rows }))[FIELD_ITEMS]).toBe(`Add at most ${MAX_ITEMS_PER_MANDATE} items.`);
  });

  it("requires at least one item", () => {
    expect(issuesOf(valid({ items: [] }))[FIELD_ITEMS]).toBe("Add at least one item.");
  });

  it("refuses the same product twice", () => {
    const issues = issuesOf(valid({ items: [row(), row({ key: "b" })] }));
    expect(issues[FIELD_ITEMS]).toBe("Each product can appear only once.");
  });

  it("refuses the same variant twice", () => {
    const issues = issuesOf(valid({ items: [row({ variantIds: ["matte", "matte"] })] }));
    expect(issues[itemField("a", "variants")]).toBe("Each variant can be listed only once.");
  });

  it("refuses a product id the schema does not accept", () => {
    expect(issuesOf(valid({ items: [row({ productId: "not valid!" })] }))[itemField("a", "product")]).toBe(
      "This product id is not valid.",
    );
  });

  it("refuses a variant id the schema does not accept", () => {
    expect(issuesOf(valid({ items: [row({ variantIds: ["bad variant!"] })] }))[itemField("a", "variants")]).toBe(
      "A variant id is not valid.",
    );
  });
});

describe("validateForm: text that cannot become a value", () => {
  it("explains a malformed amount", () => {
    for (const bad of ["1.505", "abc", "-1", "1e3"]) {
      expect(issuesOf(valid({ maxTotal: bad }))[FIELD_TOTAL]).toBe(
        "Enter an amount in dollars, such as 12.50 (at most two decimals).",
      );
    }
  });

  it("explains a malformed quantity", () => {
    expect(issuesOf(valid({ items: [row({ maxQuantity: "1.5" })] }))[itemField("a", "quantity")]).toBe(
      "Enter a whole number, such as 2.",
    );
  });

  it("explains an expiry that does not exist", () => {
    expect(issuesOf(valid({ expiresLocal: "2026-02-30T10:00" }))[FIELD_EXPIRES]).toBe(
      "Enter a date and time that exists in your time zone.",
    );
  });

  // The schema would also refuse an empty list (min 1), so this checks the person gets
  // one clear message, not two. D-024: an empty list is never read as "no restriction".
  it("flags 'Only' with nothing ticked, once", () => {
    const form = valid({ items: [row({ variantMode: "only", variantIds: [] })] });
    const result = validateForm(form);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const variantIssues = result.issues.filter((issue) => issue.field === itemField("a", "variants"));
    expect(variantIssues).toEqual([
      { field: itemField("a", "variants"), message: "Tick at least one variant, or choose Any variant." },
    ]);
  });

  it("does not hide schema problems behind a conversion problem in another field", () => {
    const issues = issuesOf(valid({ maxTotal: "oops", items: [row({ maxQuantity: "0" })] }));
    expect(issues[FIELD_TOTAL]).toBeDefined();
    expect(issues[itemField("a", "quantity")]).toBe("Must be at least 1.");
  });

  it("lists problems in form order whatever order they were found in", () => {
    const result = validateForm(valid({ intentSummary: "", items: [row({ maxQuantity: "0" }), row({ key: "b", productId: "" })] }));
    if (result.ok) throw new Error("expected invalid");
    expect(result.issues.map((issue) => issue.field)).toEqual([
      FIELD_INTENT,
      itemField("a", "quantity"),
      itemField("b", "product"),
    ]);
  });
});

describe("draftToForm", () => {
  let counter = 0;
  const newKey = () => `k${++counter}`;
  const draft = (over: Partial<MandateDraft> = {}): MandateDraft => ({
    intentSummary: "Buy two matte sticker packs",
    currency: "USD",
    maxTotalMinor: 500,
    items: [{ productId: "sticker-pack", allowedVariantIds: ["matte"], maxQuantity: 2, maxUnitPriceMinor: 150 }],
    expiresAt: "2030-01-15T17:00:00.000Z",
    notes: [],
    ...over,
  });

  it("copies what the draft holds, as text a person would type", () => {
    counter = 0;
    const { form, adjustments } = draftToForm(draft(), newKey);
    expect(adjustments).toEqual([]);
    expect(form).toEqual({
      intentSummary: "Buy two matte sticker packs",
      maxTotal: "5.00",
      expiresLocal: "2030-01-15T12:00",
      items: [
        { key: "k1", productId: "sticker-pack", variantMode: "only", variantIds: ["matte"], maxQuantity: "2", maxUnitPrice: "1.50" },
      ],
      fromDraft: {
        [FIELD_INTENT]: true,
        [FIELD_TOTAL]: true,
        [FIELD_EXPIRES]: true,
        [itemField("k1", "product")]: true,
        [itemField("k1", "variants")]: true,
        [itemField("k1", "quantity")]: true,
        [itemField("k1", "unitPrice")]: true,
      },
    });
  });

  it("leaves everything the AI left empty empty, and fills nothing in", () => {
    counter = 0;
    const { form, adjustments } = draftToForm(
      draft({
        intentSummary: "",
        maxTotalMinor: null,
        expiresAt: null,
        items: [{ productId: null, maxQuantity: null, maxUnitPriceMinor: null }],
      }),
      newKey,
    );
    expect(adjustments).toEqual([]);
    expect(form).toEqual({
      intentSummary: "",
      maxTotal: "",
      expiresLocal: "",
      items: [{ key: "k1", productId: "", variantMode: "any", variantIds: [], maxQuantity: "", maxUnitPrice: "" }],
      fromDraft: {},
    });
  });

  it("still offers one empty row when the draft has no items", () => {
    counter = 0;
    const { form } = draftToForm(draft({ items: [] }), newKey);
    expect(form.items).toEqual([emptyItem("k1")]);
  });

  it("does not turn an absent variant list into one, and does not turn an empty list into 'Any'", () => {
    counter = 0;
    const absent = draftToForm(draft({ items: [{ productId: "p", maxQuantity: 1, maxUnitPriceMinor: 100 }] }), newKey).form;
    expect(absent.items[0]?.variantMode).toBe("any");
    // D-024: an empty list is not a valid term and must not loosen a limit. It stays a
    // visible problem for the person to fix.
    const empty = draftToForm(
      draft({ items: [{ productId: "p", allowedVariantIds: [], maxQuantity: 1, maxUnitPriceMinor: 100 }] }),
      newKey,
    ).form;
    expect(empty.items[0]).toMatchObject({ variantMode: "only", variantIds: [] });
    expect(issuesOf({ ...empty, intentSummary: "x", maxTotal: "1", expiresLocal: "2030-01-15T12:00" })[
      itemField(empty.items[0]?.key ?? "", "variants")
    ]).toBe("Tick at least one variant, or choose Any variant.");
  });

  it("keeps a zero from the draft so validation can object to it", () => {
    counter = 0;
    const { form } = draftToForm(
      draft({ maxTotalMinor: 0, items: [{ productId: "p", maxQuantity: 0, maxUnitPriceMinor: 0 }] }),
      newKey,
    );
    expect(form.maxTotal).toBe("0.00");
    expect(form.items[0]).toMatchObject({ maxQuantity: "0", maxUnitPrice: "0.00" });
  });

  it("says so when the expiry had seconds and is rounded down to the minute", () => {
    counter = 0;
    const { form, adjustments } = draftToForm(draft({ expiresAt: "2030-01-15T17:00:45Z" }), newKey);
    expect(form.expiresLocal).toBe("2030-01-15T12:00");
    expect(adjustments).toEqual([
      "The draft's expiry had seconds. The form uses the minute before it, which is the stricter side.",
    ]);
  });

  it("says so, and leaves the field empty and unmarked, when the expiry cannot be read", () => {
    counter = 0;
    const { form, adjustments } = draftToForm(draft({ expiresAt: "next Friday" }), newKey);
    expect(form.expiresLocal).toBe("");
    expect(FIELD_EXPIRES in form.fromDraft).toBe(false);
    expect(adjustments).toEqual([`The draft's expiry ("next Friday") could not be read as a date and time. Choose one.`]);
  });

  it("gives every row its own key", () => {
    counter = 0;
    const { form } = draftToForm(
      draft({
        items: [
          { productId: "a", maxQuantity: 1, maxUnitPriceMinor: 1 },
          { productId: "b", maxQuantity: 1, maxUnitPriceMinor: 1 },
        ],
      }),
      newKey,
    );
    expect(form.items.map((item) => item.key)).toEqual(["k1", "k2"]);
  });

  it("produces a form that validates when the draft is complete", () => {
    counter = 0;
    expect(validateForm(draftToForm(draft(), newKey).form).ok).toBe(true);
  });
});

describe("withoutMark", () => {
  it("removes one mark and leaves the others", () => {
    const form: MandateFormState = { ...emptyForm("a"), fromDraft: { [FIELD_INTENT]: true, [FIELD_TOTAL]: true } };
    expect(withoutMark(form, FIELD_INTENT).fromDraft).toEqual({ [FIELD_TOTAL]: true });
  });
  it("returns the same object when there is nothing to remove", () => {
    const form = emptyForm("a");
    expect(withoutMark(form, FIELD_INTENT)).toBe(form);
  });
});

describe("domId", () => {
  it("makes an element id from a field name", () => {
    expect(domId("item.k1.unitPrice")).toBe("field-item-k1-unitPrice");
    expect(domId(FIELD_TOTAL)).toBe("field-maxTotal");
  });
});

describe("describeTerms", () => {
  const products: CatalogueProduct[] = [
    { productId: "sticker-pack", name: "Sticker pack", unitPriceMinor: 100, variantIds: ["matte", "gloss"] },
  ];
  it("states the terms in plain words, with the exact UTC value", () => {
    const result = validateForm(valid());
    if (!result.ok) throw new Error("expected valid");
    const text = describeTerms(result.terms, products, "en-US");
    expect(text.headline).toContain("Up to $5.00 USD in total, until Jan 15, 2030");
    expect(text.headline).toContain("(2030-01-15T17:00:00.000Z UTC)");
    expect(text.lines).toEqual(["Sticker pack: at most 2 at up to $1.50 USD each (only matte)."]);
  });
  it("names a product that is not in the catalogue by its id, and says 'any variant'", () => {
    const text = describeTerms(
      {
        currency: "USD",
        maxTotalMinor: 100,
        expiresAt: "2030-01-15T17:00:00.000Z",
        items: [{ productId: "mystery", maxQuantity: 1, maxUnitPriceMinor: 100 }],
      },
      products,
      "en-US",
    );
    expect(text.lines).toEqual(["mystery: at most 1 at up to $1.00 USD each (any variant)."]);
  });
});
