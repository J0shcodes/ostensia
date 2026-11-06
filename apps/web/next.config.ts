import type { NextConfig } from "next";
import { parseApiOrigin } from "./api-origin.ts";

// The browser only ever talks to this app's own origin. It calls /api/..., and this
// rewrite forwards the request to the Ostensia API (D-006, D-027). No CORS is needed,
// and the API's address stays on the server.
//
// `next build` writes the destination into .next/routes-manifest.json, a server-side
// file, so API_ORIGIN has to be set before building. `next dev` reads it at startup.
const apiOrigin = parseApiOrigin(process.env["API_ORIGIN"]);

// Next.js proxies a rewrite with a 30 second timeout unless told otherwise, and then
// answers a plain-text 500. That would cut off a slow AI draft. Two minutes is a
// placeholder until real AI latency is measured. The option sits under `experimental`,
// which is why the Next.js version is pinned exactly.
const PROXY_TIMEOUT_MS = 120_000;

const nextConfig: NextConfig = {
  rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/:path*` }];
  },
  experimental: { proxyTimeout: PROXY_TIMEOUT_MS },
};

export default nextConfig;
