import {MEMBERSHIP_PLAN_CODES, type MembershipPlanCode} from "@/lib/membership/constants";

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
}>;

/**
 * Programme decision D-5 (2026-09-08). Pages and repositories read this map;
 * WTIA changes a benefit here, never in a page. Keep the keys aligned with
 * `Membership.tierBenefits.<plan>` in the message bundles, which is the copy
 * shown on /membership for the same facts.
 */
export const ENTITLEMENTS: Readonly<Record<MembershipPlanCode, Entitlements>> = Object.freeze({
  community: Object.freeze({directoryListing: "card", publishEventsPerQuarter: 0, showcaseListings: 0, whatsappSupport: "none", memberTools: "trial", coBrandedEvents: false}),
  startup: Object.freeze({directoryListing: "profile", publishEventsPerQuarter: 2, showcaseListings: 1, whatsappSupport: "standard", memberTools: "included", coBrandedEvents: false}),
  corporate: Object.freeze({directoryListing: "featured", publishEventsPerQuarter: Number.POSITIVE_INFINITY, showcaseListings: 3, whatsappSupport: "priority", memberTools: "included", coBrandedEvents: false}),
  patron: Object.freeze({directoryListing: "featured", publishEventsPerQuarter: Number.POSITIVE_INFINITY, showcaseListings: 3, whatsappSupport: "dedicated", memberTools: "included", coBrandedEvents: true}),
});

export function entitlementsFor(plan: MembershipPlanCode): Entitlements {
  if (!(MEMBERSHIP_PLAN_CODES as readonly string[]).includes(plan)) throw new Error("INVALID_PLAN_CODE");
  return ENTITLEMENTS[plan];
}

export function canPublishEvents(plan: MembershipPlanCode): boolean {
  return entitlementsFor(plan).publishEventsPerQuarter > 0;
}
