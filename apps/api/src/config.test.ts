import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config.ts";

function messageFor(env: Record<string, string | undefined>): string {
  try {
    loadConfig(env);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as ConfigError).message;
  }
  throw new Error("expected loadConfig to throw");
}

describe("loadConfig", () => {
  it("applies defaults when nothing is set", () => {
    expect(loadConfig({})).toEqual({
      nodeEnv: "development",
      port: 4000,
      host: "127.0.0.1",
      auditLogPath: "data/audit.jsonl",
    });
  });

  it("accepts valid values", () => {
    expect(loadConfig({ NODE_ENV: "production", PORT: "8080", AUDIT_LOG_PATH: "data/other.jsonl" })).toEqual({
      nodeEnv: "production",
      port: 8080,
      host: "127.0.0.1",
      auditLogPath: "data/other.jsonl",
    });
  });

  it("treats an empty AUDIT_LOG_PATH as unset", () => {
    expect(loadConfig({ AUDIT_LOG_PATH: "" }).auditLogPath).toBe("data/audit.jsonl");
  });

  it.each([" data/a.jsonl", "data/a.jsonl ", "a".repeat(513), "data/\u0000a.jsonl"])(
    "rejects AUDIT_LOG_PATH=%j",
    (path) => {
      expect(messageFor({ AUDIT_LOG_PATH: path })).toContain("AUDIT_LOG_PATH");
    },
  );

  it("accepts the port boundaries 1 and 65535", () => {
    expect(loadConfig({ PORT: "1" }).port).toBe(1);
    expect(loadConfig({ PORT: "65535" }).port).toBe(65535);
  });

  it.each(["0", "65536", "-1", "40.5", "abc", "4000abc", "", " 4000", "1e3"])(
    "rejects PORT=%j",
    (port) => {
      expect(messageFor({ PORT: port })).toContain("PORT");
    },
  );

  it.each(["staging", "", "PRODUCTION"])("rejects NODE_ENV=%j", (nodeEnv) => {
    expect(messageFor({ NODE_ENV: nodeEnv })).toContain("NODE_ENV");
  });

  it("does not echo the rejected value in error messages", () => {
    const badPort = "not-a-port-9x";
    const badEnv = "not-an-env-7q";
    const badPath = " not-a-path-3z";
    expect(messageFor({ AUDIT_LOG_PATH: badPath })).not.toContain(badPath.trim());
    expect(messageFor({ PORT: badPort })).not.toContain(badPort);
    expect(messageFor({ NODE_ENV: badEnv })).not.toContain(badEnv);
  });
});
