import {describe, expect, it} from "vitest";

import type {Event} from "@/lib/db/server-schema";
import {listMemberEvents, listPublicEvents} from "@/lib/db/repos/events";
import type {Actor} from "@/lib/membership/lifecycle";

const anonymous: Actor = {kind: "anonymous", userId: null};
const member: Actor = {kind: "member", userId: "auth-member", profileId: "profile-member"};

function event(slug: string, overrides: Partial<Event> = {}): Event {
  return {
    id: `${slug}-id`,
    slug,
    titleEn: `${slug} title`,
    titleZh: null,
    descriptionEn: `${slug} description`,
    descriptionZh: null,
    startsAt: new Date("2099-09-01T10:00:00.000Z"),
    endsAt: new Date("2099-09-01T12:00:00.000Z"),
    venue: "WTIA",
    capacity: null,
    memberOnly: false,
    published: true,
    createdAt: new Date("2026-07-20T00:00:00.000Z"),
    updatedAt: new Date("2026-07-20T00:00:00.000Z"),
    ...overrides,
  };
}

describe("repository-backed event visibility", () => {
  const rows = [
    event("draft-public", {published: false}),
    event("published-member", {memberOnly: true}),
    event("published-public"),
  ];

  it("returns only published public events to anonymous readers", async () => {
    const events = await listPublicEvents(anonymous, rows);
    expect(events.map((item) => item.slug)).toEqual(["published-public"]);
  });

  it("returns public and member-only published events to members in deterministic order", async () => {
    const events = await listMemberEvents(member, [
      event("later", {memberOnly: true, startsAt: new Date("2099-10-01T10:00:00.000Z")}),
      ...rows,
    ]);
    expect(events.map((item) => item.slug)).toEqual(["published-member", "published-public", "later"]);
  });

  it("rejects anonymous access to the member reader before returning rows", async () => {
    await expect(listMemberEvents(anonymous, rows)).rejects.toThrow("FORBIDDEN");
  });
});
