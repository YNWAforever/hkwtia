import "server-only";

import {
  MEMBERSHIP_PLAN_CODES,
  MEMBERSHIP_STATUSES,
  type MembershipPlanCode,
  type MembershipStatus,
} from "@/lib/membership/constants";

export {MEMBERSHIP_PLAN_CODES, MEMBERSHIP_STATUSES};
export type {MembershipPlanCode, MembershipStatus};

export type CompanyRole = "owner" | "admin" | "member";
export type AuthenticatedActorKind = "member" | "staff" | "exco" | "superadmin";
export type AuthenticatedActor = {
  [Kind in AuthenticatedActorKind]: Readonly<{
    kind: Kind;
    userId: string;
    profileId: string;
    companyRoles?: Readonly<Record<string, CompanyRole>>;
  }>;
}[AuthenticatedActorKind];
export type AdminActor = Extract<AuthenticatedActor, {kind: "staff" | "exco" | "superadmin"}>;
export type Actor =
  | Readonly<{kind: "anonymous"; userId: null}>
  | AuthenticatedActor
  | Readonly<{kind: "system"; userId: null; source: "stripe-webhook" | "unsubscribe"}>;

export class AuthorizationError extends Error {
  readonly code = "FORBIDDEN";

  constructor(message = "FORBIDDEN") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function forbidden(): never {
  throw new AuthorizationError();
}

export function requireSystem(actor: Actor): asserts actor is Extract<Actor, {kind: "system"}> {
  if (actor.kind !== "system" || actor.source !== "stripe-webhook") forbidden();
}

export function requireMember(actor: Actor): asserts actor is Extract<Actor, {kind: "member"}> {
  if (actor.kind !== "member") forbidden();
}

export interface MembershipRecord {
  readonly id: string;
  readonly ownerUserId: string | null;
  readonly companyId: string | null;
  readonly applicationId?: string | null;
  readonly planCode: MembershipPlanCode;
  readonly status: MembershipStatus;
  readonly seatLimit: number;
  readonly stripeCustomerId?: string | null;
  readonly stripeSubscriptionId?: string | null;
  readonly billingPeriodStart?: Date | null;
  readonly billingPeriodEnd?: Date | null;
}

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
