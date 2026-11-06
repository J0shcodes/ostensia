import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { MandateTerms } from "@ostensia/domain";
import { z } from "zod";
import { CATALOGUE } from "../simulation/catalogue.ts";
import type { CartLine } from "./cart.ts";
import { isOutputParseError, unavailableReason } from "./provider-errors.ts";
import type { UnavailableReason } from "./provider-errors.ts";
import { shopUserMessage, systemPrompt } from "./shopper-prompt.ts";
import type { ShopMode } from "./shopper-prompt.ts";

// The AI shopping agent (D-025). It turns a task into a CART: products, variants
// and quantities from the synthetic catalogue. It proposes and nothing more: it
// states no price, creates no attempt, and calls no PayPal operation. The cart
// becomes an ordinary purchase proposal (cart.ts), and the same deterministic
// gate that checks any proposal decides whether it is allowed. Like the drafter
// it returns a value for everything the provider can do, and throws only for a
// bug of our own.

export const SHOPPER_MODEL = "claude-opus-5-5";
const MAX_OUTPUT_TOKENS = 16000;
const MAX_LINES = 10;
const MAX_QUANTITY_PER_LINE = 20;

const PRODUCT_IDS = CATALOGUE.map((product) => product.productId) as [string, ...string[]];
const VARIANT_IDS = [...new Set(CATALOGUE.flatMap((product) => product.variantIds))] as [string, ...string[]];

// The ids are enumerated, which tells the model what the shop sells. The SDK
// (1.3.0) sends an enum to the API as description text, not as a constraint, so
// the API does not enforce it: our own validation does. A reply that names a
// product or variant the shop does not have fails the parse below and is returned
// as invalid_output. Whether a variant belongs to its product is checked in
// cart.ts. (TD-024)
export const ShopperOutputSchema = z.strictObject({
  lines: z
    .array(
      z.strictObject({
        productId: z.enum(PRODUCT_IDS),
        variantId: z.enum(VARIANT_IDS),
        quantity: z.int().min(1).max(MAX_QUANTITY_PER_LINE),
      }),
    )
    .max(MAX_LINES),
  rationale: z.string().max(600),
  declinedReason: z.string().max(300).nullable(),
});

export type ShopUsage = { readonly inputTokens: number; readonly outputTokens: number };

export type ShopResult =
  | { readonly kind: "proposed"; readonly lines: readonly CartLine[]; readonly rationale: string; readonly usage: ShopUsage | null }
  // The agent chose to buy nothing, and said why.
  | { readonly kind: "declined"; readonly reason: string; readonly rationale: string; readonly usage: ShopUsage | null }
  | { readonly kind: "refused"; readonly category: string | null }
  | { readonly kind: "invalid_output"; readonly detail: "max_tokens" | "no_output" | "schema_mismatch" }
  | { readonly kind: "unavailable"; readonly reason: UnavailableReason };

export type ShopInput = {
  readonly task: string;
  readonly mode: ShopMode;
  // The mandate's terms. Only an informed agent is shown them.
  readonly terms: MandateTerms;
};

export type ShoppingAgent = {
  shop(input: ShopInput): Promise<ShopResult>;
};

export type AnthropicShopperOptions = {
  readonly client: Anthropic;
  readonly model?: string;
};

export function createAnthropicShopper(options: AnthropicShopperOptions): ShoppingAgent {
  const { client } = options;
  const model = options.model ?? SHOPPER_MODEL;

  return {
    async shop(input) {
      let response;
      try {
        // Choosing a cart only reads and returns text, so the SDK's own retries
        // on 429 and 5xx are safe here (unlike a PayPal write).
        response = await client.beta.messages.parse({
          model,
          max_tokens: MAX_OUTPUT_TOKENS,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: systemPrompt(input.mode),
          messages: [{ role: "user", content: shopUserMessage(input.task, input.mode, input.terms) }],
          output_config: { effort: "medium", format: zodOutputFormat(ShopperOutputSchema) },
        });
      } catch (error) {
        const reason = unavailableReason(error);
        if (reason !== null) return { kind: "unavailable", reason };
        if (isOutputParseError(error)) return { kind: "invalid_output", detail: "schema_mismatch" };
        throw error;
      }

      if (response.stop_reason === "refusal") {
        return { kind: "refused", category: response.stop_details?.category ?? null };
      }
      if (response.stop_reason === "max_tokens") return { kind: "invalid_output", detail: "max_tokens" };
      if (response.parsed_output === null) return { kind: "invalid_output", detail: "no_output" };

      // Checked again here so that nothing downstream relies on a library having
      // done the check.
      const checked = ShopperOutputSchema.safeParse(response.parsed_output);
      if (!checked.success) return { kind: "invalid_output", detail: "schema_mismatch" };
      const output = checked.data;

      const usage =
        response.usage === undefined || response.usage === null
          ? null
          : { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };

      if (output.lines.length === 0) {
        return {
          kind: "declined",
          reason: output.declinedReason ?? "The agent proposed no items.",
          rationale: output.rationale,
          usage,
        };
      }
      // A cart together with a reason for buying nothing contradicts itself, so
      // it is not used.
      if (output.declinedReason !== null) return { kind: "invalid_output", detail: "schema_mismatch" };
      return { kind: "proposed", lines: output.lines, rationale: output.rationale, usage };
    },
  };
}
