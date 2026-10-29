import {MEMBERSHIP_KIT_LINKS} from "@/config/membership-journey";

export type OnboardingChecklistId = "profile" | "welcomeKit" | "associationKit" | "whatsapp" | "firstEvent";

export type OnboardingChecklistItem = Readonly<{
  id: OnboardingChecklistId;
  done: boolean;
  href: string;
  external: boolean;
}>;

/**
 * Profile completion and WhatsApp opt-in already live on the profile row, so those
 * two ticks are derived. Kit downloads and the first RSVP have no column to write
 * to; they stay unchecked. Do not add a checklist table for placeholders.
 */
export function deriveOnboardingChecklist(input: Readonly<{
  profileComplete: boolean;
  whatsappOptIn: boolean;
}>): readonly OnboardingChecklistItem[] {
  return [
    {id: "profile", done: input.profileComplete, href: "/portal/profile", external: false},
    {id: "welcomeKit", done: false, href: MEMBERSHIP_KIT_LINKS.welcomeKit, external: true},
    {id: "associationKit", done: false, href: MEMBERSHIP_KIT_LINKS.associationKit, external: true},
    {id: "whatsapp", done: input.whatsappOptIn, href: "/portal/profile", external: false},
    {id: "firstEvent", done: false, href: "/events", external: false},
  ];
}
