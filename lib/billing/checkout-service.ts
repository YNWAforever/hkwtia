import "server-only";

import type {AppLocale} from "@/i18n/routing";
import type {Actor, MembershipPlanCode, MembershipRecord} from "@/lib/membership/lifecycle";
import {membershipsRepository} from "@/lib/db/repos/memberships";
import {serverEnv} from "@/lib/config/env";
import {stripeBillingAdapter, type StripeBillingAdapter} from "@/lib/billing/stripe";
import {localizedPath} from "@/lib/urls";

type MembershipReader = {
  getById(actor: Actor, membershipId: string): Promise<MembershipRecord | null>;
};

export type CheckoutDependencies = Readonly<{
  stripe: StripeBillingAdapter;
  memberships: MembershipReader;
  appUrl: string;
  priceForPlan: (planCode: MembershipPlanCode) => string;
}>;

function defaultDependencies(): CheckoutDependencies {
  const environment = serverEnv();
  return {
    stripe: stripeBillingAdapter(),
    memberships: membershipsRepository,
    appUrl: environment.appUrl,
    priceForPlan: (planCode) => {
      const price = planCode === "startup"
        ? environment.stripeStartupPriceId
        : planCode === "corporate" ? environment.stripeCorporatePriceId : "";
      if (!price.trim()) throw new Error("STRIPE_PRICE_NOT_CONFIGURED");
      return price;
    },
  };
}

function appOrigin(appUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(appUrl);
  } catch {
    throw new Error("INVALID_APP_URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("INVALID_APP_URL");
  }
  return parsed.origin;
}

function requireMember(actor: Actor): asserts actor is Extract<Actor, {kind: "member"}> {
  if (actor.kind !== "member") throw new Error("FORBIDDEN");
}

function mayManageCompanyBilling(actor: Extract<Actor, {kind: "member"}>, companyId: string): boolean {
  const role = actor.companyRoles?.[companyId];
  return role === "owner" || role === "admin";
}

function authorizeBillingManager(actor: Actor, membership: MembershipRecord): void {
  requireMember(actor);
  if (membership.ownerUserId !== null) {
    if (membership.ownerUserId !== actor.userId) throw new Error("FORBIDDEN");
    return;
  }
  if (!membership.companyId || !mayManageCompanyBilling(actor, membership.companyId)) {
    throw new Error("FORBIDDEN");
  }
}

export async function getAuthorizedBillingMembership(
  actor: Actor,
  membershipId: string,
  dependencies: Pick<CheckoutDependencies, "memberships">,
): Promise<MembershipRecord> {
  const membership = await dependencies.memberships.getById(actor, membershipId);
  if (!membership) throw new Error("FORBIDDEN");
  authorizeBillingManager(actor, membership);
  if (!membership.stripeCustomerId) throw new Error("STRIPE_CUSTOMER_NOT_CONFIGURED");
  return membership;
}

export async function createCheckoutSession(
  actor: Actor,
  membershipId: string,
  locale: AppLocale,
  dependencies: CheckoutDependencies = defaultDependencies(),
): Promise<{url: string}> {
  requireMember(actor);
  const membership = await dependencies.memberships.getById(actor, membershipId);
  if (!membership) throw new Error("FORBIDDEN");
  if (membership.status !== "pending_payment") throw new Error("MEMBERSHIP_NOT_PENDING_PAYMENT");
  if (membership.planCode !== "startup" && membership.planCode !== "corporate") {
    throw new Error("PLAN_DOES_NOT_USE_CHECKOUT");
  }
  if (!membership.applicationId) throw new Error("MEMBERSHIP_APPLICATION_REQUIRED");

  const origin = appOrigin(dependencies.appUrl);
  const opaqueMembershipId = encodeURIComponent(membership.id);
  const checkoutPath = localizedPath(locale, "/join/checkout");
  const completePath = localizedPath(locale, "/join/complete");
  return dependencies.stripe.createCheckoutSession({
    priceReference: dependencies.priceForPlan(membership.planCode),
    clientReferenceId: membership.id,
    metadata: {
      membershipId: membership.id,
      applicationId: membership.applicationId,
      planCode: membership.planCode,
    },
    successUrl: `${origin}${completePath}?membership_id=${opaqueMembershipId}&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${origin}${checkoutPath}?membership_id=${opaqueMembershipId}`,
    idempotencyKey: `membership-checkout:${membership.id}:initial`,
  });
}

export async function createBillingPortalSession(
  actor: Actor,
  membershipId: string,
  dependencies: CheckoutDependencies = defaultDependencies(),
): Promise<{url: string}> {
  const membership = await getAuthorizedBillingMembership(actor, membershipId, dependencies);
  if (!["active", "past_due", "cancel_at_period_end"].includes(membership.status)) {
    throw new Error("MEMBERSHIP_BILLING_NOT_RECOVERABLE");
  }
  return dependencies.stripe.createBillingPortalSession({
    customerId: membership.stripeCustomerId!,
    returnUrl: `${appOrigin(dependencies.appUrl)}/portal/billing`,
  });
}
