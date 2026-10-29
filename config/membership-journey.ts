import type {MembershipPlanCode} from "@/lib/membership/constants";

/**
 * Public onboarding journey. Tier *names* stay Community / Startup / Corporate / Patron.
 *
 * Provisional mapping, for Willy to confirm (see the PR mismatch table):
 * - Individual track: Community (free, immediate) and Startup (existing Stripe checkout).
 * - Organisation track: Corporate and Patron. A new application is reviewed before payment.
 *   Ops language "Corporate / Platinum" is not used as a public name here. Patron is the
 *   closest existing review tier; this file does not rename it to Platinum.
 *
 * `lib/membership/plans.ts` still records Corporate `billingBehavior: "checkout"` so the
 * published fee and STRIPE_CORPORATE_PRICE_ID stay valid for renewal and for memberships
 * already waiting on payment. Only *new* organisation applications skip Checkout.
 */
export type MembershipTrack = "individual" | "organisation";

export const MEMBERSHIP_TRACKS = {
  individual: ["community", "startup"],
  organisation: ["corporate", "patron"],
} as const satisfies Record<MembershipTrack, readonly MembershipPlanCode[]>;

export function membershipTrack(plan: MembershipPlanCode): MembershipTrack {
  return (MEMBERSHIP_TRACKS.organisation as readonly MembershipPlanCode[]).includes(plan)
    ? "organisation"
    : "individual";
}

export type ApplicationOutcome = Readonly<{
  kind: "free" | "checkout" | "review";
  billingInterval: "none" | "annual";
  status: "active" | "pending_payment" | "pending_review";
}>;

/** Outcome for a membership row created by a new application. Existing rows are left alone. */
export function applicationOutcome(plan: MembershipPlanCode): ApplicationOutcome {
  if (membershipTrack(plan) === "organisation") {
    return {kind: "review", billingInterval: "none", status: "pending_review"};
  }
  if (plan === "community") return {kind: "free", billingInterval: "none", status: "active"};
  return {kind: "checkout", billingInterval: "annual", status: "pending_payment"};
}

/** Community is a person. Startup, Corporate, and Patron all name a company on the application. */
export function planCollectsCompany(plan: MembershipPlanCode): boolean {
  return plan !== "community";
}

/**
 * Placeholder URLs. Swap the final Drive and WhatsApp links here only —
 * the member checklist, the confirmation screen, and the kit section all read this object.
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

/**
 * Lapsed and past-due members go to the existing billing portal. That session
 * already accepts expired and cancelled rows that still have a Stripe customer,
 * and pending Startup checkouts still resume from the same page.
 */
export function renewalPathForStatus(status: string): "/portal/billing" | null {
  if (status === "past_due" || status === "cancel_at_period_end" || status === "expired" || status === "cancelled") {
    return "/portal/billing";
  }
  return null;
}
