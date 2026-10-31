// PayPal reports three separate status families: the order, the authorization
// and the capture (D-010). Each raw string is mapped to a neutral state here.
// The match is exact and case-sensitive, with no trimming, and a string that is
// not listed (or is not a string at all) maps to "unknown". Unknown never
// permits a payment write.
//
// The lists contain only the values our records show (TD-005). E-1 and the
// Payments v2 schema will extend them.
//
// These are switches, not object lookups, so inherited keys such as
// "constructor" or "__proto__" can never match.

export const ORDER_STATES = ["approved", "completed", "unknown"] as const;
export type OrderState = (typeof ORDER_STATES)[number];

export const AUTHORIZATION_STATES = [
  "created",
  "captured",
  "partially_captured",
  "voided",
  "denied",
  "pending",
  "expired",
  "unknown",
] as const;
export type AuthorizationState = (typeof AUTHORIZATION_STATES)[number];

export const CAPTURE_STATES = ["completed", "pending", "unknown"] as const;
export type CaptureState = (typeof CAPTURE_STATES)[number];

export function mapOrderStatus(raw: unknown): OrderState {
  switch (raw) {
    case "APPROVED":
      return "approved";
    case "COMPLETED":
      return "completed";
    default:
      return "unknown";
  }
}

export function mapAuthorizationStatus(raw: unknown): AuthorizationState {
  switch (raw) {
    case "CREATED":
      return "created";
    case "CAPTURED":
      return "captured";
    case "PARTIALLY_CAPTURED":
      return "partially_captured";
    case "VOIDED":
      return "voided";
    case "DENIED":
      return "denied";
    case "PENDING":
      return "pending";
    case "EXPIRED":
      return "expired";
    default:
      return "unknown";
  }
}

export function mapCaptureStatus(raw: unknown): CaptureState {
  switch (raw) {
    case "COMPLETED":
      return "completed";
    case "PENDING":
      return "pending";
    default:
      return "unknown";
  }
}
