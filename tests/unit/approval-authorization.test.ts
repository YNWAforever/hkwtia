import {describe, expect, it, vi} from "vitest";

import {decideApproval, listPendingApprovals, type ApprovalRepository} from "@/lib/admin/approvals";
import {createApprovalsRepository} from "@/lib/db/repos/approvals";
import type {Actor} from "@/lib/membership/lifecycle";

const APPROVAL_ID = "11111111-1111-4111-8111-111111111111";
const deniedActors: readonly Actor[] = [
  {kind: "anonymous", userId: null},
  {kind: "member", userId: "auth-member", profileId: "profile-member"},
];

describe("approval authorization", () => {
  it.each(deniedActors)("denies $kind actors in the service boundary", async (actor) => {
    const repository: ApprovalRepository = {listPending: vi.fn(), decide: vi.fn()};
    await expect(listPendingApprovals(actor, repository)).rejects.toThrow("FORBIDDEN");
    await expect(decideApproval(actor, {approvalId: APPROVAL_ID, decision: "approved"}, repository)).rejects.toThrow("FORBIDDEN");
    expect(repository.listPending).not.toHaveBeenCalled();
    expect(repository.decide).not.toHaveBeenCalled();
  });

  it.each(deniedActors)("denies $kind actors in every direct repository entry before database access", async (actor) => {
    const loadDatabase = vi.fn();
    const repository = createApprovalsRepository(loadDatabase);
    await expect(repository.listPending(actor)).rejects.toThrow("FORBIDDEN");
    await expect(repository.decide(actor, {approvalId: APPROVAL_ID, decision: "rejected"})).rejects.toThrow("FORBIDDEN");
    expect(loadDatabase).not.toHaveBeenCalled();
  });
});
