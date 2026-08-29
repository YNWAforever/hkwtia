import {describe, expect, it, vi} from "vitest";

import type {PublicEventProjection} from "@/lib/events/public";
import type {PublishedNewsSummary} from "@/lib/db/repos/public-posts";
import {loadHomeHighlights, type HomeHighlightReaders} from "@/lib/home/home-highlights";

const asOf = new Date("2026-08-28T00:00:00.000Z");
const event: PublicEventProjection = {
  id: "10000000-0000-4000-8000-000000000001",
  slug: "event-one",
  title: "Event",
  description: "Event body",
  startsAt: "2026-09-01T00:00:00.000Z",
  endsAt: "2026-09-01T02:00:00.000Z",
  venue: "Hong Kong",
  capacity: 80,
  hero: null,
};
const news: PublishedNewsSummary = {
  slug: "news-one",
  title: "消息中文",
  publishedAt: asOf,
  author: "WTIA",
};

function readers(overrides: Partial<HomeHighlightReaders> = {}): HomeHighlightReaders {
  return {
    events: vi.fn(async () => [event]),
    news: vi.fn(async () => [news]),
    showcase: vi.fn(async () => []),
    ...overrides,
  };
}

describe("loadHomeHighlights", () => {
  it("passes the requested locale, injected clock, and exact one-record bound to News", async () => {
    const input = readers();

    const result = await loadHomeHighlights({locale: "zh-HK", asOf, readers: input});

    expect(input.events).toHaveBeenCalledWith({asOf, limit: 1});
    expect(input.news).toHaveBeenCalledWith("zh-HK", asOf, {limit: 1});
    expect(input.showcase).toHaveBeenCalledWith({}, {limit: 1});
    expect(result.news).toEqual({status: "available", item: news});
  });

  it.each(["events", "news", "showcase"] as const)(
    "turns a fulfilled empty %s read into empty without changing siblings",
    async (domain) => {
      const input = readers({[domain]: vi.fn(async () => [])});

      const result = await loadHomeHighlights({locale: "en", asOf, readers: input});

      const slot = domain === "events" ? "event" : domain;
      expect(result[slot]).toEqual({status: "empty"});
    },
  );

  it.each(["events", "news", "showcase"] as const)(
    "isolates rejected %s reads without exposing their errors",
    async (domain) => {
      const secret = `private_${domain}`;
      const input = readers({[domain]: vi.fn(async () => { throw new Error(secret); })});

      const result = await loadHomeHighlights({locale: "en", asOf, readers: input});

      const slot = domain === "events" ? "event" : domain;
      expect(result[slot]).toEqual({status: "unavailable"});
      expect(JSON.stringify(result)).not.toContain(secret);
    },
  );

  it("starts all three reads before waiting for any of them", async () => {
    const releases: Array<() => void> = [];
    const pending = <T,>(value: T) => new Promise<T>((resolve) => releases.push(() => resolve(value)));
    const input = readers({
      events: vi.fn(() => pending([event])),
      news: vi.fn(() => pending([news])),
      showcase: vi.fn(() => pending([])),
    });

    const loading = loadHomeHighlights({locale: "en", asOf, readers: input});

    expect(releases).toHaveLength(3);
    releases.forEach((release) => release());
    await expect(loading).resolves.toMatchObject({news: {status: "available", item: news}});
  });
});
