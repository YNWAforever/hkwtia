import {describe, expect, it} from "vitest";

import type {EventRecord} from "@/content/schemas";
import type {Actor, MembershipRecord} from "@/lib/membership/lifecycle";
import {
  getDocuments,
  getMemberEvents,
  searchDirectory,
  type DirectoryRecord,
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
  seatLimit: 1,
};

function dependencies(overrides: Partial<PortalContentDependencies> = {}): PortalContentDependencies {
  return {
    memberships: {list: async () => [activeMembership]},
    directory: {list: async () => []},
    events: {list: async () => []},
    documents: {
      listApproved: async () => [],
      listReceipts: async () => [],
    },
    ...overrides,
  };
}

function directoryRow(
  userId: string,
  displayName: string,
  overrides: Partial<DirectoryRecord> & Partial<{active: boolean; profileDirectoryVisible: boolean; companyDirectoryVisible: boolean}> = {},
) {
  return {
    userId,
    displayName,
    jobTitle: "Member",
    locale: "en",
    companyId: null,
    companyDisplayName: null,
    industry: "Technology",
    sizeBand: "Startup",
    active: true,
    profileDirectoryVisible: true,
    companyDirectoryVisible: true,
    ...overrides,
  };
}

describe("member portal content scope", () => {
  it("filters inactive and non-opted-in directory records before returning public fields", async () => {
    const rows = [
      directoryRow("member-a", "Visible Member"),
      directoryRow("hidden-profile", "Hidden Profile", {profileDirectoryVisible: false}),
      directoryRow("hidden-company", "Hidden Company", {companyId: "company-hidden", companyDisplayName: "Private Co", companyDirectoryVisible: false}),
      directoryRow("revoked-member", "Revoked Member", {active: false}),
    ];

    const page = await searchDirectory(member, "", null, dependencies({directory: {list: async () => rows}}));

    expect(page.items).toEqual([expect.objectContaining({userId: "member-a", displayName: "Visible Member"})]);
    expect(page.items[0]).not.toHaveProperty("profileDirectoryVisible");
    expect(page.items[0]).not.toHaveProperty("phone");
  });

  it("uses an opaque cursor for deterministic server pagination", async () => {
    const rows = ["Ava", "Bea", "Cleo", "Dina"].map((name, index) => directoryRow(`member-${index}`, name));
    const deps = dependencies({directory: {list: async () => rows}});

    const first = await searchDirectory(member, {limit: 2}, null, deps);
    const second = await searchDirectory(member, {limit: 2}, first.nextCursor, deps);

    expect(first.items.map((item) => item.displayName)).toEqual(["Ava", "Bea"]);
    expect(second.items.map((item) => item.displayName)).toEqual(["Cleo", "Dina"]);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(second.nextCursor).toBeNull();
  });

  it("returns an honest empty document list when no approved resource or receipt exists", async () => {
    await expect(getDocuments(member, dependencies())).resolves.toEqual([]);
  });

  it("denies anonymous and cancelled actors before reading private portal content", async () => {
    const privateDeps = dependencies({
      memberships: {list: async () => [{...activeMembership, status: "cancelled" as const}]},
      directory: {list: async () => { throw new Error("PRIVATE_READ"); }},
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

    const records = await getMemberEvents(member, dependencies({events: {list: async () => [event]}}));

    expect(records).toEqual([event]);
    expect("namespace" in records[0]! ? records[0].namespace : null).toBe("events.memberMixer");
  });
});
