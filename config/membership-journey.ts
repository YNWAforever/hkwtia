import type {MembershipPlanCode} from "@/lib/membership/constants";

/**
 * Public memberships:
 * Community is free and active immediately (`applicationOutcome`).
 * Individual HK$500, Corporate HK$1,800, and Platinum HK$4,800 stay pay-first.
 *
 * Stored plan codes still include startup and patron so existing memberships load.
 * Startup is not offered. Patron remains only as a legacy review exception, and
 * that exception is for Willy alone — not a committee.
 *
 * Stripe: Corporate reuses STRIPE_CORPORATE_PRICE_ID. Individual and Platinum need
 * price ids that do not exist in this repo. Do not create live Stripe products here.
 * Set STRIPE_INDIVIDUAL_PRICE_ID and STRIPE_PLATINUM_PRICE_ID when those prices exist.
 * Checkout fails closed until they are set. Community does not use Stripe.
 */
export const OPS_MEMBERSHIP_TIERS = [
  {code: "individual", annualPriceHkd: 500, collectsCompany: false, stripeEnv: "STRIPE_INDIVIDUAL_PRICE_ID"},
  {code: "corporate", annualPriceHkd: 1800, collectsCompany: true, stripeEnv: "STRIPE_CORPORATE_PRICE_ID"},
  {code: "platinum", annualPriceHkd: 4800, collectsCompany: true, stripeEnv: "STRIPE_PLATINUM_PRICE_ID"},
] as const;

export type OpsMembershipCode = (typeof OPS_MEMBERSHIP_TIERS)[number]["code"];

export function isOpsMembershipCode(code: string): code is OpsMembershipCode {
  return OPS_MEMBERSHIP_TIERS.some((tier) => tier.code === code);
}

export function opsTier(code: OpsMembershipCode) {
  const tier = OPS_MEMBERSHIP_TIERS.find((item) => item.code === code);
  if (!tier) throw new Error("INVALID_PLAN_CODE");
  return tier;
}

/**
 * Startup and patron links still land on the current paid tier.
 * Community is offered again, so `/join?plan=community` is not redirected.
 */
export const LEGACY_JOIN_REDIRECT: Readonly<Partial<Record<MembershipPlanCode, OpsMembershipCode>>> = {
  startup: "individual",
  patron: "platinum",
};

export type ApplicationOutcome = Readonly<{
  kind: "free" | "checkout" | "review";
  billingInterval: "none" | "annual";
  status: "active" | "pending_payment" | "pending_review";
}>;

/**
 * Community is free and active on completion. Individual, Corporate, and Platinum
 * pay before they are active. Patron stays a review exception for Willy; the
 * public Platinum tier does not use it.
 */
export function applicationOutcome(plan: MembershipPlanCode): ApplicationOutcome {
  if (plan === "community") return {kind: "free", billingInterval: "none", status: "active"};
  if (plan === "patron") return {kind: "review", billingInterval: "none", status: "pending_review"};
  return {kind: "checkout", billingInterval: "annual", status: "pending_payment"};
}

export function planCollectsCompany(plan: MembershipPlanCode): boolean {
  if (plan === "individual" || plan === "community") return false;
  return true;
}

export function checkoutPlanCodes(): readonly MembershipPlanCode[] {
  return ["startup", "corporate", "individual", "platinum"];
}

export function planUsesCheckout(plan: MembershipPlanCode): boolean {
  return checkoutPlanCodes().includes(plan);
}

/**
 * Onboarding kit URLs. Null until the Secretariat publishes the Drive and WhatsApp links.
 * Do not substitute a placeholder host: members must not see a dead kit URL.
 */
export type MembershipKitLinks = Readonly<{
  welcomeKit: string | null;
  associationKit: string | null;
  whatsappCommunity: string | null;
}>;

export const MEMBERSHIP_KIT_LINKS: MembershipKitLinks = {
  welcomeKit: null,
  associationKit: null,
  whatsappCommunity: null,
};

/** An https kit URL members may open. Blank values and example.com stay hidden. */
export function publishedMembershipKitHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host === "example.com" || host.endsWith(".example.com")) return null;
  return trimmed;
}

// Each action request stays below Next's 4 MB and Vercel's 4.5 MB body limits.
export const BR_UPLOAD_PART_BYTES = 3 * 1024 * 1024;

export const BR_UPLOAD_LIMITS = {
  maxBytes: 8 * 1024 * 1024,
  contentTypes: ["application/pdf", "image/jpeg", "image/png"] as const,
} as const;

export type BrContentType = (typeof BR_UPLOAD_LIMITS.contentTypes)[number];

export function renewalPathForStatus(status: string): "/portal/billing" | null {
  if (status === "past_due" || status === "cancel_at_period_end" || status === "expired" || status === "cancelled") {
    return "/portal/billing";
  }
  return null;
}

/** Public label for a stored plan code. Startup folds into Individual; patron folds into Platinum. */
export function publicPlanCode(plan: MembershipPlanCode): "community" | OpsMembershipCode {
  if (plan === "community") return "community";
  if (plan === "corporate") return "corporate";
  if (plan === "platinum" || plan === "patron") return "platinum";
  return "individual";
}
