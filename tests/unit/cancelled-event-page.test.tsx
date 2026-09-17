import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach, describe, expect, it, vi} from "vitest";

const events = vi.hoisted(() => ({getPublicBySlug: vi.fn()}));
const auth = vi.hoisted(() => ({getActor: vi.fn(async () => null as unknown)}));
const profiles = vi.hoisted(() => ({getById: vi.fn(async () => null as unknown)}));

vi.mock("@/lib/db/repos/events", () => ({eventsRepository: events}));
vi.mock("@/lib/db/repos/profiles", () => ({profilesRepository: profiles}));
vi.mock("@/lib/auth/actor", () => ({getActor: auth.getActor, requireActor: vi.fn()}));
vi.mock("@/lib/events/guest-registration-action", () => ({submitGuestRsvpAction: vi.fn()}));
vi.mock("@/components/marketing/guest-rsvp-form", () => ({GuestRsvpForm: () => <div data-guest-rsvp-form="true"/>}));
vi.mock("@/components/marketing/ticket-checkout-form", () => ({TicketCheckoutForm: () => <div data-ticket-checkout-form="true"/>}));
vi.mock("@/components/portal/event-registration-form", () => ({EventRegistrationForm: () => <div data-registration-form="true"/>}));
vi.mock("next-intl/server", () => ({getTranslations: async () => (key: string) => key, setRequestLocale: () => undefined}));
vi.mock("next/navigation", () => ({notFound: () => { throw new Error("NEXT_NOT_FOUND"); }}));
vi.mock("next/image", () => ({default: ({unoptimized, ...props}: {unoptimized?: boolean; [key: string]: unknown}) => <img {...props} data-unoptimized={String(unoptimized)}/>}));

import EventPage, {generateMetadata} from "@/app/[locale]/(public)/events/[slug]/page";

const props = {params: Promise.resolve({locale: "en", slug: "cancelled-event"})};
const event = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: "10000000-0000-4000-8000-000000000001",
  slug: "cancelled-event",
  title: "Cancelled Event",
  description: "An event that was called off.",
  startsAt: "2030-01-01T09:00:00.000Z",
  endsAt: "2030-01-02T09:00:00.000Z",
  venue: "Hong Kong",
  capacity: 20,
  hero: null,
  format: "in_person",
  onlineUrl: null,
  tags: [],
  registrationMode: "rsvp",
  externalRegistrationUrl: null,
  ticketPriceHkdCents: null,
  organiser: null,
  cancelled: false,
  ...overrides,
});

describe("the cancelled public event page", () => {
  beforeEach(() => { vi.clearAllMocks(); auth.getActor.mockResolvedValue(null); profiles.getById.mockResolvedValue(null); });

  it("renders the cancellation notice with the event's title, date and venue", async () => {
    events.getPublicBySlug.mockResolvedValue(event({cancelled: true}));

    const rendered = renderToStaticMarkup(await EventPage(props));

    expect(rendered).toContain('role="status"');
    expect(rendered).toContain("cancelled.heading");
    expect(rendered).toContain("cancelled.body");
    expect(rendered).toContain("cancelled.refundPolicy");
    expect(rendered).toContain("Cancelled Event");
    expect(rendered).toContain("Hong Kong");
  });

  // Absent, not disabled: a disabled control still invites the idea that a
  // payment or a place is possible.
  it("renders no registration, checkout or RSVP control for a cancelled event", async () => {
    events.getPublicBySlug.mockResolvedValue(event({cancelled: true}));

    const anonymous = renderToStaticMarkup(await EventPage(props));
    expect(anonymous).not.toContain("data-registration-form");
    expect(anonymous).not.toContain("data-guest-rsvp-form");
    expect(anonymous).not.toContain("data-ticket-checkout-form");
    expect(anonymous).not.toContain("event-action-bar");

    auth.getActor.mockResolvedValue({kind: "member", userId: "u", profileId: "p"});
    const member = renderToStaticMarkup(await EventPage(props));
    expect(member).not.toContain("data-registration-form");

    events.getPublicBySlug.mockResolvedValue(event({cancelled: true, registrationMode: "external", externalRegistrationUrl: "https://tickets.example.hk/cancelled-event"}));
    const external = renderToStaticMarkup(await EventPage(props));
    expect(external).not.toContain("https://tickets.example.hk/cancelled-event");
    expect(external).not.toContain("registerExternally");
  });

  it("does not render the notice or the cancelled JSON-LD status for a published event", async () => {
    events.getPublicBySlug.mockResolvedValue(event());

    const rendered = renderToStaticMarkup(await EventPage(props));

    expect(rendered).not.toContain("cancelled.heading");
    expect(rendered).not.toContain("eventStatus");
    expect(rendered).toContain('data-guest-rsvp-form="true"');
  });

  it("carries noindex metadata only on the cancelled path", async () => {
    events.getPublicBySlug.mockResolvedValue(event({cancelled: true}));
    await expect(generateMetadata(props)).resolves.toMatchObject({robots: {index: false, follow: false}});

    events.getPublicBySlug.mockResolvedValue(event());
    const metadata = await generateMetadata(props);
    expect(metadata.robots).toBeUndefined();
  });

  it("marks the Event JSON-LD as cancelled, and only then", async () => {
    events.getPublicBySlug.mockResolvedValue(event({cancelled: true}));
    const cancelled = renderToStaticMarkup(await EventPage(props));
    expect(cancelled).toContain('"eventStatus":"https://schema.org/EventCancelled"');

    events.getPublicBySlug.mockResolvedValue(event());
    const published = renderToStaticMarkup(await EventPage(props));
    expect(published).not.toContain("eventStatus");
  });
});
