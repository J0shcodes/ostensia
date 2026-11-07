import { createApiClient } from "./api.ts";

// One client for the page. It holds no state and no address: every request is a
// same-origin /api call that Next.js forwards (D-027).
export const api = createApiClient();
