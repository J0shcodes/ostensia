import type { Decision, Violation } from "./decision.ts";
import { ConfirmedMandateSchema } from "./mandate.ts";
import type { ConfirmedMandate } from "./mandate.ts";
import { addMinor, mulMinor } from "./money.ts";
import { ObservedPaymentSchema } from "./observation.ts";
import type { ObservedPayment } from "./observation.ts";
import { PurchaseProposalSchema } from "./purchase.ts";
import type { PurchaseLine, PurchaseProposal } from "./purchase.ts";

// There are two evaluation points (D-007). Both are block-by-default: they
// return "allow" only when every input is valid and no rule is violated. Neither
// reads the clock itself; `now` is an argument.
//
// The pre-check runs before any PayPal call. The final evaluation runs after
// PayPal has authorized: it repeats every pre-check rule at the current time and
// also compares what PayPal reported with the confirmed mandate.

export function precheckPurchase(mandateInput: unknown, proposalInput: unknown, now: unknown): Decision {
  return evaluate(mandateInput, proposalInput, now, undefined);
}

export function finalEvaluatePurchase(
  mandateInput: unknown,
  proposalInput: unknown,
  observedInput: unknown,
  now: unknown,
): Decision {
  return evaluate(mandateInput, proposalInput, now, { input: observedInput });
}

// `observation` is undefined for the pre-check. It is wrapped so that a missing
// observation in the final evaluation (input undefined) is still validated, and
// so reported as invalid, instead of being mistaken for the pre-check.
function evaluate(
  mandateInput: unknown,
  proposalInput: unknown,
  now: unknown,
  observation: { readonly input: unknown } | undefined,
): Decision {
  const mandate = ConfirmedMandateSchema.safeParse(mandateInput);
  const proposal = PurchaseProposalSchema.safeParse(proposalInput);
  const observed = observation === undefined ? undefined : ObservedPaymentSchema.safeParse(observation.input);
  const nowMs = now instanceof Date ? now.getTime() : Number.NaN;

  // Invalid input is reported, all kinds at once, and nothing else is evaluated.
  const inputViolations: Violation[] = [];
  if (!mandate.success) inputViolations.push({ code: "MANDATE_INVALID" });
  if (!proposal.success) inputViolations.push({ code: "PROPOSAL_INVALID" });
  if (observed !== undefined && !observed.success) inputViolations.push({ code: "OBSERVATION_INVALID" });
  if (Number.isNaN(nowMs)) inputViolations.push({ code: "CLOCK_INVALID" });
  if (!mandate.success || !proposal.success || (observed !== undefined && !observed.success) || Number.isNaN(nowMs)) {
    return { decision: "block", violations: inputViolations };
  }

  const { violations, total } = collectPolicyViolations(mandate.data, proposal.data, nowMs);
  if (observed?.success) {
    violations.push(...collectObservedViolations(mandate.data, observed.data, total));
  }
  if (violations.length > 0 || total === null) {
    return { decision: "block", violations };
  }
  return { decision: "allow", computedTotalMinor: total };
}

// What PayPal reported must match the confirmed mandate and the total we
// computed ourselves. The proposal's declared total plays no part here.
//
// BINDING_MISMATCH compares the custom_id PayPal echoed with the hash stored on
// the mandate. It does not recompute the hash, so it cannot detect an edited
// stored mandate. That check belongs to the gate (D-015).
function collectObservedViolations(
  mandate: ConfirmedMandate,
  observed: ObservedPayment,
  computedTotal: number | null,
): Violation[] {
  const violations: Violation[] = [];
  // With an overflowing total there is nothing to compare against;
  // AMOUNT_OVERFLOW already blocks.
  if (computedTotal !== null && observed.amountMinor !== computedTotal) {
    violations.push({ code: "OBSERVED_AMOUNT_MISMATCH", expected: computedTotal, actual: observed.amountMinor });
  }
  if (observed.currency !== mandate.terms.currency) violations.push({ code: "OBSERVED_CURRENCY_MISMATCH" });
  if (observed.customId !== mandate.hash) violations.push({ code: "BINDING_MISMATCH" });
  return violations;
}

