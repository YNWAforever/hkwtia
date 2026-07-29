import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

import {ApprovalList} from "@/components/admin/approval-list";

describe("approval list", () => {
  const labels = {
    caption: "Pending approvals", empty: "None", actionType: "Action", requestedAt: "Requested", summary: "Summary", actions: "Actions",
    approve: "Approve", reject: "Reject", deciding: "Saving", unavailable: "Not available",
    memberReference: "Member reference", locale: "Locale", agentRunReference: "Agent run",
    subject: "Subject", body: "Body", reasons: "Reasons",
    actionTypes: {"campaign.send": "Campaign delivery", "agent.retention_outreach": "Retention outreach"},
    summaryFields: {campaignId: "Campaign", template: "Template", eventId: "Event", slug: "Slug", membershipId: "Membership", field: "Field"},
    reasonCodes: {low_score_declining: "Low and declining score", inactive_before_renewal: "Inactive before renewal"},
  };

  it("renders only the sanitized summary and accessible decision controls", () => {
    const html = renderToStaticMarkup(<ApprovalList
      action={vi.fn()}
      approvals={[{id: "11111111-1111-4111-8111-111111111111", actionType: "campaign.send", requestedAt: new Date("2026-07-20T01:00:00.000Z"), payloadSummary: [{key: "campaignId", value: "campaign-1"}], actionable: true}]}
      labels={labels}
      locale="en"
    />);
    expect(html).toContain("Campaign delivery");
    expect(html).toContain("campaign-1");
    expect(html).toMatch(/name="decision"[^>]*value="approved"|value="approved"[^>]*name="decision"/);
    expect(html).toMatch(/name="decision"[^>]*value="rejected"|value="rejected"[^>]*name="decision"/);
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain("private@example.test");
  });

  it("renders an unavailable fallback and disables decisions for an unsupported opaque row", () => {
    const html = renderToStaticMarkup(<ApprovalList
      action={vi.fn()}
      approvals={[{id: "22222222-2222-4222-8222-222222222222", actionType: null, requestedAt: new Date("2026-07-20T01:00:00.000Z"), payloadSummary: [], actionable: false}]}
      labels={labels}
      locale="en"
    />);
    expect(html.match(/Not available/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).not.toContain("private@example.test");
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });

  it("renders a safe retention subject, body, and localized reason labels without contact details", () => {
    const html = renderToStaticMarkup(<ApprovalList
      action={vi.fn()}
      approvals={[{
        id: "33333333-3333-4333-8333-333333333333",
        actionType: "agent.retention_outreach",
        requestedAt: new Date("2026-07-20T01:00:00.000Z"),
        payloadSummary: [],
        retentionPreview: {
          locale: "en",
          memberReference: "member-b6132268f8a4",
          reasonCodes: ["low_score_declining", "inactive_before_renewal"],
          agentRunReference: "44444444-4444-4444-8444-444444444444",
          subject: "Can we help with renewal?",
          body: "We would like to support your renewal.",
        },
        actionable: true,
      }]}
      labels={labels}
      locale="en"
    />);

    expect(html).toContain("Retention outreach");
    expect(html).toContain("Can we help with renewal?");
    expect(html).toContain("We would like to support your renewal.");
    expect(html).toContain("Member reference");
    expect(html).toContain("member-b6132268f8a4");
    expect(html).toContain("Locale");
    expect(html).toContain(">en<");
    expect(html).toContain("Agent run");
    expect(html).toContain("44444444-4444-4444-8444-444444444444");
    expect(html).toContain("Low and declining score");
    expect(html).toContain("Inactive before renewal");
    expect(html).not.toContain("private@example.test");
    expect(html).not.toContain("+852 9123 4567");
    expect(html).not.toContain("profile-private");
    expect(html).toMatch(/name="decision"[^>]*value="approved"|value="approved"[^>]*name="decision"/);
    expect(html).toMatch(/name="decision"[^>]*value="rejected"|value="rejected"[^>]*name="decision"/);
  });
});
