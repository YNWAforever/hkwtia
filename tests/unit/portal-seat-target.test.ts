import {describe, expect, it, vi} from "vitest";
import {requireCompanySeatTarget} from "@/lib/portal/seat-target";

const actor = {kind: "member", userId: "auth", profileId: "profile"} as const;
describe("seat mutations bind their row to the submitted company", () => {
  it("rejects a missing company before reading private rows", async () => {
    const read = vi.fn();
    await expect(requireCompanySeatTarget(actor, "", {kind: "member", id: "m1"}, read)).rejects.toThrow("FORBIDDEN");
    expect(read).not.toHaveBeenCalled();
  });
  it("rejects a different company's row even if the actor manages both companies", async () => {
    const read = vi.fn(async () => ({canManage: true, members: [{id: "other"}], invitations: []}));
    await expect(requireCompanySeatTarget(actor, "company-a", {kind: "member", id: "company-b-member"}, read)).rejects.toThrow("FORBIDDEN");
    expect(read).toHaveBeenCalledWith(actor, "company-a");
  });
  it("rechecks management access and preserves the original repository write guard", async () => {
    const rows = {members: [{id: "m1"}], invitations: [{id: "i1"}]};
    await expect(requireCompanySeatTarget(actor, "company-a", {kind: "member", id: "m1"}, async () => ({...rows, canManage: false}))).rejects.toThrow("FORBIDDEN");
    await expect(requireCompanySeatTarget(actor, "company-a", {kind: "invitation", id: "i1"}, async () => ({...rows, canManage: true}))).resolves.toBeUndefined();
  });
});
