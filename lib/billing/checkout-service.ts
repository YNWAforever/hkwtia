import "server-only";

import type {AppLocale} from "@/i18n/routing";
import type {Actor, MembershipPlanCode, MembershipRecord} from "@/lib/membership/lifecycle";
import {billingAttemptsRepository} from "@/lib/db/repos/billing-attempts";
import {membershipsRepository} from "@/lib/db/repos/memberships";
import {serverEnv} from "@/lib/config/env";
import {stripeBillingAdapter, type StripeBillingAdapter} from "@/lib/billing/stripe";
import {localizedPath} from "@/lib/urls";

type MembershipReader = {
  getById(actor: Actor, membershipId: string): Promise<MembershipRecord | null>;
  getBillingAccess(actor: Actor, membershipId: string): Promise<MembershipRecord | null>;
};

export type CheckoutDependencies = Readonly<{
  stripe: StripeBillingAdapter;
  memberships: MembershipReader;
  attempts: Pick<typeof billingAttemptsRepository, "claimActive" | "getActive" | "attachSession" | "startNewAttempt">;
  appUrl: string;
  priceForPlan: (planCode: MembershipPlanCode) => string;
}>;

function defaultDependencies(): CheckoutDependencies {
  const environment = serverEnv();
  return {
    stripe: stripeBillingAdapter(),
    memberships: membershipsRepository,
    attempts: billingAttemptsRepository,
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

export async function getAuthorizedBillingMembership(
  actor: Actor,
  membershipId: string,
  dependencies: Pick<CheckoutDependencies, "memberships">,
): Promise<MembershipRecord> {
  const membership = await dependencies.memberships.getBillingAccess(actor, membershipId);
  if (!membership) throw new Error("FORBIDDEN");
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
  const priceReference = dependencies.priceForPlan(membership.planCode);
  const {attempt} = await dependencies.attempts.claimActive(actor, membership.id, priceReference);
  if (attempt.checkoutUrl && attempt.stripeCheckoutSessionId) {
    return {url: attempt.checkoutUrl};
  }
  const opaqueMembershipId = encodeURIComponent(membership.id);
  const checkoutPath = localizedPath(locale, "/join/checkout");
  const completePath = localizedPath(locale, "/join/complete");
  const session = await dependencies.stripe.createCheckoutSession({
    priceReference,
    clientReferenceId: membership.id,
    metadata: {
      membershipId: membership.id,
      applicationId: membership.applicationId,
      planCode: membership.planCode,
    },
    successUrl: `${origin}${completePath}?membership_id=${opaqueMembershipId}&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${origin}${checkoutPath}?membership_id=${opaqueMembershipId}`,
    idempotencyKey: attempt.idempotencyKey,
  });
  try {
    await dependencies.attempts.attachSession(actor, attempt.id, {
      stripeCheckoutSessionId: session.id,
      checkoutUrl: session.url,
    });
  } catch {
    const winner = await dependencies.attempts.getActive(actor, membership.id);
    if (!winner?.checkoutUrl || !winner.stripeCheckoutSessionId) throw new Error("CHECKOUT_SESSION_PERSIST_FAILED");
    return {url: winner.checkoutUrl};
  }
  return {url: session.url};
}

export async function startNewCheckoutAttempt(
  actor: Actor,
  membershipId: string,
  locale: AppLocale,
  reason: "abandoned" | "expired",
  dependencies: CheckoutDependencies = defaultDependencies(),
): Promise<{url: string}> {
  const membership = await dependencies.memberships.getById(actor, membershipId);
  if (!membership) throw new Error("FORBIDDEN");
  await dependencies.attempts.startNewAttempt(actor, membershipId, dependencies.priceForPlan(membership.planCode), reason);
  return createCheckoutSession(actor, membershipId, locale, dependencies);
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
