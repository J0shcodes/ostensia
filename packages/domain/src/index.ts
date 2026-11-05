// Public surface of the domain package. Nothing here does I/O (D-006).

// Proves apps/api can import this package; /health reports it (D-002).
export const DOMAIN_NAME = "@ostensia/domain";

export * from "./canonical.ts";
export * from "./decision.ts";
export * from "./draft.ts";
export * from "./evaluate.ts";
export * from "./explain.ts";
export * from "./mandate.ts";
export * from "./money.ts";
export * from "./observation.ts";
export * from "./payment-action.ts";
export * from "./paypal-status.ts";
export * from "./primitives.ts";
export * from "./purchase.ts";
