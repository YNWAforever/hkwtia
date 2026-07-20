import {describe, expect, it, vi} from "vitest";

import {
  decideApproval,
  listPendingApprovals,
  approvalDecisionSchema,
  summarizeApprovalPayload,
  type ApprovalRepository,
} from "@/lib/admin/approvals";
import type {AdminActor} from "@/lib/membership/lifecycle";

const APPROVAL_ID = "11111111-1111-4111-8111-111111111111";
const staff = (): AdminActor => ({kind: "staff", userId: "auth-staff", profileId: "profile-staff"});

function repository(): ApprovalRepository & {audits: string[]} {
  let status: "pending" | "approved" | "rejected" = "pending";
  const audits: string[] = [];
  return {
    audits,
    listPending: async () => [{
      id: APPROVAL_ID,
      actionType: "campaign.send",
      payloadSummary: [{key: "campaignId", value: "campaign-1"}],
      requestedAt: new Date("2026-07-20T01:00:00.000Z"),
    }],
    decide: async (_actor, input) => {
      const parsed = approvalDecisionSchema.parse(input);
      if (parsed.approvalId !== APPROVAL_ID) throw new Error("APPROVAL_NOT_FOUND");
      if (status !== "pending") throw new Error("APPROVAL_ALREADY_DECIDED");
      status = parsed.decision;
      audits.push(`approval.${parsed.decision}`);
      return {id: APPROVAL_ID, status, decidedAt: new Date("2026-07-20T02:00:00.000Z")};
    },
  };
}

describe("approval service", () => {
  it("allows exactly one decision from pending and records one matching audit", async () => {
    const repo = repository();

    await expect(decideApproval(staff(), {approvalId: APPROVAL_ID, decision: "approved"}, repo))
      .resolves.toMatchObject({status: "approved"});
    await expect(decideApproval(staff(), {approvalId: APPROVAL_ID, decision: "rejected"}, repo))
      .rejects.toThrow("APPROVAL_ALREADY_DECIDED");
    expect(repo.audits).toEqual(["approval.approved"]);
  });

  it("validates decision input before calling the repository", async () => {
    const repo = repository();
    const decide = vi.spyOn(repo, "decide");

    await expect(decideApproval(staff(), {approvalId: "not-an-id", decision: "approved"}, repo)).rejects.toThrow();
    await expect(decideApproval(staff(), {approvalId: APPROVAL_ID, decision: "expired"}, repo)).rejects.toThrow();
    expect(decide).not.toHaveBeenCalled();
  });

  it("lists pending approvals through the actor-first boundary", async () => {
    const repo = repository();
    await expect(listPendingApprovals(staff(), repo)).resolves.toHaveLength(1);
  });

  it("summarizes only allowlisted non-PII payload fields for known action types", () => {
    expect(summarizeApprovalPayload("campaign.send", {
      campaignId: "campaign-1",
      template: "renewal-reminder",
      email: "private@example.test",
      body: "private message",
      recipientVariables: {name: "Private"},
    })).toEqual([
      {key: "campaignId", value: "campaign-1"},
      {key: "template", value: "renewal-reminder"},
    ]);
    expect(summarizeApprovalPayload("unknown.action", {email: "private@example.test"})).toEqual([]);
  });
});
