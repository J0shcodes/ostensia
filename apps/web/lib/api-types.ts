import type { MandateDraft, MandateTerms } from "@ostensia/domain";

// The shapes of the API responses this page reads, copied from the routes that send
// them. The domain's own types and schemas are used wherever the domain defines the
// shape (a confirmed mandate, a draft, mandate terms). What follows is only what lives
// in apps/api and so cannot be imported (the web app never imports from apps/api).
// The server stays authoritative: nothing here is a rule, only a description.

// GET /catalogue (apps/api/src/routes/simulation.ts). A synthetic shop (D-012).
export type CatalogueProduct = {
  readonly productId: string;
  readonly name: string;
  readonly unitPriceMinor: number;
  readonly variantIds: readonly string[];
};
export type Catalogue = {
  readonly label: string;
  readonly products: readonly CatalogueProduct[];
};

// POST /mandates/draft (apps/api/src/routes/draft.ts). The draft is the AI's; the
// completeness check and the warnings come from deterministic code (D-024).
export type DraftCompleteness =
  | {
      readonly status: "complete";
      readonly terms: MandateTerms;
      readonly missing: readonly string[];
      readonly problems: readonly string[];
    }
  | {
      readonly status: "incomplete";
      readonly missing: readonly string[];
      readonly problems: readonly string[];
    };

export type DraftResponse = {
  readonly label: string;
  readonly draft: MandateDraft;
  readonly completeness: DraftCompleteness;
  readonly warnings: readonly string[];
};
