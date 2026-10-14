import {describe, expect, it, vi} from "vitest";
import {runSeatMutation} from "@/lib/portal/seat-mutation-core";
const companyId = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const actor = {kind: "member", userId: "auth", profileId: "profile"} as const;
function dependencies() {
  return {requireTarget: vi.fn(async () => undefined), invite: vi.fn(async () => ({id, invitedEmail: "member@example.test", token: "private-capability"})),
    deliver: vi.fn(async () => undefined), revoke: vi.fn(async () => undefined), revokeInvitation: vi.fn(async () => undefined), changeRole: vi.fn(async () => undefined)};
}
describe("member seat mutation outcomes", () => {
  it("keeps a created invitation when delivery is uncertain and does not resend an existing invitation", async () => {
    const deps = dependencies();
    deps.deliver.mockRejectedValueOnce(new Error("provider secret"));
    expect(await runSeatMutation(actor, {kind: "invite", companyId, email: "member@example.test", role: "member", locale: "en"}, deps)).toEqual({status: "error", code: "deliveryUncertain"});
    expect(deps.revokeInvitation).not.toHaveBeenCalled();
    deps.invite.mockResolvedValueOnce({id, invitedEmail: "member@example.test", token: ""});
    expect(await runSeatMutation(actor, {kind: "invite", companyId, email: "member@example.test", role: "member", locale: "en"}, deps)).toEqual({status: "error", code: "alreadyPending"});
    expect(deps.deliver).toHaveBeenCalledTimes(1);
  });
  it.each(["revoke", "changeRole", "revokeInvitation"] as const)("rechecks company and row before %s", async (kind) => {
    const deps = dependencies();
    deps.requireTarget.mockRejectedValueOnce(new Error("FORBIDDEN"));
    expect(await runSeatMutation(actor, {kind, companyId, targetId: id, role: "admin"}, deps)).toEqual({status: "error", code: "forbidden"});
    expect(deps.revoke).not.toHaveBeenCalled(); expect(deps.changeRole).not.toHaveBeenCalled(); expect(deps.revokeInvitation).not.toHaveBeenCalled();
  });
  it("maps last-owner policy and malformed input without raw errors", async () => {
    const deps = dependencies(); deps.revoke.mockRejectedValueOnce(new Error("LAST_OWNER_PROTECTION"));
    expect(await runSeatMutation(actor, {kind: "revoke", companyId, targetId: id}, deps)).toEqual({status: "error", code: "lastOwner"});
    expect(await runSeatMutation(actor, {kind: "invite", companyId, email: "wrong", locale: "en", role: "member"}, deps)).toEqual({status: "error", code: "invalidInput"});
    expect(deps.invite).not.toHaveBeenCalled();
  });
  it("reports success only after the mutation settles and resolves actors before adapter work", async () => {
    const deps = dependencies();
    expect(await runSeatMutation(actor, {kind: "changeRole", companyId, targetId: id, role: "admin"}, deps)).toEqual({status: "success"});
    expect(deps.changeRole).toHaveBeenCalledWith(actor, id, "admin");
    await expect(runSeatMutation({kind: "anonymous", userId: null}, {}, deps)).rejects.toThrow("FORBIDDEN");
  });
});
