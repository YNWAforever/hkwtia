import "server-only";

import {cookies} from "next/headers";

import {applicationsRepository} from "@/lib/db/repos/applications";
import {contactWriterActor, contactsRepository} from "@/lib/db/repos/contacts";
import type {Actor} from "@/lib/membership/lifecycle";
import {
  ATTRIBUTION_COOKIE,
  cleanHeardAbout,
  decodeFirstTouch,
  type FirstTouch,
} from "@/lib/membership/attribution";

const EMPTY: FirstTouch = {
  utmSource: null, utmMedium: null, utmCampaign: null, utmTerm: null, utmContent: null,
  referralCode: null, referrerHost: null, landingPath: null,
};

export type SignupAttribution = FirstTouch & Readonly<{heardAbout: string | null}>;

type AttributionDeps = Readonly<{
  readCookie: () => Promise<string | undefined>;
  recordApplication: (actor: Actor, applicationId: string, attribution: SignupAttribution) => Promise<void>;
  stampContact: (contactId: string, profileId: string, attribution: SignupAttribution) => Promise<void>;
}>;

const defaultDeps: AttributionDeps = {
  readCookie: async () => {
    try {
      return (await cookies()).get(ATTRIBUTION_COOKIE)?.value;
    } catch (error) {
      // Unit tests call the join actions without a request store. A real request has one.
      if (error instanceof Error && error.message.includes("outside a request scope")) return undefined;
      throw error;
    }
  },
  recordApplication: (actor, applicationId, attribution) => applicationsRepository.recordSignupAttribution(actor, applicationId, attribution),
  stampContact: (contactId, profileId, attribution) => contactsRepository.stampSignupAttribution(
    contactWriterActor("import"),
    {contactId, profileId, ...attribution},
  ),
};

function hasSignal(attribution: SignupAttribution): boolean {
  return Object.values(attribution).some((value) => value !== null);
}

/**
 * Persists the first-touch cookie and the optional join answer.
 * Campaign columns stay as first written. Apply migration 0070 before deploy;
 * a missing column fails this write rather than dropping the source silently.
 */
export async function persistSignupAttribution(
  actor: Actor,
  applicationId: string,
  heardAbout: string | null,
  contact?: Readonly<{contactId: string | null; profileId: string}> | null,
  deps: AttributionDeps = defaultDeps,
): Promise<SignupAttribution | null> {
  if (actor.kind !== "member") return null;
  const touch = decodeFirstTouch(await deps.readCookie()) ?? EMPTY;
  const attribution: SignupAttribution = {...touch, heardAbout: cleanHeardAbout(heardAbout)};
  if (!hasSignal(attribution)) return null;
  await deps.recordApplication(actor, applicationId, attribution);
  if (contact?.contactId) {
    await deps.stampContact(contact.contactId, contact.profileId, attribution);
  }
  return attribution;
}
