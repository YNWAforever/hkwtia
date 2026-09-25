import {renderToStaticMarkup} from "react-dom/server";
import {expect, it} from "vitest";

import {EventReviewTable, type EventReviewLabels, type ReviewRow} from "@/components/admin/event-review-table";

const labels: EventReviewLabels = {
  caption: "Review events", event: "Event", organiser: "Organiser", starts: "Starts",
  submitted: "Submitted", format: "Format", visibility: "Visibility",
  approve: "Approve", reject: "Reject", rejectionReason: "Reason", empty: "No events",
};
const row: ReviewRow = {
  id: "22222222-2222-4222-8222-222222222222", reviewVersion: "42",
  slug: "review-race", titleEn: "Review race", titleZh: null,
  startsAt: new Date("2030-03-01T02:00:00Z"), organiser: "Acme",
  submittedAt: new Date("2026-09-25T00:00:00Z"), format: "in_person", visibility: "public",
};

it("carries the queued event version in both staff decision forms", () => {
  const html = renderToStaticMarkup(<EventReviewTable
    rows={[row]} labels={labels} locale="en" approveAction={() => {}} rejectAction={() => {}}/>);
  expect(html.match(/name="reviewVersion" value="42"/g)).toHaveLength(2);
});
