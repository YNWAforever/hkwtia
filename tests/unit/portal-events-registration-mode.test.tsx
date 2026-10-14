import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({events: [] as Array<Record<string, unknown>>, statuses: {} as Record<string, string>}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
  setRequestLocale: () => undefined,
}));
vi.mock("@/lib/auth/actor", () => ({requireActor: async () => ({kind: "member", userId: "u", profileId: "p"}), getActor: async () => ({kind: "member", userId: "u", profileId: "p"})}));
vi.mock("@/lib/portal/content", () => ({getMemberEventPage: async () => ({items: state.events, nextCursor: null})}));
vi.mock("@/lib/events/member-core", () => ({listMyCompanyEvents: async () => null}));
vi.mock("@/lib/portal/my-events", () => ({getMyRegistrationStatuses: async () => state.statuses}));
vi.mock("@/components/portal/event-registration-form", () => ({
  EventRegistrationForm: ({eventId, initialStatus}: {eventId: string; initialStatus?: string}) => <form data-rsvp={eventId} data-status={initialStatus} />,
}));

import MemberEventsPage from "@/app/[locale]/(member)/portal/events/page";

const future = "2099-01-01T10:00:00.000Z";
const event = (slug: string, registrationMode: string, visibility = "public", externalRegistrationUrl: string | null = null) => ({
  id: slug, slug, title: slug, startsAt: future, venue: "WTIA", registrationMode, visibility, externalRegistrationUrl,
});

describe("member portal event registration modes", () => {
  it("offers free RSVP only for RSVP events and routes other modes appropriately", async () => {
    state.events = [
      event("free", "rsvp"),
      event("paid", "ticketed"),
      event("private-paid", "ticketed", "members_only"),
      {...event("legacy-private", "ticketed"), memberOnly: true},
      event("offsite", "external", "public", "https://tickets.example.hk/offsite"),
    ];
    const html = renderToStaticMarkup(await MemberEventsPage({params: Promise.resolve({locale: "en"})}));
    expect(html.match(/data-rsvp=/g)).toHaveLength(1);
    expect(html).toContain('data-rsvp="free"');
    expect(html).toContain('href="https://tickets.example.hk/offsite"');
    expect(html).toContain('href="/events/paid"');
    expect(html).not.toContain('href="/events/private-paid"');
    expect(html).toContain('href="/portal/events/private-paid"');
    expect(html).toContain('href="/portal/events/legacy-private"');
    expect(html).not.toContain('href="/events/legacy-private"');
  });
  it("rebuilds registration state from the stored read on each request", async () => {
    state.events = [event("free", "rsvp")];
    state.statuses = {free: "waitlist"};
    for (let request = 0; request < 2; request++) {
      const html = renderToStaticMarkup(await MemberEventsPage({params: Promise.resolve({locale: "en"})}));
      expect(html).toContain('data-status="waitlist"');
      expect(html).toContain('href="/portal/events/my"');
    }
    state.statuses = {};
  });
});
