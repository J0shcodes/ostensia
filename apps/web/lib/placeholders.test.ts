import { ConfirmedMandateSchema } from "@ostensia/domain";
import { describe, expect, it } from "vitest";
import { emptyForm } from "./mandate-form.ts";
import { MAX_INSTRUCTION_LENGTH, PLACEHOLDERS } from "./messages.ts";
import { parseMoneyToMinor, parseWholeNumber } from "./money.ts";

// A placeholder is an example of a valid value. If an example were itself rejected by the
// form, it would teach the wrong thing, so each one is checked with the same code the form
// uses. None may be a default: every field starts empty.

const stripExample = (text: string): string => text.replace(/^(Example: |e\.g\. )/, "");

describe("placeholders are examples of valid values", () => {
  it("gives the money examples an amount the form accepts, in whole cents", () => {
    expect(parseMoneyToMinor(stripExample(PLACEHOLDERS.maxTotal))).toEqual({ ok: true, minor: 500 });
    expect(parseMoneyToMinor(stripExample(PLACEHOLDERS.maxUnitPrice))).toEqual({ ok: true, minor: 150 });
  });

  it("gives the quantity example a whole number the form accepts", () => {
    expect(parseWholeNumber(stripExample(PLACEHOLDERS.maxQuantity))).toEqual({ ok: true, value: 2 });
  });

  it("gives the summary example text the domain schema accepts as a summary", () => {
    const rule = ConfirmedMandateSchema.shape.intentSummary.safeParse(stripExample(PLACEHOLDERS.intentSummary));
    expect(rule.success).toBe(true);
  });

  it("keeps the two long examples within the limit the API sets for a description", () => {
    expect(PLACEHOLDERS.instruction.length).toBeLessThan(MAX_INSTRUCTION_LENGTH);
    expect(PLACEHOLDERS.agentTask.length).toBeLessThan(MAX_INSTRUCTION_LENGTH);
  });

  it("begins every placeholder so that it reads as an example, not as a value", () => {
    for (const [name, text] of Object.entries(PLACEHOLDERS)) {
      expect(text, name).toMatch(/^(Example: |e\.g\. )/);
    }
  });
});

describe("placeholders are never defaults", () => {
  it("starts every field of the mandate form empty", () => {
    const form = emptyForm("i1");
    expect(form.intentSummary).toBe("");
    expect(form.maxTotal).toBe("");
    expect(form.expiresLocal).toBe("");
    expect(form.items[0]?.maxQuantity).toBe("");
    expect(form.items[0]?.maxUnitPrice).toBe("");
  });
});
