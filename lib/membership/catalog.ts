import "server-only";

import {MEMBERSHIP_PLAN_CODES} from "@/lib/membership/constants";

export const BILLING_INTERVALS = ["none", "annual", "monthly"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];
export type PlanCode = (typeof MEMBERSHIP_PLAN_CODES)[number];

export type MembershipOption = Readonly<{
  planCode: PlanCode;
  billingInterval: BillingInterval;
  priceReference: string | null;
  available: boolean;
}>;

type CatalogEnvironment = Readonly<{stripeStartupPriceId: string; stripeCorporatePriceId: string}>;

const freeOrReviewPlans = new Set<PlanCode>(["community", "patron"]);

function paidPriceReference(planCode: PlanCode, environment: CatalogEnvironment): string | null {
  switch (planCode) {
    case "startup":
      return environment.stripeStartupPriceId.trim() || null;
    case "corporate":
      return environment.stripeCorporatePriceId.trim() || null;
    case "community":
    case "patron":
      // These cases should never be reached due to the early return in resolveMembershipOption
      // but we include them for exhaustiveness checking
      return null;
    default:
      // Exhaustiveness check: if a new plan is added to MEMBERSHIP_PLAN_CODES,
      // this will fail to compile unless it's handled above.
      const _exhaustive: never = planCode;
      return _exhaustive;
  }
}

/**
 * The one server-only place that decides whether a (planCode, billingInterval) tuple is real.
 * Billing interval is part of plan identity: free/review plans resolve to "none" only; each paid
 * option is an inseparable (planCode, billingInterval, priceReference) tuple, available only when
 * exactly one configured Stripe price mapping exists for it. Only STRIPE_STARTUP_PRICE_ID and
 * STRIPE_CORPORATE_PRICE_ID exist today, and both are actionable only as the annual option --
 * monthly is deliberately unavailable until a distinct provider mapping is separately approved,
 * not inferred here.
 */
export function resolveMembershipOption(
  planCode: PlanCode,
  billingInterval: BillingInterval,
  environment: CatalogEnvironment,
): MembershipOption {
  if (freeOrReviewPlans.has(planCode)) {
    return {planCode, billingInterval: "none", priceReference: null, available: billingInterval === "none"};
  }

  if (billingInterval !== "annual") {
    return {planCode, billingInterval, priceReference: null, available: false};
  }

  const priceReference = paidPriceReference(planCode, environment);
  return {planCode, billingInterval, priceReference, available: priceReference !== null};
}
