import "server-only";

import type {Profile} from "@/lib/db/server-schema";
import {profilesRepository} from "@/lib/db/repos/profiles";
import {requireMember, type Actor} from "@/lib/membership/lifecycle";

export type SelfProfile = Pick<Profile, "id" | "displayName" | "phone" | "jobTitle" | "locale" | "onboardingState" | "directoryVisible" | "whatsappNumber" | "whatsappOptIn">;
type SelfProfileReader = Readonly<{getById: (actor: Actor, profileId: string) => Promise<SelfProfile | null>}>;

/** Own preferences remain available after entitlement expires; no target profile ID is accepted. */
export async function getSelfProfile(actor: Actor, profiles: SelfProfileReader = profilesRepository): Promise<SelfProfile> {
  requireMember(actor);
  const profile = await profiles.getById(actor, actor.profileId);
  if (!profile) throw new Error("PROFILE_NOT_FOUND");
  return {
    id: profile.id, displayName: profile.displayName, phone: profile.phone, jobTitle: profile.jobTitle,
    locale: profile.locale, onboardingState: profile.onboardingState, directoryVisible: profile.directoryVisible,
    whatsappNumber: profile.whatsappNumber, whatsappOptIn: profile.whatsappOptIn,
  };
}
