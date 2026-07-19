import {describe, expect, it} from "vitest";

import {searchAdminMembers, type AdminMemberReader} from "@/lib/admin/members";
import type {AdminActor, Actor} from "@/lib/membership/lifecycle";

const staffActor = (): AdminActor => ({kind: "staff", userId: "staff-1", profileId: "staff-1"});
const memberActor = (): Extract<Actor, {kind: "member"}> => ({kind: "member", userId: "member-1", profileId: "member-1"});

describe("admin member list", () => {
  it("searches names, emails, and companies with bounded pagination", async () => {
    const calls: unknown[] = [];
    const fakeRepo: AdminMemberReader = {
      search: async (_actor, query) => {
        calls.push(query);
        return {
          items: [{
            profileId: "member-acme",
            displayName: "Acme Member",
            email: "member@acme.example",
            companyName: "Acme Limited",
            planCode: "corporate",
            membershipStatus: "active",
            renewalAt: "2026-12-31T00:00:00.000Z",
            score: 42,
          }],
          nextCursor: null,
        };
      },
    };

    const page = await searchAdminMembers(staffActor(), {search: " acme ", limit: "20", cursor: null}, fakeRepo);

    expect(page.items.map((row) => row.profileId)).toEqual(["member-acme"]);
    expect(page.nextCursor).toBeNull();
    expect(calls).toEqual([{search: "acme", limit: 20, cursor: null}]);
  });

  it("denies a member before the repository can read staff-only data", async () => {
    const fakeRepo: AdminMemberReader = {
      search: async () => { throw new Error("PRIVATE_READ"); },
    };

    await expect(searchAdminMembers(memberActor(), {}, fakeRepo)).rejects.toThrow("FORBIDDEN");
  });
});
