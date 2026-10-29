import "server-only";

import type {MembershipPlanCode} from "@/lib/membership/constants";

/** Public, stable plan identifiers used by join links and applications. */
export const PLAN_CODES = Object.freeze(["community", "startup", "corporate", "patron", "individual", "platinum"] as const) satisfies readonly MembershipPlanCode[];

export type PlanCode = (typeof PLAN_CODES)[number];

export type Plan = Readonly<{
  code: PlanCode;
  audience: "individual" | "startup" | "corporate" | "patron" | "platinum";
  billingBehavior: "free" | "checkout" | "review";
  stripePriceReference: null;
  seatAllowance: number;
  active: true;
}>;

/**
 * Catalog contract for stored plan rows. Public names and the HK$500 / HK$1,800 /
 * HK$4,800 fees live in config/membership-journey.ts. Individual and Platinum are
 * checkout plans; their Stripe price ids are optional env vars, not created here.
 * Patron stays review for legacy exceptions (Willy only). Corporate pays first.
 */
const plans: Readonly<Record<PlanCode, Plan>> = Object.freeze({
  community: Object.freeze({code: "community", audience: "individual", billingBehavior: "free", stripePriceReference: null, seatAllowance: 1, active: true}),
  startup: Object.freeze({code: "startup", audience: "startup", billingBehavior: "checkout", stripePriceReference: null, seatAllowance: 5, active: true}),
  corporate: Object.freeze({code: "corporate", audience: "corporate", billingBehavior: "checkout", stripePriceReference: null, seatAllowance: 25, active: true}),
  patron: Object.freeze({code: "patron", audience: "patron", billingBehavior: "review", stripePriceReference: null, seatAllowance: 1, active: true}),
  individual: Object.freeze({code: "individual", audience: "individual", billingBehavior: "checkout", stripePriceReference: null, seatAllowance: 1, active: true}),
  platinum: Object.freeze({code: "platinum", audience: "platinum", billingBehavior: "checkout", stripePriceReference: null, seatAllowance: 25, active: true}),
});

export function getPlan(code: unknown): Plan {
  if (typeof code !== "string" || !PLAN_CODES.includes(code as PlanCode)) throw new Error("INVALID_PLAN_CODE");
  return plans[code as PlanCode];
}

export const PLAN_CATALOG = plans;
