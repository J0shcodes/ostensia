import { describe, expect, it } from "vitest";
import { ConfigError } from "../config.ts";
import { PAYPAL_SANDBOX_BASE_URL, loadPayPalConfig } from "./paypal-config.ts";

const VALID = {
  PAYPAL_CLIENT_ID: "client-id-value",
  PAYPAL_CLIENT_SECRET: "client-secret-value",
  PAYPAL_VAULT_ID: "vault_id-1",
};

function messageFor(env: Record<string, string | undefined>): string {
  try {
    loadPayPalConfig(env);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as ConfigError).message;
  }
  throw new Error("expected loadPayPalConfig to throw");
}

describe("loadPayPalConfig", () => {
  it("reads the three settings and always uses the sandbox URL", () => {
    expect(loadPayPalConfig(VALID)).toEqual({
      baseUrl: PAYPAL_SANDBOX_BASE_URL,
      clientId: "client-id-value",
      clientSecret: "client-secret-value",
      vaultId: "vault_id-1",
    });
  });

  it.each(["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_VAULT_ID"])("requires %s", (name) => {
    expect(messageFor({ ...VALID, [name]: undefined })).toBe(`${name} is required.`);
    expect(messageFor({ ...VALID, [name]: "" })).toBe(`${name} is required.`);
  });

  it.each(["has space", " leading", "trailing ", "tab\there", "new\nline"])("rejects whitespace in a secret: %j", (value) => {
    expect(messageFor({ ...VALID, PAYPAL_CLIENT_SECRET: value })).toContain("PAYPAL_CLIENT_SECRET");
  });

  it("rejects a value that is too long", () => {
    expect(messageFor({ ...VALID, PAYPAL_CLIENT_ID: "x".repeat(513) })).toBe("PAYPAL_CLIENT_ID is too long.");
  });

  it.each(["a/b", "..", "a?b", "a%2Fb", "a.b", "x".repeat(129)])("rejects the vault id %j", (value) => {
    expect(messageFor({ ...VALID, PAYPAL_VAULT_ID: value })).toContain("PAYPAL_VAULT_ID");
  });

  it.each(["A", "abc-DEF_123", "x".repeat(128)])("accepts the vault id %j", (value) => {
    expect(loadPayPalConfig({ ...VALID, PAYPAL_VAULT_ID: value }).vaultId).toBe(value);
  });

  describe("PAYPAL_BASE_URL", () => {
    it("may be unset, empty, or exactly the sandbox URL", () => {
      for (const value of [undefined, "", PAYPAL_SANDBOX_BASE_URL]) {
        expect(loadPayPalConfig({ ...VALID, PAYPAL_BASE_URL: value }).baseUrl).toBe(PAYPAL_SANDBOX_BASE_URL);
      }
    });

    it.each([
      "https://api-m.paypal.com",
      "https://evil.example.test",
      "http://api-m.sandbox.paypal.com",
      "https://api-m.sandbox.paypal.com/",
      "https://api-m.sandbox.paypal.com.evil.test",
      "api-m.sandbox.paypal.com",
    ])("rejects %s with one fixed message that does not echo it", (value) => {
      expect(messageFor({ ...VALID, PAYPAL_BASE_URL: value })).toBe(
        `PAYPAL_BASE_URL, when set, must be exactly ${PAYPAL_SANDBOX_BASE_URL}. Other hosts are not supported.`,
      );
    });
  });

  it("never puts a rejected value in a message", () => {
    for (const name of ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_VAULT_ID"]) {
      const message = messageFor({ ...VALID, [name]: "secret value with spaces" });
      expect(message).not.toContain("secret value");
    }
  });
});
