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
