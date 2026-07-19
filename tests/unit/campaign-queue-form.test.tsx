import {fireEvent, render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {SegmentResults, type SegmentResultsLabels} from "@/components/admin/segment-results";

const labels: SegmentResultsLabels = {
  caption: "Members", total: "Total", empty: "Empty", name: "Name", email: "Email", company: "Company", plan: "Plan", status: "Status", renewal: "Renewal", score: "Score", unavailable: "Unavailable", saved: "Saved", export: "Export", queue: "Queue", template: "Template", templateRenewal: "Renewal reminder", templateUpdate: "Member update", queued: "Queued", existing: "Existing", recipients: "recipients", newDraft: "New draft", error: "Localized queue error",
};

describe("campaign queue form", () => {
  it("submits without an idempotency field and renders the translated safe error", async () => {
    const {container} = render(<SegmentResults
      labels={labels}
      newDraftHref="/en/admin/segments?campaignDraft=22222222-2222-4222-8222-222222222222"
      preview={{total: 0, items: [], nextCursor: null}}
      queueAction={async () => ({disposition: null, recipientCount: 0, error: "generic"})}
      saved={[{id: "11111111-1111-4111-8111-111111111111", ownerProfileId: "staff-1", nameEn: "At risk", nameZh: null, filterVersion: 1, filters: {tier: [], status: [], scoreMin: null, scoreMax: null, renewalWithinDays: null, sector: "", lastLoginBeforeDays: null}, createdAt: "2026-07-19T00:00:00.000Z", updatedAt: "2026-07-19T00:00:00.000Z"}]}
    />);

    expect(container.querySelector('input[name="idempotencyKey"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", {name: labels.queue}));
    expect(await screen.findByText(labels.error)).toBeInTheDocument();
  });
});
