import {drizzle} from "drizzle-orm/pg-proxy";
import {beforeEach, describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));

vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import {listFeaturedPublicEvents} from "@/lib/db/repos/events";
import type {Event} from "@/lib/db/server-schema";

const anonymous = {kind: "anonymous", userId: null} as const;
const asOf = new Date("2030-01-01T10:00:00.000Z");

function event(slug: string, overrides: Partial<Event> = {}): Event {
  return {
    id: `${slug}-id`,
    slug,
    titleEn: `${slug} title`,
    titleZh: null,
    descriptionEn: `${slug} description`,
    descriptionZh: null,
    startsAt: new Date("2030-01-01T09:00:00.000Z"),
    endsAt: new Date("2030-01-01T12:00:00.000Z"),
    venue: "WTIA",
    capacity: null,
    memberOnly: false,
    published: true,
    heroMediaId: null,
    createdAt: new Date("2026-07-20T00:00:00.000Z"),
    updatedAt: new Date("2026-07-20T00:00:00.000Z"),
    ...overrides,
  };
}

describe("featured public Event query", () => {
  beforeEach(() => {
    database.current = null;
  });

  it("pushes limit one through the filtered and ordered SQL query boundary", async () => {
    const statements: Array<{query: string; params: unknown[]}> = [];
    database.current = drizzle(async (query, params) => {
      statements.push({query, params});
      return {rows: []};
    });

    await expect(listFeaturedPublicEvents(anonymous, {asOf, limit: 1, locale: "zh-HK"}))
      .resolves.toEqual([]);

    expect(statements).toHaveLength(1);
    expect(statements[0]?.query).toMatch(/where.*published.*member_only/is);
    expect(statements[0]?.query).toMatch(/order by.*coalesce.*slug.*id/is);
    expect(statements[0]?.query).toMatch(/limit/is);
    expect(statements[0]?.params).toContain(1);
  });

  it("preserves filtering, ordering, localization, and limiting for an in-memory source", async () => {
    const source = [
      event("later", {startsAt: new Date("2030-01-02T12:00:00.000Z"), endsAt: null}),
      event("first", {titleZh: "第一個活動", descriptionZh: "第一個內容"}),
      event("member-only", {memberOnly: true, titleZh: "私人活動"}),
    ];

    await expect(listFeaturedPublicEvents(
      anonymous,
      {asOf, limit: 1, locale: "zh-HK"},
      source,
    )).resolves.toMatchObject([{slug: "first", title: "第一個活動", description: "第一個內容"}]);
  });

  it.each([0, 13, 1.5])("rejects invalid limit %s before any source read", async (limit) => {
    const source = {list: vi.fn(async () => [event("never")])};

    await expect(listFeaturedPublicEvents(anonymous, {asOf, limit}, source)).rejects.toThrow();
    expect(source.list).not.toHaveBeenCalled();
  });
});
