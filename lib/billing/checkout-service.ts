import "server-only";

import type {AppLocale} from "@/i18n/routing";
import type {Actor, MembershipPlanCode, MembershipRecord} from "@/lib/membership/lifecycle";
import type {BillingAttempt} from "@/lib/db/server-schema";
import {billingAttemptsRepository} from "@/lib/db/repos/billing-attempts";
import {membershipsRepository} from "@/lib/db/repos/memberships";
import {appEnv, billingEnv} from "@/lib/config/env";
import {stripeBillingAdapter, type StripeBillingAdapter} from "@/lib/billing/stripe";
import {localizedPath} from "@/lib/urls";

type MembershipReader = {
  getById(actor: Actor, membershipId: string): Promise<MembershipRecord | null>;
  getBillingAccess(actor: Actor, membershipId: string): Promise<MembershipRecord | null>;
};

export type CheckoutDependencies = Readonly<{
  stripe: StripeBillingAdapter;
  memberships: MembershipReader;
  attempts: Pick<typeof billingAttemptsRepository, "claimActive" | "getActive" | "getById" | "attachSession" | "startNewAttempt">;
  appUrl: string;
  priceForPlan: (planCode: MembershipPlanCode) => string;
}>;

function defaultDependencies(): CheckoutDependencies {
  const app = appEnv();
  const billing = billingEnv();
  return {
    stripe: stripeBillingAdapter(),
    memberships: membershipsRepository,
    attempts: billingAttemptsRepository,
    appUrl: app.appUrl,
    priceForPlan: (planCode) => {
      const price = planCode === "startup"
        ? billing.stripeStartupPriceId
        : planCode === "corporate" ? billing.stripeCorporatePriceId : "";
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

function validateCheckoutMembership(membership: MembershipRecord): void {
  if (membership.status !== "pending_payment") throw new Error("MEMBERSHIP_NOT_PENDING_PAYMENT");
  if (membership.planCode !== "startup" && membership.planCode !== "corporate") {
    throw new Error("PLAN_DOES_NOT_USE_CHECKOUT");
  }
  if (!membership.applicationId) throw new Error("MEMBERSHIP_APPLICATION_REQUIRED");
}

async function createSessionForAttempt(
  actor: Extract<Actor, {kind: "member"}>,
  membership: MembershipRecord,
  attempt: BillingAttempt,
  locale: AppLocale,
  dependencies: CheckoutDependencies,
): Promise<{url: string}> {
  if (attempt.checkoutUrl && attempt.stripeCheckoutSessionId) return {url: attempt.checkoutUrl};
  const origin = appOrigin(dependencies.appUrl);
  const opaqueMembershipId = encodeURIComponent(membership.id);
  const checkoutPath = localizedPath(locale, "/join/checkout");
  const completePath = localizedPath(locale, "/join/complete");
  const session = await dependencies.stripe.createCheckoutSession({
    priceReference: attempt.priceReference,
    clientReferenceId: membership.id,
    metadata: {
      membershipId: membership.id,
      applicationId: membership.applicationId!,
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
    const exact = await dependencies.attempts.getById(actor, attempt.id);
    if (!exact?.checkoutUrl || !exact.stripeCheckoutSessionId) throw new Error("CHECKOUT_SESSION_PERSIST_FAILED");
    return {url: exact.checkoutUrl};
  }
  return {url: session.url};
}

export async function createCheckoutSession(
  actor: Actor,
  membershipId: string,
  locale: AppLocale,
  dependencies: CheckoutDependencies = defaultDependencies(),
): Promise<{url: string}> {
  requireMember(actor);
  const preflightMembership = await dependencies.memberships.getBillingAccess(actor, membershipId);
  if (!preflightMembership) throw new Error("FORBIDDEN");
  validateCheckoutMembership(preflightMembership);
  const priceReference = dependencies.priceForPlan(preflightMembership.planCode);
  const {attempt, membership} = await dependencies.attempts.claimActive(
    actor, preflightMembership.id, priceReference, preflightMembership.planCode,
  );
  return createSessionForAttempt(actor, membership, attempt, locale, dependencies);
}

export async function startNewCheckoutAttempt(
  actor: Actor,
  membershipId: string,
  locale: AppLocale,
  reason: "abandoned" | "expired",
  request: Readonly<{expectedCurrentAttemptId: string; recoveryRequestId: string}>,
  dependencies: CheckoutDependencies = defaultDependencies(),
): Promise<{url: string}> {
  requireMember(actor);
  const membership = await dependencies.memberships.getBillingAccess(actor, membershipId);
  if (!membership) throw new Error("FORBIDDEN");
  validateCheckoutMembership(membership);
  const priceReference = dependencies.priceForPlan(membership.planCode);
  const result = await dependencies.attempts.startNewAttempt(
    actor, membershipId, priceReference, reason, {...request, expectedPlanCode: membership.planCode},
  );
  return createSessionForAttempt(actor, result.membership, result.attempt, locale, dependencies);
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
