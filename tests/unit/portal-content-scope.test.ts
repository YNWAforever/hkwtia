import {describe, expect, it, vi} from "vitest";

import type {EventRecord} from "@/content/schemas";
import type {Actor, MembershipRecord} from "@/lib/membership/lifecycle";
import {
  getDocuments,
  getMemberEvents,
  searchDirectory,
  type PortalContentDependencies,
} from "@/lib/portal/content";

const member: Extract<Actor, {kind: "member"}> = {kind: "member", userId: "member-a", profileId: "member-a"};
const anonymous: Extract<Actor, {kind: "anonymous"}> = {kind: "anonymous", userId: null};

const activeMembership: MembershipRecord = {
  id: "membership-a",
  ownerUserId: "member-a",
  companyId: null,
  planCode: "community",
  status: "active",
  billingInterval: "none",
  seatLimit: 1,
};

function dependencies(overrides: Partial<PortalContentDependencies> = {}): PortalContentDependencies {
  return {
    memberships: {list: async () => [activeMembership]},
    directory: {page: async () => ({items: [], nextCursor: null})},
    events: {page: async () => ({items: [], nextCursor: null})},
    documents: {
      listApproved: async () => [],
      listReceipts: async () => [],
    },
    ...overrides,
  };
}

describe("member portal content scope", () => {
  it("delegates the actor, search and cursor to the bounded repository without reading an all-rows adapter", async () => {
    const page = vi.fn(async () => ({items: [], nextCursor: "next", cursorReset: true}));
    const query = {search: "Member", limit: 20};
    await expect(searchDirectory(member, query, "old-cursor", dependencies({directory: {page}})))
      .resolves.toEqual({items: [], nextCursor: "next", cursorReset: true});
    expect(page).toHaveBeenCalledExactlyOnceWith(member, query, "old-cursor");
  });

  it("returns an honest empty document list when no approved resource or receipt exists", async () => {
    await expect(getDocuments(member, dependencies())).resolves.toEqual([]);
  });

  it("denies anonymous and cancelled actors before reading private portal content", async () => {
    const privateDeps = dependencies({
      memberships: {list: async () => [{...activeMembership, status: "cancelled" as const}]},
      directory: {page: async () => { throw new Error("PRIVATE_READ"); }},
    });

    await expect(searchDirectory(anonymous, "", null, privateDeps)).rejects.toThrow("FORBIDDEN");
    await expect(searchDirectory(member, "", null, privateDeps)).rejects.toThrow("MEMBERSHIP_INACTIVE");
  });

  it("preserves typed event namespaces used for EN and zh-HK translations", async () => {
    const event: EventRecord = {
      slug: "member-mixer",
      startsAt: "2099-09-01T10:00:00.000Z",
      endsAt: "2099-09-01T12:00:00.000Z",
      venue: "WTIA",
      image: "/images/events/member-mixer.jpg",
      namespace: "events.memberMixer",
    };

    const records = await getMemberEvents(member, dependencies({events: {page: async () => ({items: [event], nextCursor: null})}}));

    expect(records).toEqual([event]);
    expect("namespace" in records[0]! ? records[0].namespace : null).toBe("events.memberMixer");
  });
});
