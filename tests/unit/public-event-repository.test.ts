import {describe, expect, it, vi} from "vitest";

import type {Event} from "@/lib/db/server-schema";
import {getEventBySlug, listFeaturedPublicEvents, listMemberEvents, listPublicEvents} from "@/lib/db/repos/events";
import type {Actor} from "@/lib/membership/lifecycle";

const anonymous: Actor = {kind: "anonymous", userId: null};
const member: Actor = {kind: "member", userId: "auth-member", profileId: "profile-member"};

function event(slug: string, overrides: Partial<Event> = {}): Event {
  return {id: `${slug}-id`, slug, titleEn: `${slug} title`, titleZh: null, descriptionEn: `${slug} description`, descriptionZh: null,
    startsAt: new Date("2099-09-01T10:00:00.000Z"), endsAt: new Date("2099-09-01T12:00:00.000Z"), venue: "WTIA",
    capacity: null, memberOnly: false, published: true, heroMediaId: null, createdAt: new Date("2026-07-20T00:00:00.000Z"), updatedAt: new Date("2026-07-20T00:00:00.000Z"), ...overrides};
}

describe("repository-backed event visibility", () => {
  const rows = [event("draft-public", {published: false}), event("published-member", {memberOnly: true}), event("published-public")];

  it("returns only published public events to anonymous readers", async () => {
    expect((await listPublicEvents(anonymous, rows)).map((item) => item.slug)).toEqual(["published-public"]);
  });

  it("bounds the earliest upcoming public events with an inclusive cutoff and slug tie-break", async () => {
    const asOf = new Date("2026-08-28T00:00:00.000Z");
    const rows = [
      event("past", {startsAt: new Date("2026-08-27T23:59:59.000Z")}),
      event("same-z", {startsAt: new Date("2026-09-01T10:00:00.000Z")}),
      event("same-a", {startsAt: new Date("2026-09-01T10:00:00.000Z")}),
      event("equal", {startsAt: asOf}),
      event("member", {memberOnly: true, startsAt: new Date("2026-08-29T00:00:00.000Z")}),
      event("draft", {published: false, startsAt: new Date("2026-08-29T00:00:00.000Z")}),
    ];

    await expect(
      listFeaturedPublicEvents(anonymous, {asOf, limit: 1}, rows),
    ).resolves.toMatchObject([{slug: "equal"}]);
    await expect(
      listFeaturedPublicEvents(anonymous, {asOf, limit: 3}, rows),
    ).resolves.toMatchObject([{slug: "equal"}, {slug: "same-a"}, {slug: "same-z"}]);
  });

  it.each([0, 13, 1.5])("rejects invalid feature limit %s before reading", async (limit) => {
    const source = {list: vi.fn(async () => [event("never")])};
    await expect(
      listFeaturedPublicEvents(anonymous, {asOf: new Date(), limit}, source),
    ).rejects.toThrow();
    expect(source.list).not.toHaveBeenCalled();
  });

  it("returns public and member-only published events to eligible members in deterministic order", async () => {
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
