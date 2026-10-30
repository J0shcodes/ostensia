export type NodeEnv = "development" | "test" | "production";

export type Config = {
  readonly nodeEnv: NodeEnv;
  readonly port: number;
  readonly host: "127.0.0.1";
};

// Messages name the variable and the rule, never the rejected value, so a
// mistyped secret pasted into the wrong variable cannot leak into logs.
export class ConfigError extends Error {
  override name = "ConfigError";
}

const NODE_ENVS: readonly NodeEnv[] = ["development", "test", "production"];
const DEFAULT_PORT = 4000;

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

  return { nodeEnv, port, host: "127.0.0.1" };
}
