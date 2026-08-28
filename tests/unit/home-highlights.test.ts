import {describe, expect, it, vi} from "vitest";

import type {Event} from "@/lib/db/server-schema";
import type {PublishedNewsSummary} from "@/lib/db/repos/public-posts";
import type {PublicShowcaseRow} from "@/lib/db/repos/showcase";
import {
  loadHomeHighlights,
  type HomeHighlightReaders,
} from "@/lib/home/home-highlights";

const asOf = new Date("2026-08-28T00:00:00.000Z");

const event = {
  id: "10000000-0000-4000-8000-000000000001",
  slug: "event-one",
  titleEn: "Event EN",
  titleZh: "活動中文",
  descriptionEn: "Event body EN",
  descriptionZh: "活動內容中文",
  startsAt: new Date("2026-09-01T00:00:00.000Z"),
  endsAt: new Date("2026-09-01T02:00:00.000Z"),
  venue: "Hong Kong",
  capacity: 80,
  memberOnly: false,
  published: true,
  heroMediaId: null,
  createdAt: asOf,
  updatedAt: asOf,
} satisfies Event;

const secondEvent = {
  ...event,
  id: "10000000-0000-4000-8000-000000000002",
  slug: "event-two",
  titleEn: "Wrong second event",
  titleZh: "錯誤第二活動",
} satisfies Event;

const news = {
  slug: "news-one",
  titleEn: "News EN",
  titleZh: "消息中文",
  publishedAt: asOf,
  author: "WTIA",
} satisfies PublishedNewsSummary;

const secondNews = {
  ...news,
  slug: "news-two",
  titleEn: "Wrong second news",
  titleZh: "錯誤第二消息",
} satisfies PublishedNewsSummary;

const listing = {
  id: "20000000-0000-4000-8000-000000000001",
  companyId: "30000000-0000-4000-8000-000000000001",
  slug: "member-one",
  status: "published",
  premium: false,
  goneGlobal: false,
  views: 4,
  memberSince: "2020-01-01",
  nameEn: "Member EN",
  nameZhHk: "會員中文",
  taglineEn: "Tagline EN",
  taglineZhHk: "標語中文",
  descriptionEn: "Description EN",
  descriptionZhHk: "介紹中文",
  category: "software",
  useCases: ["logistics"],
  deploymentOptions: ["cloud"],
  supportedLanguages: ["en", "zh-HK"],
  worksWith: ["ERP"],
  videoUrl: null,
  caseStudyUrl: "https://example.test/case-study",
  caseStudySummaryEn: "Case study EN",
  caseStudySummaryZhHk: "案例中文",
  logoReference: "member supplied reference",
  logoMediaId: "40000000-0000-4000-8000-000000000001",
  logoMediaUrl: "/images/showcase/member-one.png",
  logoMediaAltEn: "Member EN logo",
  logoMediaAltZh: "會員中文標誌",
  reviewedAt: asOf,
  reviewedByProfileId: "reviewer",
  rejectionReason: null,
  createdAt: asOf,
  updatedAt: asOf,
} satisfies PublicShowcaseRow;

const secondListing = {
  ...listing,
  id: "20000000-0000-4000-8000-000000000002",
  slug: "member-two",
  nameEn: "Wrong second member",
  nameZhHk: "錯誤第二會員",
} satisfies PublicShowcaseRow;

function createReaders(
  overrides: Partial<HomeHighlightReaders> = {},
): HomeHighlightReaders {
  return {
    events: vi.fn(async () => [event, secondEvent]),
    news: vi.fn(async () => [news, secondNews]),
    showcase: vi.fn(async () => [listing, secondListing]),
    ...overrides,
  };
}

function expectEachReaderCalledOnce(readers: HomeHighlightReaders) {
  expect(readers.events).toHaveBeenCalledTimes(1);
  expect(readers.news).toHaveBeenCalledTimes(1);
  expect(readers.showcase).toHaveBeenCalledTimes(1);
}

