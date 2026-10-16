import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";

import {Member360View} from "@/components/admin/member-360";
import type {Member360} from "@/lib/admin/member-360";
import en from "@/messages/en.json";

const view: Member360 = {
  profile: {id: "member", displayName: "Ada Wong", email: "ada@example.test", phone: null, role: "member"},
  companies: [], membership: null, memberships: [], engagement: {score: 9, trend: 0, events: []},
  emails: [], events: [], purchases: [], journeys: [], whatsapp: [], suppressions: [],
  notes: [{id: "note-1", authorProfileId: "staff", authorName: "Staff", body: "Follow up", replacesNoteId: null, createdAt: "2026-09-27T00:00:00Z"}],
};
const labels = {...en.Admin.member360, planCodes: en.Admin.members.planCodes, membershipStatuses: en.Admin.members.statusCodes} as never;

describe("Member 360 history display", () => {
  it("keeps unopened timelines off the summary and shows only the selected history", () => {
    const summary = renderToStaticMarkup(<Member360View view={view} locale="en" labels={labels} stripeCustomerHref={null} stripeSubscriptionHref={null} activeHistory={null}/>);
    expect(summary).toContain("Ada Wong");
    expect(summary).not.toContain('id="member-notes-heading"');
    expect(summary).not.toContain('id="member-emails-heading"');
    const notes = renderToStaticMarkup(<Member360View view={view} locale="en" labels={labels} stripeCustomerHref={null} stripeSubscriptionHref={null} activeHistory="notes"/>);
    expect(notes).toContain('id="member-notes-heading"');
    expect(notes).toContain("Follow up");
    expect(notes).not.toContain('id="member-emails-heading"');
  });
});
