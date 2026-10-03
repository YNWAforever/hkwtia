import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";

import {Member360View} from "@/components/admin/member-360";
import type {Member360} from "@/lib/admin/member-360";
import en from "@/messages/en.json";

const view = {
  profile: {id: "member-a", displayName: "Ada Wong", email: "ada@example.test", phone: null, role: "member"},
  companies: [{id: "company-a", name: "Company A", role: "owner"}, {id: "company-b", name: "Company B", role: "admin"}],
  membership: {id: "membership-active", companyId: "company-a", planCode: "startup", status: "active", renewalAt: "2027-01-01T00:00:00.000Z", stripeCustomerId: null, stripeSubscriptionId: null},
  memberships: [
    {id: "membership-active", companyId: "company-a", planCode: "startup", status: "active", renewalAt: "2027-01-01T00:00:00.000Z", stripeCustomerId: null, stripeSubscriptionId: null},
    {id: "membership-expired", companyId: "company-b", planCode: "corporate", status: "expired", renewalAt: "2035-01-01T00:00:00.000Z", stripeCustomerId: null, stripeSubscriptionId: null},
  ],
  engagement: {score: 9, trend: 0, events: []}, emails: [], events: [], notes: [], journeys: [], whatsapp: [], suppressions: [],
  purchases: [{id: "order-a", eventId: "event-a", titleEn: "AI Forum", titleZh: "AI 論壇", status: "refunded", amountHkdCents: 25000, paidAt: "2026-08-01T00:00:00.000Z", refundedAt: "2026-08-02T00:00:00.000Z", refundReason: "cancelled", createdAt: "2026-08-01T00:00:00.000Z", seats: [{id: "seat-a", attendeeName: "Guest One", checkedInAt: null}]}],
} satisfies Member360;

describe("Member 360 display", () => {
  it("shows all associated memberships and distinguishes the ticket buyer from attendees", () => {
    const markup = renderToStaticMarkup(<Member360View view={view} locale="en" labels={{...en.Admin.member360, planCodes: en.Admin.members.planCodes, membershipStatuses: en.Admin.members.statusCodes} as never} stripeCustomerHref={null} stripeSubscriptionHref={null}/>);
    expect(markup).toContain("membership-active");
    expect(markup).toContain("membership-expired");
    expect(markup).toContain("Company A");
    expect(markup).toContain("Company B");
    expect(markup).toContain("AI Forum");
    expect(markup).toContain("Guest One");
    expect(markup).toContain("Refunded");
  });
});

it("renders the actual Chinese ticket title from the Member360 fixture", () => {
  const markup = renderToStaticMarkup(<Member360View view={view} locale="zh-HK" labels={{...en.Admin.member360, planCodes: en.Admin.members.planCodes, membershipStatuses: en.Admin.members.statusCodes} as never} stripeCustomerHref={null} stripeSubscriptionHref={null}/>);
  expect(markup).toContain("AI \u8ad6\u58c7");
});
