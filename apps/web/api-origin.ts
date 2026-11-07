// Where the Next.js server forwards /api requests (D-027). Read only on the server,
// from next.config.ts. It never reaches browser code.
//
// The rule is deliberately narrow: the API listens on 127.0.0.1 only (D-006), so the
// only accepted origin is exactly http://127.0.0.1:<port>. No other host, no
// credentials, path, query string or fragment. Error messages name the variable and
// the rule and never the rejected value, so a mistyped secret pasted into the wrong
// variable cannot end up in a log.

export const DEFAULT_API_ORIGIN = "http://127.0.0.1:4000";

export class ApiOriginError extends Error {
  override name = "ApiOriginError";
}

const ORIGIN_PATTERN = /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})$/;

export function parseApiOrigin(raw: string | undefined): string {
  if (raw === undefined || raw === "") return DEFAULT_API_ORIGIN;
  const match = ORIGIN_PATTERN.exec(raw);
  if (match === null || Number(match[1]) > 65535) {
    throw new ApiOriginError(
      "API_ORIGIN must be exactly http://127.0.0.1:<port>, with a port from 1 to 65535 and nothing else: " +
        "no other host, credentials, path, query string or fragment.",
    );
  }
  return raw;
}
