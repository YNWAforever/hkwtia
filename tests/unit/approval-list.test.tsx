import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

import {ApprovalList} from "@/components/admin/approval-list";

describe("approval list", () => {
  it("renders only the sanitized summary and accessible decision controls", () => {
    const html = renderToStaticMarkup(<ApprovalList
      action={vi.fn()}
      approvals={[{id: "11111111-1111-4111-8111-111111111111", actionType: "campaign.send", requestedAt: new Date("2026-07-20T01:00:00.000Z"), payloadSummary: [{key: "campaignId", value: "campaign-1"}]}]}
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
});
