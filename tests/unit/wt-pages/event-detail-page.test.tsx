import {renderToStaticMarkup} from "react-dom/server";
import type {ReactNode} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const events = vi.hoisted(() => ({getPublicBySlug: vi.fn()}));

vi.mock("@/lib/db/repos/events", () => ({eventsRepository: events}));
vi.mock("next-intl/server", () => ({getTranslations: async () => (key: string) => key, setRequestLocale: () => undefined}));
vi.mock("next/navigation", () => ({notFound: () => { throw new Error("NEXT_NOT_FOUND"); }}));
vi.mock("next/image", () => ({default: ({unoptimized, ...props}: {unoptimized?: boolean; [key: string]: unknown}) => <img {...props} data-unoptimized={String(unoptimized)} />}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/components/portal/event-registration-form", () => ({EventRegistrationForm: () => <div data-registration-form="true" />}));

import EventPage from "@/app/[locale]/(public)/events/[slug]/page";

const props = {params: Promise.resolve({locale: "en", slug: "public-event"})};
const event = (endsAt: string, overrides: Partial<Record<string, unknown>> = {}) => ({
  id: "10000000-0000-4000-8000-000000000001",
  slug: "public-event",
  title: "Public Event",
  description: "A public Event description.",
  startsAt: "2030-01-01T09:00:00.000Z",
  endsAt,
  venue: "Hong Kong",
  capacity: 20,
  hero: null,
  ...overrides,
});

describe("event detail page donor markup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the hero, facts grid, main/aside layout and a live action bar for an open event", async () => {
    events.getPublicBySlug.mockResolvedValue(event("2030-01-02T09:00:00.000Z"));

    const rendered = renderToStaticMarkup(await EventPage(props));

    expect(rendered).toContain('class="event-detail-hero"');
    expect(rendered).toMatch(/--wt-event-photo:\s*url\(\/images\/projects-hero\.jpg\)/);
    expect(rendered).toContain('class="event-detail-facts"');
    expect(rendered).toContain('class="event-detail-layout"');
    expect(rendered).toContain('class="event-detail-aside"');
    expect(rendered).toContain('class="event-action-bar"');
    expect(rendered).toContain('data-registration-form="true"');
    expect(rendered).not.toContain("pastEventLabel");
  });

  it("shows the past-event action bar instead of the registration form once the boundary has passed", async () => {
    events.getPublicBySlug.mockResolvedValue(event("2020-01-02T09:00:00.000Z"));

    const rendered = renderToStaticMarkup(await EventPage(props));

    expect(rendered).toContain("pastEventLabel");
    expect(rendered).not.toContain('data-registration-form="true"');
  });

  it("sets --wt-event-photo from the event's own validated hero image", async () => {
    const url = "/api/media/10000000-0000-4000-8000-000000000001";
    events.getPublicBySlug.mockResolvedValue(event("2030-01-02T09:00:00.000Z", {hero: {url, alt: "Hero"}}));

    const rendered = renderToStaticMarkup(await EventPage(props));

    expect(rendered).toMatch(new RegExp(`--wt-event-photo:\\s*url\\(${url.replace(/\//g, "\\/")}\\)`));
  });
});
