import {MEMBERSHIP_PLAN_CODES, type MembershipPlanCode, type MembershipStatus} from "@/lib/membership/constants";

export type DirectoryListing = "none" | "card" | "profile" | "featured";
export type WhatsAppSupport = "none" | "standard" | "priority" | "dedicated";

export type Entitlements = Readonly<{
  directoryListing: DirectoryListing;
  /** Member-submitted events accepted for review per calendar quarter; Infinity = unlimited. */
  publishEventsPerQuarter: number;
  showcaseListings: number;
  whatsappSupport: WhatsAppSupport;
  memberTools: "trial" | "included";
  coBrandedEvents: boolean;
  /** AI writer generations attempted per Asia/Hong_Kong calendar month; Infinity = unlimited. */
  aiWriterRunsPerMonth: number;
}>;

/**
 * Programme decision D-5 (2026-09-08). Pages and repositories read this map;
 * WTIA changes a benefit here, never in a page. Keep the keys aligned with
 * `Membership.tierBenefits.<plan>` in the message bundles, which is the copy
 * shown on /membership for the same facts.
 */
export const ENTITLEMENTS: Readonly<Record<MembershipPlanCode, Entitlements>> = Object.freeze({
  community: Object.freeze({directoryListing: "card", publishEventsPerQuarter: 0, showcaseListings: 0, whatsappSupport: "none", memberTools: "trial", coBrandedEvents: false, aiWriterRunsPerMonth: 0}),
  startup: Object.freeze({directoryListing: "profile", publishEventsPerQuarter: 2, showcaseListings: 1, whatsappSupport: "standard", memberTools: "included", coBrandedEvents: false, aiWriterRunsPerMonth: 20}),
  corporate: Object.freeze({directoryListing: "featured", publishEventsPerQuarter: Number.POSITIVE_INFINITY, showcaseListings: 3, whatsappSupport: "priority", memberTools: "included", coBrandedEvents: false, aiWriterRunsPerMonth: 100}),
  patron: Object.freeze({directoryListing: "featured", publishEventsPerQuarter: Number.POSITIVE_INFINITY, showcaseListings: 3, whatsappSupport: "dedicated", memberTools: "included", coBrandedEvents: true, aiWriterRunsPerMonth: Number.POSITIVE_INFINITY}),
});

/** Current policy includes past_due and cancel_at_period_end; changing it needs association approval. */
export const BENEFIT_ELIGIBLE_MEMBERSHIP_STATUSES = ["active", "past_due", "cancel_at_period_end"] as const satisfies readonly MembershipStatus[];

/** A recoverable portal account is not yet entitled to paid benefits. */
export function isBenefitEligibleMembershipStatus(status: MembershipStatus): boolean {
  return (BENEFIT_ELIGIBLE_MEMBERSHIP_STATUSES as readonly MembershipStatus[]).includes(status);
}
export function entitlementsFor(plan: MembershipPlanCode): Entitlements {
  if (!(MEMBERSHIP_PLAN_CODES as readonly string[]).includes(plan)) throw new Error("INVALID_PLAN_CODE");
  return ENTITLEMENTS[plan];
}

export function canPublishEvents(plan: MembershipPlanCode): boolean {
  return entitlementsFor(plan).publishEventsPerQuarter > 0;
}

export function aiWriterRunsPerMonth(plan: MembershipPlanCode): number {
  return entitlementsFor(plan).aiWriterRunsPerMonth;
}
