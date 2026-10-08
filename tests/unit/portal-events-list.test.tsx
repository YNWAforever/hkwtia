import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach, describe, expect, it, vi} from "vitest";

import en from "@/messages/en.json";

const state = vi.hoisted(() => ({
  events: [] as Array<Record<string, unknown>>,
  mine: null as null | {events: Array<Record<string, unknown>>},
  context: null as null | (() => Promise<unknown>),
}));

// Real English strings with {placeholder} interpolation, so copy assertions are on what members read.
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string, values?: Record<string, string | number>) => {
    const found = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], (en as {Portal: unknown}).Portal);
    const text = typeof found === "string" ? found : key;
    return text.replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? ""));
  },
  setRequestLocale: () => undefined,
}));
// ActionLink (inside HonestEmpty) uses the locale-aware Link, which needs an intl provider.
vi.mock("@/i18n/navigation", () => ({Link: ({href, children, ...rest}: {href: string; children: React.ReactNode}) => <a href={href} {...rest}>{children}</a>}));
vi.mock("@/lib/auth/actor", () => ({requireActor: async () => ({kind: "member", userId: "u", profileId: "p"}), getActor: async () => ({kind: "member", userId: "u", profileId: "p"})}));
vi.mock("@/lib/portal/content", () => ({getMemberEvents: async () => state.events}));
vi.mock("@/lib/events/member-core", () => ({
  listMyCompanyEvents: async () => state.mine,
  loadMemberEventsContext: () => state.context!(),
}));
vi.mock("@/components/portal/event-registration-form", () => ({
  EventRegistrationForm: ({eventId}: {eventId: string}) => <button data-rsvp={eventId} type="submit">Register</button>,
}));

import MemberEventsPage from "@/app/[locale]/(member)/portal/events/page";

const render = async () => renderToStaticMarkup(await MemberEventsPage({params: Promise.resolve({locale: "en"})}));
const event = (slug: string, registrationMode: string, visibility = "public", externalRegistrationUrl: string | null = null) => ({
  id: slug, slug, title: slug, startsAt: "2099-01-05T10:00:00.000Z", venue: "WTIA House", registrationMode, visibility, externalRegistrationUrl,
});
const ownRow = (id: string, status: string, rejection_reason: string | null = null) => ({
  id, slug: id, title_en: `Own ${id}`, title_zh: null, description_en: "d", description_zh: null, starts_at: "2099-02-10T10:00:00.000Z", ends_at: null,
  venue: null, capacity: null, status, visibility: "public", format: "in_person", online_url: null, registration_mode: "rsvp",
  external_registration_url: null, tags: [], hero_media_id: null, rejection_reason, submitted_at: null, published_at: null,
});

beforeEach(() => {
  state.events = [event("free", "rsvp")];
  state.mine = null;
  state.context = async () => ({usedThisQuarter: 1, limit: 2});
});

describe("member portal events list", () => {
  it("renders a date block and the venue without Date:/Venue: labels", async () => {
    const html = await render();
    expect(html).toContain("portal-date-block");
    expect(html).toContain("WTIA House");
    expect(html).not.toContain("Date:");
    expect(html).not.toContain("Venue:");
  });

  it("picks one control per registration mode", async () => {
    state.events = [event("free", "rsvp"), event("offsite", "external", "public", "https://tickets.example.hk/x"), event("paid", "ticketed"), event("closed", "ticketed", "members_only")];
    const html = await render();
    expect(html.match(/data-rsvp=/g)).toHaveLength(1);
    expect(html).toMatch(/<a [^>]*target="_blank"[^>]*>/);
    expect(html).toMatch(/rel="[^"]*noopener[^"]*"/);
    expect(html).toContain("(opens in a new tab)");
    expect(html).toContain('href="/events/paid"');
    expect(html).not.toContain('href="/events/closed"');
    expect(html).toContain(en.Portal.events.registrationUnavailable);
  });

  it("lists the organisation's events with quota, status labels and the rejection reason only when rejected", async () => {
    state.mine = {events: [ownRow("a", "published", "stale"), ownRow("b", "rejected", "Needs a venue")]};
    const html = await render();
    expect(html).toContain("Events your organisation has submitted");
    expect(html.match(/href="\/portal\/events\/new"/g)).toHaveLength(1);
    expect(html).toContain("1 of 2 reviewed events used this quarter");
    expect(html).toContain("Published");
    expect(html).toContain("Returned");
    expect(html.match(/portal-form-alert/g)).toHaveLength(1);
    expect(html).toContain("Returned by WTIA: Needs a venue");
    expect(html).not.toContain("stale");
  });

  it("still renders the section when the quota read fails, without a quota line", async () => {
    state.mine = {events: [ownRow("a", "draft")]};
    state.context = async () => { throw new Error("NO_MEMBERSHIP_FOR_COMPANY"); };
    const html = await render();
    expect(html).toContain("Own a");
    expect(html).not.toContain("reviewed events used");
  });

  it("omits the section when the member manages no company", async () => {
    const html = await render();
    expect(html).not.toContain("Events your organisation has submitted");
    expect(html).not.toContain("/portal/events/new");
  });

  it("points an empty list at the public events page", async () => {
    state.events = [];
    const html = await render();
    expect(html).toContain(en.Portal.events.empty);
    expect(html).toContain('href="/events"');
  });
});
