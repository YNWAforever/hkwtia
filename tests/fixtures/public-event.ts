import type {PublicEventProjection} from "@/lib/events/public";

/**
 * The Phase B1 (B-4/B-6) fields of a `PublicEventProjection`, at the values an
 * admin-authored, in-person, RSVP event carries. Spread it into hand-built
 * projection fixtures so a test about a card, a calendar or a hero image does
 * not have to restate registration fields it never reads.
 */
export const publicEventDefaults = {
  format: "in_person",
  onlineUrl: null,
  tags: [],
  registrationMode: "rsvp",
  externalRegistrationUrl: null,
  // Phase D-4a: an RSVP event has no price; only the detail page's ticket arm reads it.
  ticketPriceHkdCents: null,
  // Phase D-4d: a fixture is a live event unless it says otherwise.
  cancelled: false,
  organiser: null,
} as const satisfies Pick<PublicEventProjection, "format" | "onlineUrl" | "tags" | "registrationMode" | "externalRegistrationUrl" | "ticketPriceHkdCents" | "cancelled" | "organiser">;
