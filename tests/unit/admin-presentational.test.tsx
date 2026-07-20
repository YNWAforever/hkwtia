import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";

import {AdminNav} from "@/components/admin/admin-nav";
import {AtRiskTable} from "@/components/admin/at-risk-table";
import {MemberTable} from "@/components/admin/member-table";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

describe("admin presentation", () => {
  it.each([
    {locale: "en" as const, corporate: "Corporate", pastDue: "Past due", expectedDate: "Aug 1, 2026"},
    {locale: "zh-HK" as const, corporate: "\u4f01\u696d", pastDue: "\u903e\u671f", expectedDate: "2026\u5e748\u67081\u65e5"},
  ])("localizes at-risk evidence, tier, status, date, and actions for $locale", ({locale, corporate, pastDue, expectedDate}) => {
    const labels = {caption: "At-risk members", empty: "No at-risk members.", name: "Name", company: "Company", tier: "Tier", status: "Status", score: "Score", trend: "Trend", renewal: "Renewal", evidence: "Evidence", actions: "Actions", unavailable: "Unavailable", scoreEvidence: "Score below {score}", renewalEvidence: "Renewal within {days} days", member360: "Member 360", addNote: "Add note", campaign: "Queue campaign", plans: {community: "Community", startup: "Startup", corporate, patron: "Patron"}, statuses: {active: "Active", past_due: pastDue}};
    const html = renderToStaticMarkup(<AtRiskTable locale={locale} labels={labels} members={[{profileId: "risk-1", displayName: "Risk One", companyName: "Acme", planCode: "corporate", status: "past_due", score: 19, trend: -3, renewalAt: new Date("2026-08-01T00:00:00.000Z"), evidence: {scoreBelow: 20, renewalWithinDays: 60, status: "past_due"}}]}/>);
    expect(html).toContain("Score below 20");
    expect(html).toContain("Renewal within 60 days");
    expect(html).toContain(corporate);
    expect(html).toContain(pastDue);
    expect(html).toContain(expectedDate);
    expect(html).not.toContain(">corporate<");
    expect(html).not.toContain(">past_due<");
    expect(html).not.toContain("2026-08-01T00:00:00.000Z");
    expect(html).toContain("/admin/members/risk-1#member-note-body");
    expect(html).toContain("Queue campaign");
    expect(html).toContain("/admin/segments?profileId=risk-1");
    expect(html).toContain("status=past_due");
    expect(html).toContain("scoreMax=19");
    expect(html).toContain("renewalWithinDays=60");
  });

  it.each([en.Admin, zh.Admin])("renders one page heading, an accessible nav, a table caption, and translated empty state", (labels) => {
    const nav = renderToStaticMarkup(<AdminNav locale="en" labels={{...labels.navigation, brand: labels.brand}}/>);
    const table = renderToStaticMarkup(<MemberTable labels={labels.members} page={{items: [], nextCursor: null}} query="" locale="en"/>);
    const page = renderToStaticMarkup(<main><h1>{labels.members.title}</h1>{table}</main>);

    expect(page.match(/<h1/g)).toHaveLength(1);
    expect(nav).toContain(`aria-label="${labels.navigation.label}"`);
    expect(table).toMatch(new RegExp(`<caption[^>]*>${labels.members.caption}</caption>`));
    expect(table).toContain(labels.members.empty);
  });
  it.each([en.Admin, zh.Admin])("uses localized brand copy and preserves the query in next-page links without a false previous link", (labels) => {
    const nav = renderToStaticMarkup(<AdminNav locale="en" labels={{...labels.navigation, brand: labels.brand}}/>);
    const table = renderToStaticMarkup(<MemberTable labels={labels.members} page={{items: [], nextCursor: "opaque-cursor"}} query="acme" locale="en"/>);

    expect(nav).toContain(labels.brand);
    expect(table).toContain("?q=acme&amp;cursor=opaque-cursor");
    expect(table).not.toContain(labels.members.previous);
  });
});
