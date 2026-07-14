/** The identity and authorization context supplied to actor-first services. */
export interface Actor {
  readonly userId: string | null;
  readonly kind: "anonymous" | "member" | "system";
  readonly source?: "stripe-webhook";
  readonly companyRoles?: Readonly<Record<string, "owner" | "admin" | "member">>;
}

export const MEMBERSHIP_STATUSES = [
  "pending_payment",
  "pending_review",
  "active",
  "past_due",
  "cancel_at_period_end",
  "cancelled",
  "expired",
] as const;

export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const MEMBERSHIP_PLAN_CODES = ["community", "startup", "corporate", "patron"] as const;

export type MembershipPlanCode = (typeof MEMBERSHIP_PLAN_CODES)[number];

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
