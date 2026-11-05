export type NodeEnv = "development" | "test" | "production";

export type Config = {
  readonly nodeEnv: NodeEnv;
  readonly port: number;
  readonly host: "127.0.0.1";
  // Where the gate's append-only audit log lives (D-008). Relative paths are
  // resolved against the directory the process starts in.
  readonly auditLogPath: string;
};

// Messages name the variable and the rule, never the rejected value, so a
// mistyped secret pasted into the wrong variable cannot leak into logs.
export class ConfigError extends Error {
  override name = "ConfigError";
}

const NODE_ENVS: readonly NodeEnv[] = ["development", "test", "production"];
const DEFAULT_PORT = 4000;
const DEFAULT_AUDIT_LOG_PATH = "data/audit.jsonl";
const MAX_PATH_LENGTH = 512;

function isNodeEnv(value: string): value is NodeEnv {
  return (NODE_ENVS as readonly string[]).includes(value);
}

export function loadConfig(env: Readonly<Record<string, string | undefined>>): Config {
  const rawNodeEnv = env["NODE_ENV"];
  let nodeEnv: NodeEnv = "development";
  if (rawNodeEnv !== undefined) {
    if (!isNodeEnv(rawNodeEnv)) {
      throw new ConfigError(`NODE_ENV must be one of: ${NODE_ENVS.join(", ")}.`);
    }
    nodeEnv = rawNodeEnv;
  }

  const rawPort = env["PORT"];
  let port = DEFAULT_PORT;
  if (rawPort !== undefined) {
    const isWholeNumber = /^[0-9]+$/.test(rawPort);
    port = isWholeNumber ? Number(rawPort) : Number.NaN;
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new ConfigError("PORT must be a whole number from 1 to 65535.");
    }
  }

  const rawPath = env["AUDIT_LOG_PATH"];
  let auditLogPath = DEFAULT_AUDIT_LOG_PATH;
  if (rawPath !== undefined && rawPath !== "") {
    if (rawPath.length > MAX_PATH_LENGTH || rawPath.includes("\u0000") || rawPath.trim() !== rawPath) {
      throw new ConfigError("AUDIT_LOG_PATH must be a file path of at most 512 characters, with no surrounding whitespace.");
    }
    auditLogPath = rawPath;
  }

  return { nodeEnv, port, host: "127.0.0.1", auditLogPath };
}
