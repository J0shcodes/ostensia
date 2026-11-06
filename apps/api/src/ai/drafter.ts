import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MandateDraftSchema } from "@ostensia/domain";
import type { MandateDraft } from "@ostensia/domain";
import { SYSTEM_PROMPT, userMessage } from "./prompt.ts";
import { isOutputParseError, unavailableReason } from "./provider-errors.ts";
import type { UnavailableReason } from "./provider-errors.ts";

// The mandate drafter (D-024). It sends the person's description to a model and
// returns a DRAFT: terms for the person to review, edit and confirm. It decides
// nothing and enforces nothing. Like the PayPal adapter it returns a value for
// everything the provider can do, and throws only for a bug of our own.

export const DRAFT_MODEL = "claude-opus-5-5";
const MAX_OUTPUT_TOKENS = 16000;

export type DraftUsage = { readonly inputTokens: number; readonly outputTokens: number };

export type DraftResult =
  | { readonly kind: "drafted"; readonly draft: MandateDraft; readonly usage: DraftUsage | null }
  // The model declined. `category` is the provider's label, or null.
  | { readonly kind: "refused"; readonly category: string | null }
  // The model answered, but not with a usable draft.
  | { readonly kind: "invalid_output"; readonly detail: "max_tokens" | "no_output" | "schema_mismatch" }
  // The provider could not be used. Nothing was drafted.
  | { readonly kind: "unavailable"; readonly reason: UnavailableReason };

export type MandateDrafter = {
  draft(instruction: string, now: Date): Promise<DraftResult>;
};

export type AnthropicDrafterOptions = {
  readonly client: Anthropic;
  readonly model?: string;
};

export function createAnthropicDrafter(options: AnthropicDrafterOptions): MandateDrafter {
  const { client } = options;
  const model = options.model ?? DRAFT_MODEL;

  return {
    async draft(instruction, now) {
      let response;
      try {
        // Drafting only reads and returns text, so the SDK's own retries on
        // 429 and 5xx are safe here (unlike a PayPal write).
        response = await client.beta.messages.parse({
          model,
          max_tokens: MAX_OUTPUT_TOKENS,
          // If a safety classifier declines the request, another model answers
          // inside the same call; a refusal that remains is returned as refused.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage(instruction, now) }],
          output_config: { effort: "medium", format: zodOutputFormat(MandateDraftSchema) },
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

      // The SDK has already parsed it. It is checked again here so that nothing
      // downstream relies on a library having done the check.
      const checked = MandateDraftSchema.safeParse(response.parsed_output);
      if (!checked.success) return { kind: "invalid_output", detail: "schema_mismatch" };

      const usage = response.usage;
      return {
        kind: "drafted",
        draft: checked.data,
        usage:
          usage === undefined || usage === null
            ? null
            : { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens },
      };
    },
  };
}
