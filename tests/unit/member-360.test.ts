import {describe, expect, it} from "vitest";

import {getMember360, type Member360Reader} from "@/lib/admin/member-360";
import type {AdminActor, Actor} from "@/lib/membership/lifecycle";

const staffActor = (): AdminActor => ({kind: "staff", userId: "staff-1", profileId: "staff-1"});
const memberActor = (): Extract<Actor, {kind: "member"}> => ({kind: "member", userId: "member-1", profileId: "member-1"});

function fakeReader(overrides: Partial<Awaited<ReturnType<Member360Reader["get360"]>>> = {}): Member360Reader {
  return {
    get360: async () => ({
      profile: {id: "member-1", displayName: "Member One", email: "member@example.test", phone: null, role: "member"},
      companies: [],
      membership: null,
      engagement: {score: null, trend: null, events: []},
      emails: [],
      events: [],
      notes: [],
      ...overrides,
    }),
  };
}

describe("Member 360 service", () => {
  it("returns explicit empty Member 360 sections", async () => {
    const view = await getMember360(staffActor(), "member-1", fakeReader({notes: [], emails: [], events: []}));

    expect(view).toMatchObject({profile: {id: "member-1"}, notes: [], emails: [], events: []});
  });

  it("denies a member before the staff reader can access another profile", async () => {
    const reader: Member360Reader = {get360: async () => { throw new Error("PRIVATE_READ"); }};

    await expect(getMember360(memberActor(), "member-1", reader)).rejects.toThrow("FORBIDDEN");
  });

  it("rejects an empty profile identifier before reader access", async () => {
    const reader: Member360Reader = {get360: async () => { throw new Error("PRIVATE_READ"); }};

    await expect(getMember360(staffActor(), "", reader)).rejects.toThrow();
  });
});
