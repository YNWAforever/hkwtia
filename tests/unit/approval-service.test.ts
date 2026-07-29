import {describe, expect, it, vi} from "vitest";

import {
  decideApproval,
  listPendingApprovals,
  approvalDecisionSchema,
  reviewApprovalPayload,
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
      actionable: true,
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

  it("projects retention outreach into a safe staff preview without member or agent identifiers", async () => {
    const repo: ApprovalRepository = {
      listPending: async () => [{
        id: APPROVAL_ID,
        actionType: "agent.retention_outreach",
        payloadSummary: [
          {key: "profileId", value: "private@example.test"},
          {key: "to", value: "+852 9123 4567"},
          {key: "membershipId", value: "22222222-2222-4222-8222-222222222222"},
          {key: "locale", value: "zh-HK"},
          {key: "reasonCodes", value: "low_score_declining,inactive_before_renewal"},
          {key: "subject", value: "續期支援"},
          {key: "body", value: "我們想了解如何協助你續期。"},
          {key: "agentRunId", value: "33333333-3333-4333-8333-333333333333"},
        ],
        actionable: true,
        requestedAt: new Date("2026-07-20T01:00:00.000Z"),
      }],
      decide: async () => {
        throw new Error("not used");
      },
    };

    const [approval] = await listPendingApprovals(staff(), repo);

    expect(approval).toMatchObject({
      actionType: "agent.retention_outreach",
      payloadSummary: [],
      retentionPreview: {
        locale: "zh-HK",
        memberReference: expect.stringMatching(/^member-[0-9a-f]{12}$/),
        agentRunReference: "33333333-3333-4333-8333-333333333333",
        reasonCodes: ["low_score_declining", "inactive_before_renewal"],
        subject: "續期支援",
        body: "我們想了解如何協助你續期。",
      },
    });
    expect(JSON.stringify(approval)).not.toContain("private@example.test");
    expect(JSON.stringify(approval)).not.toContain("+852 9123 4567");
    expect(JSON.stringify(approval)).not.toContain("22222222-2222-4222-8222-222222222222");
    expect(approval.retentionPreview?.memberReference).not.toContain("private");
  });

  it("summarizes only allowlisted non-PII payload fields for known action types", () => {
    expect(summarizeApprovalPayload("campaign.send", {
      campaignId: "11111111-1111-4111-8111-111111111111",
      template: "renewal-reminder",
    })).toEqual([
      {key: "campaignId", value: "11111111-1111-4111-8111-111111111111"},
      {key: "template", value: "renewal-reminder"},
    ]);
    expect(summarizeApprovalPayload("unknown.action", {email: "private@example.test"})).toEqual([]);
  });

  it.each([null, "opaque", 42, ["campaign-1"]])("treats non-object payload %j as unavailable and non-actionable", (payload) => {
    expect(reviewApprovalPayload("campaign.send", payload)).toEqual({actionType: "campaign.send", payloadSummary: [], actionable: false});
  });

  it("rejects PII-like or semantically invalid values even under allowlisted field names", () => {
    expect(reviewApprovalPayload("campaign.send", {campaignId: "private@example.test", template: "renewal-reminder"}))
      .toEqual({actionType: "campaign.send", payloadSummary: [], actionable: false});
    expect(reviewApprovalPayload("event.publish", {eventId: "private@example.test", slug: "valid-slug"}))
      .toEqual({actionType: "event.publish", payloadSummary: [], actionable: false});
    expect(reviewApprovalPayload("campaign.send", {campaignId: "11111111-1111-4111-8111-111111111111", template: "private@example.test"}))
      .toEqual({actionType: "campaign.send", payloadSummary: [], actionable: false});
  });

  it.each(["private@example.test", "toString", "__proto__"])("never exposes or crashes on unknown raw action type %s", (actionType) => {
    expect(reviewApprovalPayload(actionType, {campaignId: "private@example.test"}))
      .toEqual({actionType: null, payloadSummary: [], actionable: false});
  });
});
