import {describe, expect, it, vi} from "vitest";

import type {Event} from "@/lib/db/server-schema";
import {countPublicEvents, getEventBySlug, getPublicEventBySlug, listFeaturedPublicEvents, listMemberEvents, listPublicEvents} from "@/lib/db/repos/events";
import type {Actor} from "@/lib/membership/lifecycle";
import {legacyDerivedEventColumns} from "@/tests/fixtures/event-row";

const anonymous: Actor = {kind: "anonymous", userId: null};
const member: Actor = {kind: "member", userId: "auth-member", profileId: "profile-member"};
const asOf = new Date("2030-01-01T10:00:00.000Z");

function event(slug: string, overrides: Partial<Event> = {}): Event {
  const row = {id: `${slug}-id`, slug, titleEn: `${slug} title`, titleZh: null, descriptionEn: `${slug} description`, descriptionZh: null, startsAt: new Date("2030-01-01T09:00:00.000Z"), endsAt: new Date("2030-01-01T12:00:00.000Z"), venue: "WTIA", capacity: null, memberOnly: false, published: true, heroMediaId: null, createdAt: new Date("2026-07-20T00:00:00.000Z"), updatedAt: new Date("2026-07-20T00:00:00.000Z"), ...overrides};
  return {...legacyDerivedEventColumns(row), ...row};
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

  it("counts past and open published public Events with no 12-item cap", async () => {
    const pastCount = 15;
    const manyPast = Array.from({length: pastCount}, (_unused, index) =>
      event(`past-${index}`, {startsAt: new Date("2030-01-01T07:00:00.000Z"), endsAt: null}));
    const openEvents = [event("open-a", {startsAt: new Date("2030-01-02T10:00:00.000Z"), endsAt: null})];
    const source = [...manyPast, ...openEvents];

    await expect(countPublicEvents(anonymous, {status: "past", asOf, source})).resolves.toBe(pastCount);
    await expect(countPublicEvents(anonymous, {status: "open", asOf, source})).resolves.toBe(openEvents.length);
  });

  it("reads public events by status and visibility, not the legacy booleans", async () => {
    const source = [
      event("enum-published", {published: false, memberOnly: false, status: "published", visibility: "public"}),
      event("bool-only", {published: true, memberOnly: false, status: "draft", visibility: "public"}),
      event("members", {published: true, memberOnly: false, status: "published", visibility: "members_only"}),
    ];
    const slugs = (await listPublicEvents(anonymous, {status: "open", asOf, locale: "en", source})).map((item) => item.slug);
    expect(slugs).toEqual(["enum-published"]);
    await expect(countPublicEvents(anonymous, {status: "open", asOf, source})).resolves.toBe(1);
    await expect(getPublicEventBySlug("bool-only", "en", {asOf, source})).resolves.toBeNull();
    await expect(getPublicEventBySlug("enum-published", "en", {asOf, source})).resolves.toMatchObject({slug: "enum-published"});
  });

  it("serves members every published event except invite-only, by enum", async () => {
    const source = [
      event("invite", {status: "published", visibility: "invite_only"}),
      event("members", {published: false, status: "published", visibility: "members_only"}),
      event("pending", {published: true, status: "pending_review", visibility: "public"}),
      event("public", {status: "published", visibility: "public"}),
    ];
    const listed = await listMemberEvents(member, source, {hasEligibleMembership: async () => true});
    expect(listed.map((item) => item.slug)).toEqual(["members", "public"]);
    await expect(getEventBySlug(member, "invite", source)).resolves.toBeNull();
    await expect(getEventBySlug(member, "members", source)).resolves.toMatchObject({slug: "members"});
    await expect(getEventBySlug(anonymous, "members", source)).resolves.toBeNull();
    await expect(getEventBySlug(anonymous, "pending", source)).resolves.toBeNull();
    await expect(getEventBySlug(anonymous, "public", source)).resolves.toMatchObject({slug: "public"});
  });

  it("projects format, registration mode, tags and the organiser name for the detail page (B-4)", async () => {
    const source = [
      {event: event("hosted", {format: "hybrid", onlineUrl: "https://meet.example.hk/hosted", registrationMode: "external", externalRegistrationUrl: "https://tickets.example.hk/hosted", tags: ["ai", "fintech"], organiserCompanyId: "company-1"}), hero: null, organiser: {name: "Acme Robotics"}},
      {event: event("admin-authored"), hero: null},
    ] as const;
    await expect(getPublicEventBySlug("hosted", "en", {asOf, source})).resolves.toMatchObject({
      format: "hybrid", onlineUrl: "https://meet.example.hk/hosted", registrationMode: "external", externalRegistrationUrl: "https://tickets.example.hk/hosted",
      tags: ["ai", "fintech"], organiser: {name: "Acme Robotics", slug: null},
    });
    await expect(getPublicEventBySlug("admin-authored", "en", {asOf, source})).resolves.toMatchObject({
      format: "in_person", onlineUrl: null, registrationMode: "rsvp", externalRegistrationUrl: null, tags: [], organiser: null,
    });
    // A bare Event row (no memory wrapper) projects the same defaults.
    await expect(listPublicEvents(anonymous, {status: "open", asOf, source: [event("bare")]})).resolves.toMatchObject([{slug: "bare", registrationMode: "rsvp", organiser: null}]);
  });

  it("applies format, month (Hong Kong), organiser slug and tag filters (B-6)", async () => {
    const readAsOf = new Date("2026-09-01T00:00:00.000Z");
    const source = [
      {event: event("online-oct", {startsAt: new Date("2026-10-05T02:00:00.000Z"), endsAt: null, format: "online", tags: ["ai"], organiserCompanyId: "company-1"}), hero: null, organiser: {name: "Acme Robotics"}},
      {event: event("in-person-nov", {startsAt: new Date("2026-11-05T02:00:00.000Z"), endsAt: null, format: "in_person", tags: ["health"]}), hero: null},
      // 2026-10-31T17:00Z is already 1 November in Hong Kong: the month filter must use the HK boundary.
      {event: event("hk-november", {startsAt: new Date("2026-10-31T17:00:00.000Z"), endsAt: null, format: "hybrid", tags: ["ai", "health"]}), hero: null},
    ] as const;
    const read = (filters: NonNullable<Parameters<typeof listPublicEvents>[1]["filters"]>) =>
      listPublicEvents(anonymous, {status: "open", asOf: readAsOf, locale: "en", filters, source}).then((rows) => rows.map((row) => row.slug));
    const none = {format: null, month: null, organiser: null, tag: null} as const;
    await expect(read(none)).resolves.toEqual(["online-oct", "hk-november", "in-person-nov"]);
    await expect(read({...none, format: "online"})).resolves.toEqual(["online-oct"]);
    await expect(read({...none, month: "2026-10"})).resolves.toEqual(["online-oct"]);
    await expect(read({...none, month: "2026-11"})).resolves.toEqual(["hk-november", "in-person-nov"]);
    await expect(read({...none, organiser: "acme-robotics"})).resolves.toEqual(["online-oct"]);
    await expect(read({...none, organiser: "someone-else"})).resolves.toEqual([]);
    await expect(read({...none, tag: "health"})).resolves.toEqual(["hk-november", "in-person-nov"]);
    await expect(read({...none, format: "hybrid", tag: "ai"})).resolves.toEqual(["hk-november"]);
    await expect(countPublicEvents(anonymous, {status: "open", asOf: readAsOf, filters: {...none, tag: "ai"}, source})).resolves.toBe(2);
  });

  it("excludes member-only and unpublished Events from the count", async () => {
    const source = [
      event("draft-public", {published: false, startsAt: new Date("2030-01-01T07:00:00.000Z"), endsAt: null}),
      event("published-member", {memberOnly: true, startsAt: new Date("2030-01-01T07:00:00.000Z"), endsAt: null}),
      event("published-public", {startsAt: new Date("2030-01-01T07:00:00.000Z"), endsAt: null}),
    ];
    await expect(countPublicEvents(anonymous, {status: "past", asOf, source})).resolves.toBe(1);
  });
});
