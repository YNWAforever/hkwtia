import {describe, expect, it, vi} from "vitest";

import {runApprovalDecisionAction} from "@/lib/admin/approval-action-core";

const form = (approvalId: string, decision: string) => {
  const data = new FormData();
  data.set("approvalId", approvalId);
  data.set("decision", decision);
  return data;
};
const messages = {
  success: "Decision saved.", validation: "Invalid decision.", alreadyDecided: "Already decided.",
  notFound: "Approval unavailable.", error: "Unable to save.",
};

describe("safe approval action state", () => {
  it("returns a localized success without exposing repository data", async () => {
    const mutate = vi.fn(async () => ({id: "private-id", status: "approved"}));
    await expect(runApprovalDecisionAction({}, form("11111111-1111-4111-8111-111111111111", "approved"), {messages, mutate}))
      .resolves.toEqual({status: "success", message: "Decision saved."});
  });

  it.each([
    ["APPROVAL_ALREADY_DECIDED", "Already decided."],
    ["APPROVAL_NOT_FOUND", "Approval unavailable."],
    ["APPROVAL_UNSUPPORTED", "Approval unavailable."],
    ["database payload private@example.test", "Unable to save."],
  ])("maps %s to a safe localized error", async (failure, expected) => {
    const mutate = async () => { throw new Error(failure); };
    await expect(runApprovalDecisionAction({}, form("11111111-1111-4111-8111-111111111111", "rejected"), {messages, mutate}))
      .resolves.toEqual({status: "error", message: expected});
  });

  it("rejects malformed form data before mutation", async () => {
    const mutate = vi.fn();
    await expect(runApprovalDecisionAction({}, form("bad", "execute"), {messages, mutate}))
      .resolves.toEqual({status: "error", message: "Invalid decision."});
    expect(mutate).not.toHaveBeenCalled();
  });
});
