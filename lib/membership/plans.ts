import "server-only";

import type {MembershipPlanCode} from "@/lib/membership/constants";

/** Public, stable plan identifiers used by join links and applications. */
export const PLAN_CODES = Object.freeze(["community", "startup", "corporate", "patron"] as const) satisfies readonly MembershipPlanCode[];

export type PlanCode = (typeof PLAN_CODES)[number];

export type Plan = Readonly<{
  code: PlanCode;
  audience: "individual" | "startup" | "corporate" | "patron";
  billingBehavior: "free" | "checkout" | "review";
  stripePriceReference: null;
  seatAllowance: number;
  active: true;
}>;

const plans: Readonly<Record<PlanCode, Plan>> = Object.freeze({
  community: Object.freeze({code: "community", audience: "individual", billingBehavior: "free", stripePriceReference: null, seatAllowance: 1, active: true}),
  startup: Object.freeze({code: "startup", audience: "startup", billingBehavior: "checkout", stripePriceReference: null, seatAllowance: 5, active: true}),
  corporate: Object.freeze({code: "corporate", audience: "corporate", billingBehavior: "checkout", stripePriceReference: null, seatAllowance: 25, active: true}),
  patron: Object.freeze({code: "patron", audience: "patron", billingBehavior: "review", stripePriceReference: null, seatAllowance: 1, active: true}),
});

export function getPlan(code: unknown): Plan {
  if (typeof code !== "string" || !PLAN_CODES.includes(code as PlanCode)) throw new Error("INVALID_PLAN_CODE");
  return plans[code as PlanCode];
}

export const PLAN_CATALOG = plans;
