"use client";

import { formatUsd } from "@ostensia/domain";
import type { CatalogueProduct } from "../lib/api-types.ts";
import { domId, itemField } from "../lib/mandate-form.ts";
import type { ItemFieldName, ItemForm } from "../lib/mandate-form.ts";
import { PLACEHOLDERS } from "../lib/messages.ts";
import { Button, Choice, MoneyInput, SelectInput, TextInput } from "./controls.tsx";
import { Field, FieldGroup } from "./field.tsx";
import { ProvenanceBadge } from "./provenance.tsx";
import styles from "./item-editor.module.css";

type Props = {
  readonly item: ItemForm;
  readonly index: number;
  readonly products: readonly CatalogueProduct[];
  readonly catalogueReady: boolean;
  readonly fromDraft: Readonly<Record<string, true>>;
  // Messages by field name; only the ones to show.
  readonly errors: Readonly<Record<string, string>>;
  readonly canRemove: boolean;
  // `edited` names the fields the person changed, so their "from AI draft" marks clear.
  readonly onChange: (next: ItemForm, edited: readonly ItemFieldName[]) => void;
  readonly onRemove: () => void;
};

export function ItemEditor({ item, index, products, catalogueReady, fromDraft, errors, canRemove, onChange, onRemove }: Props) {
  const field = (name: ItemFieldName): string => itemField(item.key, name);
  const mark = (name: ItemFieldName): boolean => field(name) in fromDraft;
  const error = (name: ItemFieldName): string | undefined => errors[field(name)];

  const product = products.find((candidate) => candidate.productId === item.productId);
  const unknownProduct = item.productId !== "" && product === undefined;
  // Ticks for the product's own variants, plus any the draft named that the shop does
  // not sell. Those are kept and flagged, never dropped.
  const knownVariants = product?.variantIds ?? [];
  const extraVariants = item.variantIds.filter((variant) => !knownVariants.includes(variant));
  const number = index + 1;

  const toggleVariant = (variant: string, checked: boolean): void => {
    const next = checked ? [...item.variantIds, variant] : item.variantIds.filter((entry) => entry !== variant);
    onChange({ ...item, variantIds: next }, ["variants"]);
  };

  return (
    <li className={styles["item"]}>
      <div className={styles["header"]}>
        <h3 className={styles["title"]}>Item {number}</h3>
        {canRemove ? (
          <Button variant="text" aria-label={`Remove item ${number}`} onClick={onRemove}>
            Remove
          </Button>
        ) : null}
      </div>

      <Field
        id={domId(field("product"))}
        required
        fromDraft={mark("product")}
        error={error("product")}
        label={
          <span className={styles["productLabel"]}>
            Product <ProvenanceBadge source="simulated" />
          </span>
        }
        help={
          unknownProduct
            ? "Not in the simulated catalogue. The mandate can still be confirmed, but the simulated shop cannot propose this product."
            : undefined
        }
      >
        {({ id, describedBy, invalid }) => (
          <SelectInput
            id={id}
            value={item.productId}
            invalid={invalid}
            disabled={!catalogueReady && !unknownProduct}
            onChange={(event) => onChange({ ...item, productId: event.target.value, variantMode: "any", variantIds: [] }, ["product", "variants"])}
            {...(describedBy === undefined ? {} : { "aria-describedby": describedBy })}
          >
            <option value="">{catalogueReady ? "Choose a product" : "Catalogue not loaded"}</option>
            {products.map((entry) => (
              <option key={entry.productId} value={entry.productId}>
                {entry.name} ({formatUsd(entry.unitPriceMinor)} USD)
              </option>
            ))}
            {unknownProduct ? <option value={item.productId}>{item.productId} (not in the simulated catalogue)</option> : null}
          </SelectInput>
        )}
      </Field>

      <FieldGroup id={domId(field("variants"))} legend="Variants" fromDraft={mark("variants")} error={error("variants")}>
        <div className={styles["choices"]}>
          <Choice
            type="radio"
            name={`variants-${item.key}`}
            checked={item.variantMode === "any"}
            onChange={() => onChange({ ...item, variantMode: "any" }, ["variants"])}
          >
            Any variant
          </Choice>
          <Choice
            type="radio"
            name={`variants-${item.key}`}
            checked={item.variantMode === "only"}
            onChange={() => onChange({ ...item, variantMode: "only" }, ["variants"])}
          >
            Only these variants
          </Choice>
          {item.variantMode === "only" ? (
            <div className={styles["choices"]} role="group" aria-label={`Variants allowed for item ${number}`}>
              {knownVariants.length === 0 && extraVariants.length === 0 ? (
                <p className={styles["flag"]}>Choose a product to see its variants.</p>
              ) : null}
              {knownVariants.map((variant) => (
                <Choice key={variant} type="checkbox" checked={item.variantIds.includes(variant)} onChange={(event) => toggleVariant(variant, event.target.checked)}>
                  {variant}
                </Choice>
              ))}
              {extraVariants.map((variant) => (
                <Choice key={variant} type="checkbox" checked onChange={(event) => toggleVariant(variant, event.target.checked)}>
                  {variant} <span className={styles["flag"]}>(not sold in the simulated catalogue)</span>
                </Choice>
              ))}
            </div>
          ) : null}
        </div>
      </FieldGroup>

      <div className={styles["pair"]}>
        <Field id={domId(field("quantity"))} label="Maximum quantity" required fromDraft={mark("quantity")} error={error("quantity")}>
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={item.maxQuantity}
              placeholder={PLACEHOLDERS.maxQuantity}
              invalid={invalid}
              onChange={(event) => onChange({ ...item, maxQuantity: event.target.value }, ["quantity"])}
              {...(describedBy === undefined ? {} : { "aria-describedby": describedBy })}
            />
          )}
        </Field>
        <Field
          id={domId(field("unitPrice"))}
          label="Maximum unit price (US dollars)"
          required
          fromDraft={mark("unitPrice")}
          error={error("unitPrice")}
          help={product === undefined ? undefined : `The catalogue price is ${formatUsd(product.unitPriceMinor)} USD.`}
        >
          {({ id, describedBy, invalid }) => (
            <MoneyInput
              id={id}
              value={item.maxUnitPrice}
              placeholder={PLACEHOLDERS.maxUnitPrice}
              invalid={invalid}
              onChange={(event) => onChange({ ...item, maxUnitPrice: event.target.value }, ["unitPrice"])}
              {...(describedBy === undefined ? {} : { "aria-describedby": describedBy })}
            />
          )}
        </Field>
      </div>
    </li>
  );
}