// Violations are listed in a fixed order: mandate-level rules, then each line
// in the order given, then per-product quantity, then totals. The same input
// always gives the same list.
function collectPolicyViolations(
  mandate: ConfirmedMandate,
  proposal: PurchaseProposal,
  nowMs: number,
): { violations: Violation[]; total: number | null } {
  const violations: Violation[] = [];
  const { terms } = mandate;

  if (proposal.mandateId !== mandate.id) violations.push({ code: "MANDATE_MISMATCH" });
  if (mandate.status !== "confirmed") violations.push({ code: "MANDATE_REVOKED" });
  // Fail closed: an expiry equal to now, or one that cannot be parsed, counts
  // as expired (any comparison with NaN is false).
  if (!(Date.parse(terms.expiresAt) > nowMs)) violations.push({ code: "MANDATE_EXPIRED" });
  if (proposal.currency !== terms.currency) violations.push({ code: "CURRENCY_MISMATCH" });
  if (proposal.lines.length === 0) violations.push({ code: "EMPTY_PURCHASE" });

  const itemsByProduct = new Map(terms.items.map((item) => [item.productId, item] as const));
  // Quantity is summed per product across all lines, so a purchase cannot get
  // past maxQuantity by splitting one product over several lines.
  const quantityByProduct = new Map<string, { maxQuantity: number; quantity: number }>();

  for (const line of proposal.lines) {
    const item = itemsByProduct.get(line.productId);
    if (item === undefined) {
      violations.push({ code: "PRODUCT_NOT_ALLOWED", productId: line.productId });
      continue;
    }

    const tally = quantityByProduct.get(line.productId) ?? { maxQuantity: item.maxQuantity, quantity: 0 };
    tally.quantity += line.quantity;
    quantityByProduct.set(line.productId, tally);

    if (
      item.allowedVariantIds !== undefined &&
      (line.variantId === undefined || !item.allowedVariantIds.includes(line.variantId))
    ) {
      violations.push(
        line.variantId === undefined
          ? { code: "VARIANT_NOT_ALLOWED", productId: line.productId }
          : { code: "VARIANT_NOT_ALLOWED", productId: line.productId, variantId: line.variantId },
      );
    }

    if (line.unitPriceMinor > item.maxUnitPriceMinor) {
      violations.push({
        code: "UNIT_PRICE_EXCEEDED",
        productId: line.productId,
        limit: item.maxUnitPriceMinor,
        actual: line.unitPriceMinor,
      });
    }
  }

  for (const [productId, tally] of quantityByProduct) {
    if (tally.quantity > tally.maxQuantity) {
      violations.push({ code: "QUANTITY_EXCEEDED", productId, limit: tally.maxQuantity, actual: tally.quantity });
    }
  }

  // The total is always computed here from unit prices and quantities. The
  // proposal's declared total is only compared against it, never trusted.
  const total = computeTotal(proposal.lines);
  if (total === null) {
    violations.push({ code: "AMOUNT_OVERFLOW" });
  } else {
    if (total > terms.maxTotalMinor) {
      violations.push({ code: "TOTAL_EXCEEDED", limit: terms.maxTotalMinor, actual: total });
    }
    if (proposal.declaredTotalMinor !== total) {
      violations.push({ code: "TOTAL_MISMATCH", expected: total, actual: proposal.declaredTotalMinor });
    }
  }

  return { violations, total };
}

function computeTotal(lines: readonly PurchaseLine[]): number | null {
  let total = 0;
  for (const line of lines) {
    const lineTotal = mulMinor(line.unitPriceMinor, line.quantity);
    if (lineTotal === null) return null;
    const next = addMinor(total, lineTotal);
    if (next === null) return null;
    total = next;
  }
  return total;
}
