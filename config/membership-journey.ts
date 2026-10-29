import type {MembershipPlanCode} from "@/lib/membership/constants";

/**
 * Public memberships Willy confirmed on 2026-10-29:
 * Individual HK$500, Corporate HK$1,800, Platinum HK$4,800. All three pay first.
 *
 * Stored plan codes still include the legacy community / startup / patron rows so
 * existing memberships load. New joins use individual, corporate, and platinum.
 * Community and Startup are not offered. Patron remains only as a legacy review
 * exception, and that exception is for Willy alone — not a committee.
 *
 * Stripe: Corporate reuses STRIPE_CORPORATE_PRICE_ID. Individual and Platinum need
 * price ids that do not exist in this repo. Do not create live Stripe products here.
 * Set STRIPE_INDIVIDUAL_PRICE_ID and STRIPE_PLATINUM_PRICE_ID when those prices exist.
 * Checkout fails closed until they are set.
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

/** Legacy join links keep working, but the public name is the ops tier. */
export const LEGACY_JOIN_REDIRECT: Readonly<Partial<Record<MembershipPlanCode, OpsMembershipCode>>> = {
  community: "individual",
  startup: "individual",
  patron: "platinum",
};

export type ApplicationOutcome = Readonly<{
  kind: "free" | "checkout" | "review";
  billingInterval: "none" | "annual";
  status: "active" | "pending_payment" | "pending_review";
}>;

/**
 * New Individual, Corporate, and Platinum memberships pay before they are active.
 * Community stays free for rows already in flight. Patron stays a review exception
 * for Willy; the public Platinum tier does not use it.
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
 * Placeholder URLs. They stay here until Daisy supplies the final Drive and WhatsApp links.
 * `example.com` is intentional so a forgotten placeholder cannot point at a real file.
 */
export const MEMBERSHIP_KIT_LINKS = {
  welcomeKit: "https://example.com/wtia/welcome-kit",
  associationKit: "https://example.com/wtia/association-kit",
  whatsappCommunity: "https://example.com/wtia/whatsapp",
} as const;

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

/** Public label for a stored plan code. Legacy codes do not use their old names. */
export function publicPlanCode(plan: MembershipPlanCode): OpsMembershipCode | "corporate" {
  if (plan === "corporate") return "corporate";
  if (plan === "platinum" || plan === "patron") return "platinum";
  return "individual";
}
