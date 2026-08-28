import {describe, expect, it, vi} from "vitest";

import type {Event} from "@/lib/db/server-schema";
import {getEventBySlug, getPublicEventBySlug, listFeaturedPublicEvents, listMemberEvents, listPublicEvents} from "@/lib/db/repos/events";
import type {Actor} from "@/lib/membership/lifecycle";

const anonymous: Actor = {kind: "anonymous", userId: null};
const member: Actor = {kind: "member", userId: "auth-member", profileId: "profile-member"};
const asOf = new Date("2030-01-01T10:00:00.000Z");

function event(slug: string, overrides: Partial<Event> = {}): Event {
  return {id: `${slug}-id`, slug, titleEn: `${slug} title`, titleZh: null, descriptionEn: `${slug} description`, descriptionZh: null, startsAt: new Date("2030-01-01T09:00:00.000Z"), endsAt: new Date("2030-01-01T12:00:00.000Z"), venue: "WTIA", capacity: null, memberOnly: false, published: true, heroMediaId: null, createdAt: new Date("2026-07-20T00:00:00.000Z"), updatedAt: new Date("2026-07-20T00:00:00.000Z"), ...overrides};
}

describe("repository-backed Event visibility", () => {
  const rows = [event("draft-public", {published: false}), event("published-member", {memberOnly: true}), event("published-public")];

  it("returns only published public Events to anonymous readers", async () => {
    expect((await listPublicEvents(anonymous, {status: "open", asOf, source: rows})).map((item) => item.slug)).toEqual(["published-public"]);
  });

  it("uses endsAt or startsAt inclusively for open and exact ordering", async () => {
    const rows = [
      event("past", {startsAt: new Date("2030-01-01T07:00:00.000Z"), endsAt: null}),
      event("ends-at-now", {endsAt: asOf}),
      event("later-z", {startsAt: new Date("2030-01-02T10:00:00.000Z"), endsAt: null}),
      event("later-a", {startsAt: new Date("2030-01-02T10:00:00.000Z"), endsAt: null}),
      event("member", {memberOnly: true, endsAt: new Date("2030-01-02T10:00:00.000Z")}),
      event("draft", {published: false, endsAt: new Date("2030-01-02T10:00:00.000Z")}),
    ];
    await expect(listPublicEvents(anonymous, {status: "open", asOf, source: rows})).resolves.toMatchObject([{slug: "ends-at-now"}, {slug: "later-a"}, {slug: "later-z"}]);
    await expect(listPublicEvents(anonymous, {status: "past", asOf, source: rows})).resolves.toMatchObject([{slug: "past"}]);
    await expect(listFeaturedPublicEvents(anonymous, {asOf, limit: 2}, rows)).resolves.toMatchObject([{slug: "ends-at-now"}, {slug: "later-a"}]);
  });

  it("never projects member-only Events or archived hero media", async () => {
    const source = [
      {event: event("member-only", {memberOnly: true}), hero: null},
      {event: event("archived-hero"), hero: {url: "/api/media/10000000-0000-4000-8000-000000000001", altEn: "English hero", altZh: "中文圖片", archivedAt: new Date("2030-01-01T00:00:00.000Z")}},
    ] as const;
    await expect(getPublicEventBySlug("member-only", "en", {asOf, source})).resolves.toBeNull();
    await expect(getPublicEventBySlug("archived-hero", "en", {asOf, source})).resolves.toMatchObject({hero: null});
  });

  it.each([0, 13, 1.5])("rejects invalid feature limit %s before reading", async (limit) => {
    const source = {list: vi.fn(async () => [event("never")])};
    await expect(listFeaturedPublicEvents(anonymous, {asOf, limit}, source)).rejects.toThrow();
    expect(source.list).not.toHaveBeenCalled();
  });

  it("returns public and member-only published Events to eligible members in deterministic order", async () => {
    const events = await listMemberEvents(member, [event("later", {memberOnly: true, startsAt: new Date("2099-10-01T10:00:00.000Z")}), ...rows], {hasEligibleMembership: async () => true});
    expect(events.map((item) => item.slug)).toEqual(["published-member", "published-public", "later"]);
  });

  it("rejects anonymous and inactive members before reading rows", async () => {
    await expect(listMemberEvents(anonymous, rows, {hasEligibleMembership: async () => true})).rejects.toThrow("FORBIDDEN");
    let read = false;
    await expect(listMemberEvents(member, {list: async () => { read = true; return rows; }}, {hasEligibleMembership: async () => false})).rejects.toThrow("MEMBERSHIP_INACTIVE");
    expect(read).toBe(false);
  });

  it("maps malformed public slugs to a safe not-found result", async () => {
    await expect(getEventBySlug(anonymous, "../private", rows)).resolves.toBeNull();
  });
});
