import "server-only";

import {
  MEMBERSHIP_PLAN_CODES,
  MEMBERSHIP_STATUSES,
  type MembershipPlanCode,
  type MembershipStatus,
} from "@/lib/membership/constants";

export {MEMBERSHIP_PLAN_CODES, MEMBERSHIP_STATUSES};
export type {MembershipPlanCode, MembershipStatus};

/** The identity and authorization context supplied to actor-first services. */
type CompanyRole = "owner" | "admin" | "member";
type CompanyScopedActor = {
  readonly companyRoles?: Readonly<Record<string, CompanyRole>>;
};

export type Actor =
  | ({readonly kind: "anonymous"; readonly userId: null} & CompanyScopedActor)
  | ({readonly kind: "member"; readonly userId: string} & CompanyScopedActor)
  | {readonly kind: "system"; readonly userId: null; readonly source: "stripe-webhook"};

export interface MembershipRecord {
  readonly id: string;
  readonly ownerUserId: string | null;
  readonly companyId: string | null;
  readonly planCode: MembershipPlanCode;
  readonly status: MembershipStatus;
  readonly seatLimit: number;
  readonly stripeCustomerId?: string | null;
  readonly stripeSubscriptionId?: string | null;
  readonly billingPeriodStart?: Date | null;
  readonly billingPeriodEnd?: Date | null;
}

/**
 * Lifecycle transitions are intentionally explicit. Stripe webhook handlers and
 * future services can call this guard without duplicating status policy.
 */
const allowedTransitions: Readonly<Record<MembershipStatus, readonly MembershipStatus[]>> = {
  pending_payment: ["active", "expired"],
  pending_review: ["active", "cancelled", "expired"],
  active: ["past_due", "cancel_at_period_end", "cancelled", "expired"],
  past_due: ["active", "cancel_at_period_end", "cancelled", "expired"],
  cancel_at_period_end: ["active", "cancelled", "expired"],
  cancelled: [],
  expired: [],
};

export function canTransitionMembership(from: MembershipStatus, to: MembershipStatus): boolean {
  if (from === to) return true;
  return allowedTransitions[from].includes(to);
}

export {allowedTransitions};
