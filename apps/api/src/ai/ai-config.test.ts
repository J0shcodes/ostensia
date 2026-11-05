import { describe, expect, it } from "vitest";
import { ConfigError } from "../config.ts";
import { ANTHROPIC_BASE_URL, loadAnthropicConfig } from "./ai-config.ts";

function messageFor(env: Record<string, string | undefined>): string {
  try {
    loadAnthropicConfig(env);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as ConfigError).message;
  }
  throw new Error("expected loadAnthropicConfig to throw");
}

describe("loadAnthropicConfig", () => {
  it("is null when no key is set, so drafting is off and the server still runs", () => {
    expect(loadAnthropicConfig({})).toBeNull();
    expect(loadAnthropicConfig({ ANTHROPIC_API_KEY: "" })).toBeNull();
  });

  it("returns the key and the fixed host", () => {
    expect(loadAnthropicConfig({ ANTHROPIC_API_KEY: "synthetic-key-123" })).toEqual({
      baseUrl: "https://api.anthropic.com",
      apiKey: "synthetic-key-123",
    });
  });

  it("accepts a base URL that is exactly the fixed host, or empty", () => {
    expect(loadAnthropicConfig({ ANTHROPIC_API_KEY: "k", ANTHROPIC_BASE_URL: ANTHROPIC_BASE_URL })?.apiKey).toBe("k");
    expect(loadAnthropicConfig({ ANTHROPIC_API_KEY: "k", ANTHROPIC_BASE_URL: "" })?.apiKey).toBe("k");
  });

  it.each(["https://evil.example", "http://api.anthropic.com", "https://api.anthropic.com/", "https://api.anthropic.com.evil.example"])(
    "rejects ANTHROPIC_BASE_URL=%s even when no key is set, so the old setting is never silently ignored",
    (url) => {
      expect(messageFor({ ANTHROPIC_BASE_URL: url })).toContain("ANTHROPIC_BASE_URL");
      expect(messageFor({ ANTHROPIC_API_KEY: "k", ANTHROPIC_BASE_URL: url })).toContain("ANTHROPIC_BASE_URL");
    },
  );

  it.each(["key with space", " key", "key\n", "a".repeat(513)])("rejects a malformed key (%j)", (key) => {
    expect(messageFor({ ANTHROPIC_API_KEY: key })).toContain("ANTHROPIC_API_KEY");
  });

  it("does not echo a rejected value", () => {
    const badKey = "bad key with leak-marker-6612";
    const badUrl = "https://leak-marker-9034.example";
    expect(messageFor({ ANTHROPIC_API_KEY: badKey })).not.toContain("leak-marker-6612");
    expect(messageFor({ ANTHROPIC_BASE_URL: badUrl })).not.toContain("leak-marker-9034");
  });
});
