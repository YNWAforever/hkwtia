import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

import {ApprovalList} from "@/components/admin/approval-list";

describe("approval list", () => {
  it("renders only the sanitized summary and accessible decision controls", () => {
    const html = renderToStaticMarkup(<ApprovalList
      action={vi.fn()}
      approvals={[{id: "11111111-1111-4111-8111-111111111111", actionType: "campaign.send", requestedAt: new Date("2026-07-20T01:00:00.000Z"), payloadSummary: [{key: "campaignId", value: "campaign-1"}], actionable: true}]}
      labels={{caption: "Pending approvals", empty: "None", actionType: "Action", requestedAt: "Requested", summary: "Summary", actions: "Actions", approve: "Approve", reject: "Reject", deciding: "Saving", unavailable: "Not available", actionTypes: {"campaign.send": "Campaign delivery"}, summaryFields: {campaignId: "Campaign", template: "Template", eventId: "Event", slug: "Slug", membershipId: "Membership", field: "Field"}}}
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
      labels={{caption: "Pending approvals", empty: "None", actionType: "Action", requestedAt: "Requested", summary: "Summary", actions: "Actions", approve: "Approve", reject: "Reject", deciding: "Saving", unavailable: "Not available", actionTypes: {"campaign.send": "Campaign delivery"}, summaryFields: {campaignId: "Campaign", template: "Template", eventId: "Event", slug: "Slug", membershipId: "Membership", field: "Field"}}}
      locale="en"
    />);
    expect(html.match(/Not available/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).not.toContain("private@example.test");
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });
});
