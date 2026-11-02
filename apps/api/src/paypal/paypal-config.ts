import { ConfigError } from "../config.ts";
import { PAYPAL_ID } from "./responses.ts";

// PayPal calls are locked to the sandbox (D-010). The base URL is a constant,
// not a setting, so a mistyped or malicious value can never redirect requests
// that carry credentials.
export const PAYPAL_SANDBOX_BASE_URL = "https://api-m.sandbox.paypal.com";

export type PayPalConfig = {
  readonly baseUrl: typeof PAYPAL_SANDBOX_BASE_URL;
  readonly clientId: string;
  readonly clientSecret: string;
  // The payment-token id from vault step 01b.2, not the setup-token id.
  readonly vaultId: string;
};

const MAX_VALUE_LENGTH = 512;

// Messages name the variable and the rule, never the rejected value, so a
// secret pasted into the wrong variable cannot leak into logs.
function required(env: Readonly<Record<string, string | undefined>>, name: string): string {
  const value = env[name];
  if (value === undefined || value === "") throw new ConfigError(`${name} is required.`);
  if (value.length > MAX_VALUE_LENGTH) throw new ConfigError(`${name} is too long.`);
  if (!/^\S+$/.test(value)) throw new ConfigError(`${name} must not contain whitespace.`);
  return value;
}

export function loadPayPalConfig(env: Readonly<Record<string, string | undefined>>): PayPalConfig {
  // An empty PAYPAL_BASE_URL counts as unset. Anything else must be exactly the
  // sandbox URL, so the old setting is never silently ignored.
  const baseUrl = env["PAYPAL_BASE_URL"];
  if (baseUrl !== undefined && baseUrl !== "" && baseUrl !== PAYPAL_SANDBOX_BASE_URL) {
    throw new ConfigError(
      `PAYPAL_BASE_URL, when set, must be exactly ${PAYPAL_SANDBOX_BASE_URL}. Other hosts are not supported.`,
    );
  }

  const clientId = required(env, "PAYPAL_CLIENT_ID");
  const clientSecret = required(env, "PAYPAL_CLIENT_SECRET");
  const vaultId = required(env, "PAYPAL_VAULT_ID");
  // The vault id is placed in a URL path, so it is held to the same safe
  // alphabet as every other PayPal id.
  if (!PAYPAL_ID.test(vaultId)) {
    throw new ConfigError("PAYPAL_VAULT_ID may contain only letters, digits, hyphens and underscores.");
  }

  return { baseUrl: PAYPAL_SANDBOX_BASE_URL, clientId, clientSecret, vaultId };
}