describe("loadHomeHighlights", () => {
  it.each([
    ["en", "Event EN", "Event body EN", "Member EN", "Tagline EN", "Description EN", "Case study EN", "Member EN logo"],
    ["zh-HK", "活動中文", "活動內容中文", "會員中文", "標語中文", "介紹中文", "案例中文", "會員中文標誌"],
  ] as const)(
    "maps the first repository record for the %s locale without rewriting news",
    async (locale, eventTitle, eventDescription, memberName, tagline, description, caseStudySummary, logoAlt) => {
      const readers = createReaders();

      const result = await loadHomeHighlights({locale, asOf, readers});

      expect(result.event).toEqual({
        status: "available",
        item: {
          id: event.id,
          slug: "event-one",
          title: eventTitle,
          description: eventDescription,
          startsAt: "2026-09-01T00:00:00.000Z",
          endsAt: "2026-09-01T02:00:00.000Z",
          venue: "Hong Kong",
          capacity: 80,
          memberOnly: false,
          published: true,
        },
      });
      expect(result.showcase).toMatchObject({
        status: "available",
        item: {
          slug: "member-one",
          name: memberName,
          tagline,
          description,
          caseStudySummary,
          logo: {url: "/images/showcase/member-one.png", alt: logoAlt},
        },
      });
      expect(result.news).toEqual({status: "available", item: news});
      if (result.news.status !== "available") throw new Error("news fixture was not available");
      expect(result.news.item).toBe(news);
      expectEachReaderCalledOnce(readers);
    },
  );

  it("passes the injected clock and exact one-record bounds to every reader", async () => {
    const readers = createReaders();

    await loadHomeHighlights({locale: "en", asOf, readers});

    expect(readers.events).toHaveBeenCalledWith({asOf, limit: 1});
    expect(readers.news).toHaveBeenCalledWith(asOf, {limit: 1});
    expect(readers.showcase).toHaveBeenCalledWith({}, {limit: 1});
    expectEachReaderCalledOnce(readers);
  });

  it.each(["events", "news", "showcase"] as const)(
    "turns a fulfilled empty %s read into empty without changing sibling records",
    async (domain) => {
      const readers = createReaders({[domain]: vi.fn(async () => [])});

      const result = await loadHomeHighlights({locale: "en", asOf, readers});

      const slotName = domain === "events" ? "event" : domain;
      expect(result[slotName]).toEqual({status: "empty"});
      for (const sibling of ["event", "news", "showcase"] as const) {
        if (sibling !== slotName) expect(result[sibling].status).toBe("available");
      }
      expectEachReaderCalledOnce(readers);
    },
  );

  it.each([
    ["events"],
    ["news"],
    ["showcase"],
    ["events", "news"],
    ["events", "showcase"],
    ["news", "showcase"],
    ["events", "news", "showcase"],
  ] as const)(
    "isolates rejected reads from %s without exposing their errors",
    async (...failedDomains) => {
      const secret = `relation secret_${failedDomains.join("_")}`;
      const overrides = Object.fromEntries(failedDomains.map((domain) => [
        domain,
        vi.fn(async () => { throw new Error(secret); }),
      ])) as Partial<HomeHighlightReaders>;
      const readers = createReaders(overrides);

      const result = await loadHomeHighlights({locale: "zh-HK", asOf, readers});

      for (const domain of ["events", "news", "showcase"] as const) {
        const slotName = domain === "events" ? "event" : domain;
        expect(result[slotName].status).toBe(
          failedDomains.some((failedDomain) => failedDomain === domain) ? "unavailable" : "available",
        );
      }
      expect(JSON.stringify(result)).not.toContain(secret);
      expect(JSON.stringify(result)).not.toContain("Error");
      expectEachReaderCalledOnce(readers);
    },
  );

  it("starts all reads before waiting for any one of them", async () => {
    const releases: Array<() => void> = [];
    const pending = <T,>(value: T) => new Promise<T>((resolve) => {
      releases.push(() => resolve(value));
    });
    const readers = createReaders({
      events: vi.fn(() => pending([event])),
      news: vi.fn(() => pending([news])),
      showcase: vi.fn(() => pending([listing])),
    });

    const loading = loadHomeHighlights({locale: "en", asOf, readers});

    expectEachReaderCalledOnce(readers);
    expect(releases).toHaveLength(3);
    releases.forEach((release) => release());
    await expect(loading).resolves.toMatchObject({
      event: {status: "available"},
      news: {status: "available"},
      showcase: {status: "available"},
    });
  });
});
