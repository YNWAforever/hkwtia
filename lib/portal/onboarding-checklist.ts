import {MEMBERSHIP_KIT_LINKS, planCollectsCompany, publishedMembershipKitHref, type MembershipKitLinks} from "@/config/membership-journey";
import type {MembershipPlanCode} from "@/lib/membership/constants";

export type OnboardingChecklistId = "profile" | "welcomeKit" | "associationKit" | "whatsapp" | "firstEvent" | "registration";

export type OnboardingChecklistItem = Readonly<{
  id: OnboardingChecklistId;
  done: boolean;
  href: string;
  external: boolean;
}>;

/**
 * Profile completion and WhatsApp opt-in already live on the profile row, so those
 * two ticks are derived. A kit row appears only once its URL is published. The first
 * RSVP has no column to write to; it stays unchecked. Do not add a checklist table
 * for links that are still unset.
 */
export function deriveOnboardingChecklist(input: Readonly<{
  profileComplete: boolean;
  whatsappOptIn: boolean;
  planCode?: MembershipPlanCode;
  kitLinks?: MembershipKitLinks;
}>): readonly OnboardingChecklistItem[] {
  const kitLinks = input.kitLinks ?? MEMBERSHIP_KIT_LINKS;
  const items: OnboardingChecklistItem[] = [
    {id: "profile", done: input.profileComplete, href: "/portal/profile", external: false},
  ];
  const welcomeKit = publishedMembershipKitHref(kitLinks.welcomeKit);
  if (welcomeKit) items.push({id: "welcomeKit", done: false, href: welcomeKit, external: true});
  const associationKit = publishedMembershipKitHref(kitLinks.associationKit);
  if (associationKit) items.push({id: "associationKit", done: false, href: associationKit, external: true});
  items.push(
    {id: "whatsapp", done: input.whatsappOptIn, href: "/portal/profile", external: false},
    {id: "firstEvent", done: false, href: "/events", external: false},
  );
  // Optional after payment. It does not block checkout.
  if (input.planCode && planCollectsCompany(input.planCode) && input.planCode !== "startup") {
    items.push({id: "registration", done: false, href: "/portal/company", external: false});
  }
  return items;
}
