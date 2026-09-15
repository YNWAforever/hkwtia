export type PublicEventStatus = "open" | "past";
export type PublicEventFormat = "in_person" | "online" | "hybrid";
export type PublicEventRegistrationMode = "rsvp" | "external" | "ticketed";

export type PublicEventProjection = Readonly<{
  id: string;
  slug: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  venue: string | null;
  capacity: number | null;
  hero: Readonly<{url: string; alt: string}> | null;
  // Phase B1 (B-4, B-6): the detail page picks the registration path from these,
  // and /events filters on format and tags. `organiser.slug` is the address of the
  // company's /members page and is null unless that page is actually published
  // (`publicMemberPageSlug`, lib/members/public.ts) -- so a reader of this type can
  // link on the slug alone without checking a second condition it cannot see.
  format: PublicEventFormat;
  onlineUrl: string | null;
  tags: readonly string[];
  registrationMode: PublicEventRegistrationMode;
  externalRegistrationUrl: string | null;
  // Phase D-4a: the staff-set price of a `ticketed` event, in integer HKD
  // cents, or null when the event is not ticketed. The detail page renders its
  // checkout form only in the "ticketed" arm, where the column is non-null.
  ticketPriceHkdCents: number | null;
  organiser: Readonly<{name: string; slug: string | null}> | null;
}>;

export function parsePublicEventStatus(value: string | readonly string[] | undefined): PublicEventStatus {
  return value === "past" ? "past" : "open";
}

export function eventBoundary(event: Readonly<{startsAt: Date; endsAt: Date | null}>): Date {
  return event.endsAt ?? event.startsAt;
}
