import {describe, expect, it, vi} from "vitest";

import {listMemberViews, saveMemberView, type MemberViewSaveInput} from "@/lib/admin/member-views";
import type {AdminActor} from "@/lib/membership/lifecycle";

const staff = {kind: "staff", userId: "staff", profileId: "staff"} as const;
const admin = {kind: "superadmin", userId: "admin", profileId: "admin"} as const;
const member = {kind: "member", userId: "member", profileId: "member"} as const;
const query = {status: ["active"]};

describe("saved member views", () => {
  it("normalizes a personal view and binds it to the server actor", async () => {
    const store = {save: vi.fn(async (_actor: AdminActor, input: MemberViewSaveInput) => input), list: vi.fn(async () => [])};
    const saved = await saveMemberView(staff, {name: " Active members ", query}, store);
    expect(saved).toMatchObject({name: "Active members", shared: false, query: {status: ["active"]}});
    expect(store.save).toHaveBeenCalledWith(staff, expect.objectContaining({name: "Active members"}));
    expect(await listMemberViews(staff, store)).toEqual([]);
    expect(store.list).toHaveBeenCalledWith(staff);
  });

  it("blocks member access, client actors and shared publication by ordinary staff", async () => {
    const store = {save: vi.fn(async (_actor: AdminActor, input: MemberViewSaveInput) => input), list: vi.fn(async () => [])};
    await expect(saveMemberView(member, {name: "Active", query}, store)).rejects.toThrow("FORBIDDEN");
    await expect(saveMemberView(staff, {name: "Active", query, shared: true}, store)).rejects.toThrow("FORBIDDEN");
    await expect(saveMemberView(staff, {name: "Active", query, actor: "superadmin"}, store)).rejects.toThrow();
    expect(store.save).not.toHaveBeenCalled();
    await expect(saveMemberView(admin, {name: "Shared", query, shared: true}, store)).resolves.toMatchObject({shared: true});
  });
});
