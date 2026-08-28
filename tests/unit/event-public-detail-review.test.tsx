import {readFileSync} from "node:fs";

import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach, describe, expect, it, vi} from "vitest";

const events = vi.hoisted(() => ({getPublicBySlug: vi.fn(), listPublic: vi.fn()}));
const publicPosts = vi.hoisted(() => ({listPublishedBuildLogs: vi.fn(), listPublishedNews: vi.fn()}));
const showcase = vi.hoisted(() => ({listPublishedSlugs: vi.fn()}));

vi.mock("@/lib/db/repos/events", () => ({eventsRepository: events}));
vi.mock("@/lib/db/repos/public-posts", () => publicPosts);
vi.mock("@/lib/db/repos/showcase", () => ({showcaseRepository: showcase}));
vi.mock("next-intl/server", () => ({getTranslations: async () => (key: string) => key, setRequestLocale: () => undefined}));
vi.mock("next/navigation", () => ({notFound: () => { throw new Error("NEXT_NOT_FOUND"); }}));
vi.mock("next/image", () => ({default: ({unoptimized, ...props}: {unoptimized?: boolean; [key: string]: unknown}) => <img {...props} data-unoptimized={String(unoptimized)}/> }));
vi.mock("@/components/portal/event-registration-form", () => ({EventRegistrationForm: () => <div data-registration-form="true"/>}));

import EventPage, {generateMetadata} from "@/app/[locale]/(public)/events/[slug]/page";
import sitemap from "@/app/sitemap";

const props = {params: Promise.resolve({locale: "en", slug: "public-event"})};
const event = (endsAt: string, hero: {url: string; alt: string} | null = null) => ({
  id: "10000000-0000-4000-8000-000000000001",
  slug: "public-event",
  title: "Public Event",
  description: "A public Event description.",
  startsAt: "2030-01-01T09:00:00.000Z",
  endsAt,
  venue: "Hong Kong",
  capacity: 20,
  hero,
});

describe("public Event detail page review regressions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publicPosts.listPublishedBuildLogs.mockResolvedValue([]);
    publicPosts.listPublishedNews.mockResolvedValue([]);
    showcase.listPublishedSlugs.mockResolvedValue([]);
    events.listPublic.mockResolvedValue([]);
  });

  it("uses the reader's exact equality boundary to keep registration visible", async () => {
    events.getPublicBySlug.mockImplementation(async (_slug: string, _locale: string, options: {asOf: Date}) => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      return event(options.asOf.toISOString());
    });

    const rendered = renderToStaticMarkup(await EventPage(props));

    expect(events.getPublicBySlug).toHaveBeenCalledWith("public-event", "en", {asOf: expect.any(Date)});
    expect(rendered).toContain('data-registration-form="true"');
  });

  it("hides registration immediately before the request-scoped boundary", async () => {
    events.getPublicBySlug.mockImplementation(async (_slug: string, _locale: string, options: {asOf: Date}) => event(new Date(options.asOf.getTime() - 1).toISOString()));

    const rendered = renderToStaticMarkup(await EventPage(props));

    expect(rendered).not.toContain('data-registration-form="true"');
  });

  it("keeps a private delivery hero in detail markup, unoptimized, and structured data", async () => {
    const url = "/api/media/10000000-0000-4000-8000-000000000001";
    events.getPublicBySlug.mockResolvedValue(event("2030-01-01T12:00:00.000Z", {url, alt: "Private hero"}));

    const rendered = renderToStaticMarkup(await EventPage(props));

    expect(rendered).toContain(url);
    expect(rendered).toContain('data-unoptimized="true"');
    expect(rendered).toContain('"image":"http://localhost:3000/api/media/10000000-0000-4000-8000-000000000001"');
  });

  it("uses repository public visibility for metadata and detail markup, excluding an unsafe archived-or-donor hero", async () => {
    events.getPublicBySlug.mockResolvedValue(null);
    await expect(generateMetadata(props)).resolves.toEqual({});
    await expect(EventPage(props)).rejects.toThrow("NEXT_NOT_FOUND");

    const donorUrl = "https://donor.example/hero.png";
    events.getPublicBySlug.mockResolvedValue(event("2030-01-01T12:00:00.000Z", {url: donorUrl, alt: "Donor hero"}));
    const rendered = renderToStaticMarkup(await EventPage(props));
    expect(rendered).toContain("Public Event");
    expect(rendered).not.toContain(donorUrl);
    expect(rendered).not.toContain('"image":"https://donor.example/hero.png"');
  });
});

describe("Event sitemap repository behavior", () => {
  it("emits only repository Event URLs, not static-content fallback URLs", async () => {
    events.listPublic.mockResolvedValue([{slug: "repository-event"}]);

    const urls = (await sitemap()).map(({url}) => url);

    expect(events.listPublic).toHaveBeenCalledWith(
      {kind: "anonymous", userId: null},
      expect.objectContaining({status: "open", asOf: expect.any(Date)}),
    );
    expect(urls).toEqual(expect.arrayContaining([
      "http://localhost:3000/events/repository-event",
      "http://localhost:3000/zh/events/repository-event",
    ]));
    expect(urls).not.toContain("http://localhost:3000/events/static-event");
    expect(readFileSync("app/sitemap.ts", "utf8")).not.toContain("@/content/events");
  });

  it("omits Event detail URLs after a repository failure while retaining unrelated routes", async () => {
    events.listPublic.mockRejectedValue(new Error("EVENT_REPOSITORY_UNAVAILABLE"));

    const urls = (await sitemap()).map(({url}) => url);

    expect(urls).toEqual(expect.arrayContaining([
      "http://localhost:3000/",
      "http://localhost:3000/zh",
      "http://localhost:3000/news",
      "http://localhost:3000/zh/news",
    ]));
    expect(urls.some((url) => url.includes("/events/"))).toBe(false);
  });
});
