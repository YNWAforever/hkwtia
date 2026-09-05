import {render} from "@testing-library/react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

import {AtRiskTable} from "@/components/admin/at-risk-table";
import {MemberTable} from "@/components/admin/member-table";
import {ReportCards} from "@/components/admin/report-cards";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

/**
 * AdminNav (Task 7) became a "use client" component that resolves its own translations from
 * next-intl and its own current path from next/navigation, instead of taking a pre-resolved
 * `labels` prop. These two mocks let this suite still drive AdminNav through arbitrary
 * en.Admin/zh.Admin label content per it.each case (exactly what the pre-Task-7 tests below did
 * by passing a `labels` prop directly) by resolving each `t("a.b.c")` call as a real dot-path
 * lookup against whichever labels object the current test case set, rather than collapsing to
 * the raw key -- that would make the "localized brand copy" and "translated ... automations"
 * assertions vacuously true regardless of the real message content.
 */
const adminNavMocks = vi.hoisted(() => ({
  labels: {} as Record<string, unknown>,
  pathname: "/admin",
}));
vi.mock("next/navigation", () => ({usePathname: () => adminNavMocks.pathname}));
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const root = namespace === "Admin" ? adminNavMocks.labels : {};
    const value = key.split(".").reduce<unknown>((acc, segment) => {
      if (acc && typeof acc === "object" && segment in (acc as Record<string, unknown>)) {
        return (acc as Record<string, unknown>)[segment];
      }
      return undefined;
    }, root);
    return typeof value === "string" ? value : key;
  },
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above so the mocked modules are in place first.
import {AdminNav} from "@/components/admin/admin-nav";

describe("admin presentation", () => {
  it.each([
    {locale: "en" as const, corporate: "Corporate", pastDue: "Past due", expectedDate: "Aug 1, 2026"},
    {locale: "zh-HK" as const, corporate: "\u4f01\u696d", pastDue: "\u903e\u671f", expectedDate: "2026\u5e748\u67081\u65e5"},
  ])("localizes at-risk evidence, tier, status, date, and actions for $locale", ({locale, corporate, pastDue, expectedDate}) => {
    const labels = {caption: "At-risk members", empty: "No at-risk members.", name: "Name", company: "Company", tier: "Tier", status: "Status", score: "Score", trend: "Trend", renewal: "Renewal", evidence: "Evidence", actions: "Actions", unavailable: "Unavailable", branchAEvidence: "Score below 20 and trend below 0", branchBEvidence: "No login for 90 days and renewal within 120 days", member360: "Member 360", addNote: "Add note", campaign: "Queue campaign", plans: {community: "Community", startup: "Startup", corporate, patron: "Patron"}, statuses: {active: "Active", past_due: pastDue}};
    const html = renderToStaticMarkup(<AtRiskTable locale={locale} labels={labels} members={[{profileId: "risk-1", membershipId: "membership-risk-1", displayName: "Risk One", companyName: "Acme", planCode: "corporate", status: "past_due", score: 19, trend: -3, lastLoginAt: null, renewalAt: new Date("2026-08-01T00:00:00.000Z"), evidence: {atRisk: true, branchA: true, branchB: false, scoreBelow: 20, trendBelow: 0, noLoginWithinDays: 90, renewalWithinDays: 120, status: "past_due"}}]}/>);
    expect(html).toContain("Score below 20 and trend below 0");
    expect(html).not.toContain("No login for 90 days and renewal within 120 days");
    expect(html).toContain(corporate);
    expect(html).toContain(pastDue);
    expect(html).toContain(expectedDate);
    expect(html).not.toContain(">corporate<");
    expect(html).not.toContain(">past_due<");
    expect(html).not.toContain("2026-08-01T00:00:00.000Z");
    expect(html).toContain("/admin/members/risk-1#member-note-body");
    expect(html).toContain("Queue campaign");
    expect(html).toContain("/admin/segments?profileId=risk-1");
    expect(html).not.toContain("status=past_due");
    expect(html).not.toContain("scoreMax=");
    expect(html).not.toContain("renewalWithinDays=");
  });

  it.each([en.Admin, zh.Admin])("renders one page heading, an accessible nav, a table caption, and translated empty state", (labels) => {
    adminNavMocks.labels = labels;
    const {container: navContainer} = render(<AdminNav locale="en" />);
    const nav = navContainer.innerHTML;
    const table = renderToStaticMarkup(<MemberTable labels={labels.members} page={{items: [], nextCursor: null}} query="" locale="en"/>);
    const page = renderToStaticMarkup(<main><h1>{labels.members.title}</h1>{table}</main>);

    expect(page.match(/<h1/g)).toHaveLength(1);
    expect(nav).toContain(`aria-label="${labels.navigation.label}"`);
    expect(nav).toContain(`>${labels.navigation.automations}</a>`);
    expect(nav).toContain("/admin/automations");
    expect(table).toMatch(new RegExp(`<caption[^>]*>${labels.members.caption}</caption>`));
    expect(table).toContain(labels.members.empty);
  });
  it.each([en.Admin, zh.Admin])("uses localized brand copy and preserves the query in next-page links without a false previous link", (labels) => {
    adminNavMocks.labels = labels;
    const {container: navContainer} = render(<AdminNav locale="en" />);
    const nav = navContainer.innerHTML;
    const table = renderToStaticMarkup(<MemberTable labels={labels.members} page={{items: [], nextCursor: "opaque-cursor"}} query="acme" locale="en"/>);

    expect(nav).toContain(labels.brand);
    expect(table).toContain("?q=acme&amp;cursor=opaque-cursor");
    expect(table).not.toContain(labels.members.previous);
  });


  it.each([
    {locale: "en" as const, labels: en.Admin.reports, expectedPeriod: "1 Jul 2026", expectedUnavailable: "Not available"},
    {locale: "zh-HK" as const, labels: zh.Admin.reports, expectedPeriod: "2026年7月1日", expectedUnavailable: "未有資料"},
  ])("renders accessible reconciled report cards in $locale", ({locale, labels, expectedPeriod, expectedUnavailable}) => {
    const html = renderToStaticMarkup(<ReportCards locale={locale} labels={labels} report={{
      window: {from: "2026-07-01", to: "2026-07-31", timezone: "Asia/Hong_Kong"},
      revenue: {arrHkd: 3240, mrrHkd: 270},
      renewal: {numerator: 7, denominator: 8, percentage: 87.5},
      firstYearRenewal: {numerator: 0, denominator: 0, percentage: null},
      funnel: {started: 10, profileCompleted: 8, checkoutOrReview: 6, activated: 5},
      attendance: {numerator: 2, denominator: 4, percentage: 50},
      atRiskCount: 2,
    }}/>);

    expect(html).toContain(expectedPeriod);
    expect(html).toContain("Asia/Hong_Kong");
    expect(html).toContain("87.5%");
    expect(html).toContain("50.0%");
    expect(html).toContain(expectedUnavailable);
    expect(html).toContain(labels.numerator);
    expect(html).toContain(">7<");
    expect(html).toContain(labels.denominator);
    expect(html).toContain(">8<");
    expect(html).toContain("<section");
    expect(html.match(/aria-labelledby=/g)?.length).toBeGreaterThanOrEqual(6);
  });
});
