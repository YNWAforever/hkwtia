import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";

import {AdminNav} from "@/components/admin/admin-nav";
import {AtRiskTable} from "@/components/admin/at-risk-table";
import {MemberTable} from "@/components/admin/member-table";
import {ReportCards} from "@/components/admin/report-cards";
import {SegmentBuilder} from "@/components/admin/segment-builder";
import {SegmentResults} from "@/components/admin/segment-results";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

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
    const nav = renderToStaticMarkup(<AdminNav locale="en" labels={{...labels.navigation, brand: labels.brand}}/>);
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
    const nav = renderToStaticMarkup(<AdminNav locale="en" labels={{...labels.navigation, brand: labels.brand}}/>);
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

  // Every string in this namespace shipped as literal ASCII question marks from
  // M2 until it was found by inspection, so `/admin/segments` was a page of `?`
  // in Chinese. Asserting the bundle is not enough: this renders the two
  // components the page is made of and looks at the markup a reader would get.
  it.each([
    {locale: "en" as const, labels: en.Admin.segments},
    {locale: "zh-HK" as const, labels: zh.Admin.segments},
  ])("renders every segments label into the markup for $locale", ({locale, labels}) => {
    const filter = {profileIds: [], tier: [], status: [], scoreMin: null, scoreMax: null, renewalWithinDays: null, sector: "", lastLoginBeforeDays: null};
    const builder = renderToStaticMarkup(<SegmentBuilder filter={filter} locale={locale} saveAction={async (state) => state} labels={{
      preview: labels.preview, filters: labels.filters, tier: labels.tier, status: labels.status,
      scoreMin: labels.scoreMin, scoreMax: labels.scoreMax, renewalWithinDays: labels.renewalWithinDays,
      sector: labels.sector, lastLoginBeforeDays: labels.lastLoginBeforeDays, save: labels.save,
      saving: labels.saving, nameEn: labels.nameEn, nameZh: labels.nameZh, corporate: labels.corporate,
      startup: labels.startup, community: labels.community, patron: labels.patron, active: labels.active,
      pastDue: labels.pastDue, pendingReview: labels.pendingReview,
    }}/>);
    const resultsLabels = {
      caption: labels.caption, total: labels.total, empty: labels.empty, name: labels.name,
      email: labels.email, company: labels.company, plan: labels.plan, status: labels.status,
      renewal: labels.renewal, score: labels.score, unavailable: labels.unavailable,
      saved: labels.saved, export: labels.export, queue: labels.queue, template: labels.template,
      templateRenewal: labels.templateRenewal, templateUpdate: labels.templateUpdate,
      queued: labels.queued, existing: labels.existing, recipients: labels.recipients,
      newDraft: labels.newDraft, error: labels.error,
    };
    // A member with every optional column null is what forces `unavailable` to
    // render; a saved segment is what forces the export and queue controls.
    const results = renderToStaticMarkup(<SegmentResults
      labels={resultsLabels}
      newDraftHref="/admin/campaigns/new"
      preview={{total: 1, nextCursor: null, items: [{profileId: "p-1", displayName: "Member One", email: null, companyName: null, planCode: null, membershipStatus: null, renewalAt: null, score: null}]}}
      queueAction={async (state) => state}
      saved={[{id: "s-1", ownerProfileId: "owner-1", nameEn: "Renewals due", nameZh: null, filterVersion: 1, filters: filter, createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z"}]}/>);
    // The zero-result pass, because `empty` is only reachable with no matches.
    const emptyResults = renderToStaticMarkup(<SegmentResults
      labels={resultsLabels}
      newDraftHref="/admin/campaigns/new"
      preview={{total: 0, nextCursor: null, items: []}}
      queueAction={async (state) => state}
      saved={[]}/>);
    // The page owns the header, so the test owns it too — otherwise the three
    // most prominent strings on the page go unrendered by any test.
    const header = renderToStaticMarkup(<header><p>{labels.eyebrow}</p><h1>{labels.title}</h1><p>{labels.description}</p></header>);
    const html = `${header}${builder}${results}${emptyResults}`;

    // `saving` and the four save/queue result strings are state-dependent and
    // never appear in a first paint, so they are asserted against the bundle.
    const rendered = Object.entries(labels)
      .filter(([key]) => !["saving", "saveSuccess", "saveValidation", "saveError", "queued", "existing", "recipients", "error"].includes(key));
    expect(rendered).toHaveLength(39);
    for (const [key, label] of rendered) {
      expect(html, `${key} is missing from the rendered page`).toContain(label);
    }
    expect(html).not.toMatch(/\?{2,}/);
  });

  it("renders the repaired Chinese where the question marks used to be", () => {
    const zhSegments: Record<string, string> = zh.Admin.segments;
    for (const [key, label] of Object.entries(zhSegments)) {
      expect(label, `Admin.segments.${key} is not Chinese`).toMatch(/\p{Script=Han}/u);
    }
    expect(zhSegments.title).toBe("會員分群");
    expect(zhSegments.filters).toBe("篩選條件");
    expect(zhSegments.export).toBe("匯出 CSV");
    expect(zhSegments.saving).toBe("儲存中……");
  });
});
