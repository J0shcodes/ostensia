// The synthetic catalogue (D-012). Every product here is fictional and exists
// only so the simulated shopping agent has something to propose. Prices are
// integer minor units (US cents). Nothing here is a real merchant or a real
// price, and nothing here is sent to PayPal.
export type CatalogueProduct = {
  readonly productId: string;
  readonly name: string;
  readonly unitPriceMinor: number;
  readonly variantIds: readonly string[];
};

export const SIMULATION_LABEL = "Simulated shopping agent (synthetic catalogue; not a real merchant)";

export const CATALOGUE: readonly CatalogueProduct[] = [
  { productId: "sticker-pack", name: "Sticker pack", unitPriceMinor: 100, variantIds: ["matte", "gloss"] },
  { productId: "enamel-pin", name: "Enamel pin", unitPriceMinor: 250, variantIds: ["star", "moon"] },
  { productId: "canvas-tote", name: "Canvas tote", unitPriceMinor: 500, variantIds: ["natural", "black"] },
  { productId: "ceramic-mug", name: "Ceramic mug", unitPriceMinor: 1200, variantIds: ["white", "blue"] },
];
