import { ConfigError } from "../config.ts";

// Anthropic calls are locked to the first-party API, like PayPal calls are
// locked to the sandbox (D-010). The SDK would otherwise honour an
// ANTHROPIC_BASE_URL setting, and the request carries the API key.
export const ANTHROPIC_BASE_URL = "https://api.anthropic.com";

export type AnthropicConfig = {
  readonly baseUrl: typeof ANTHROPIC_BASE_URL;
  readonly apiKey: string;
};

const MAX_KEY_LENGTH = 512;

// Drafting is optional (D-024): with no key the server still runs, and the draft
// route answers 503. A key that is set but malformed is a mistake worth stopping
// for. Messages name the variable and the rule, never the value.
export function loadAnthropicConfig(env: Readonly<Record<string, string | undefined>>): AnthropicConfig | null {
  const baseUrl = env["ANTHROPIC_BASE_URL"];
  if (baseUrl !== undefined && baseUrl !== "" && baseUrl !== ANTHROPIC_BASE_URL) {
    throw new ConfigError(
      `ANTHROPIC_BASE_URL, when set, must be exactly ${ANTHROPIC_BASE_URL}. Other hosts are not supported.`,
    );
  }

  const apiKey = env["ANTHROPIC_API_KEY"];
  if (apiKey === undefined || apiKey === "") return null;
  if (apiKey.length > MAX_KEY_LENGTH) throw new ConfigError("ANTHROPIC_API_KEY is too long.");
  if (!/^\S+$/.test(apiKey)) throw new ConfigError("ANTHROPIC_API_KEY must not contain whitespace.");
  return { baseUrl: ANTHROPIC_BASE_URL, apiKey };
}
