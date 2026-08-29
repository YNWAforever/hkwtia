import {describe, expect, it, vi} from "vitest";

const productionReaders = vi.hoisted(() => ({
  events: vi.fn(),
  legacyEvents: vi.fn(async () => []),
  news: vi.fn(async () => []),
  showcase: vi.fn(async () => []),
}));

vi.mock("@/lib/db/repos/events", () => ({
  eventsRepository: {
    listFeaturedPublic: productionReaders.events,
    listPublic: productionReaders.legacyEvents,
  },
}));
vi.mock("@/lib/db/repos/public-posts", () => ({
  listPublishedNews: productionReaders.news,
}));
vi.mock("@/lib/db/repos/showcase", () => ({
  showcaseRepository: {listPublished: productionReaders.showcase},
}));

import {loadHomeHighlights} from "@/lib/home/home-highlights";

const anonymous = {kind: "anonymous", userId: null} as const;
const asOf = new Date("2026-08-28T00:00:00.000Z");
const localizedEvent = {
  id: "10000000-0000-4000-8000-000000000001",
  slug: "event-one",
  title: "活動中文",
  description: "活動內容中文",
  startsAt: "2026-09-01T00:00:00.000Z",
  endsAt: "2026-09-01T02:00:00.000Z",
  venue: "Hong Kong",
  capacity: 80,
  hero: null,
} as const;

describe("homepage featured Event boundary", () => {
  it("uses the dedicated bounded Event reader with the requested locale", async () => {
    productionReaders.events.mockResolvedValueOnce([localizedEvent]);

    const result = await loadHomeHighlights({locale: "zh-HK", asOf});

    expect(productionReaders.events).toHaveBeenCalledWith(
      anonymous,
      {asOf, limit: 1, locale: "zh-HK"},
    );
    expect(productionReaders.legacyEvents).not.toHaveBeenCalled();
    expect(result.event).toEqual({status: "available", item: localizedEvent});
  });
});
