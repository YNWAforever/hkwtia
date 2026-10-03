import {readFileSync} from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import {expect, test, type Page} from "@playwright/test";

import {M2_UUIDS} from "../../scripts/seed-m2";
import {missingM2LiveEnvironment, signInForM2} from "../fixtures/m2-auth";
import {buildM2RuntimeEnvironment} from "../fixtures/m2-runtime-env";
import {readM2ApprovalFact, resetM2AuthenticatedFixtures} from "../fixtures/m2-reset";
import {readBrowserReportFlow, readBrowserReportStock} from "../fixtures/report-browser-ledger";

type AcceptanceMessages = Readonly<{
  AdminLogin: {accessDenied: string};
  About: {title: string};
  Membership: {title: string};
  NotFound: {title: string};
  Admin: {
    members: {title: string; search: string; filters: {apply: string}};
    member360: {notes: string; engagement: string; noteBody: string; addNote: string; noteSuccess: string};
    campaigns: {actions: {next: string; approveEmail: string}};
    segments: {total: string; queue: string; queued: string; existing: string; recipients: string; save: string; saveValidation: string};
    atRisk: {title: string};
    reports: {title: string; numerator: string; denominator: string};
    eventsMgmt: {checkIn: string; checkInSuccess: string};
    approvals: {approve: string; success: string};
  };
}>;
const messages = (locale: "en" | "zh-HK") => JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8")) as AcceptanceMessages;
const en = messages("en");
const zh = messages("zh-HK");

const CSV_HEADER = "kind,id,displayName,email,companyName,planCode,membershipStatus,renewalAt,score,whatsappNumber,whatsappOptIn,contactStage,contactSource";
const CAMPAIGN_DRAFT_ID = "30000000-0000-4000-8000-000000000001";
const ARR = "Annual recurring revenue";
const ADMIN_ROUTES = [
  "/admin",
  "/admin/members",
  "/admin/members?limit=not-a-number",
  "/admin/members/m2-risk-01",
  "/admin/segments",
  "/admin/at-risk",
  "/admin/events-mgmt",
  "/admin/events-mgmt/2a000000-0000-4000-8000-000000000001",
  "/admin/approvals",
  "/admin/reports",
] as const;
const missingLiveEnvironment = missingM2LiveEnvironment();
const authenticatedSkipReason = `M2 authenticated acceptance requires an isolated database and Neon Auth test accounts; missing: ${missingLiveEnvironment.join(", ")}`;

async function enterProtectedPreview(page: Page): Promise<void> {
  const shareToken = process.env.VERCEL_SHARE_TOKEN?.trim();
  const baseURL = process.env.PLAYWRIGHT_BASE_URL?.trim();
  if (!shareToken || !baseURL) return;

  const shareUrl = new URL(baseURL);
  if (shareUrl.protocol !== "https:" || !shareUrl.hostname.endsWith(".vercel.app")) {
    throw new Error("VERCEL_SHARE_TOKEN_REQUIRES_HTTPS_VERCEL_PREVIEW");
  }
  shareUrl.searchParams.set("_vercel_share", shareToken);
  await page.goto(shareUrl.href);
}

test.beforeEach(async ({page}) => enterProtectedPreview(page));

test.describe("M2 credential-free browser evidence", () => {
  test("anonymous admin requests require the discoverable staff login", async ({page}) => {
    const response = await page.goto("/admin");
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toMatch(/^\/(?:zh\/)?admin-login$/);
    await expect(page.locator('form:has(input[type="email"])')).toBeVisible();
  });

  test("public presentation and protected portal routes remain available without credentials", async ({page}) => {
    for (const route of [
      {path: "/about", heading: en.About.title},
      {path: "/membership", heading: en.Membership.title},
    ]) {
      const response = await page.goto(route.path);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", {level: 1, name: route.heading})).toBeVisible();
    }

    await page.goto("/portal");
    await expect(page).toHaveURL(/\/member-login\?next=%2Fportal/);
  });
});

test.describe("M2 authenticated Admin CRM acceptance", () => {
  test.describe.configure({mode: "serial"});
  test.skip(missingLiveEnvironment.length > 0, authenticatedSkipReason);
  test.beforeAll(async () => {
    if (missingLiveEnvironment.length === 0) {
      await resetM2AuthenticatedFixtures(buildM2RuntimeEnvironment(process.env));
    }
  });

  test("staff searches Member 360 and appends a note through the real auth and database seams", async ({page}) => {
    await signInForM2(page, "staff");
    await page.goto("/admin/members");
    await expect(page.getByRole("heading", {level: 1, name: en.Admin.members.title})).toBeVisible();
    await page.getByRole("searchbox", {name: en.Admin.members.search}).fill("M2 Risk 01");
    await page.getByRole("button", {name: en.Admin.members.filters.apply, exact: true}).click();
    await expect(page.getByRole("row", {name: /M2 Risk 01/})).toBeVisible();

    await page.goto("/admin/members/m2-risk-01");
    await expect(page.getByRole("heading", {level: 1, name: "M2 Risk 01"})).toBeVisible();
    await expect(page.getByRole("heading", {level: 2, name: en.Admin.member360.engagement})).toBeVisible();
    await page.getByRole("link", {name: en.Admin.member360.notes, exact: true}).click();
    await page.getByRole("textbox", {name: en.Admin.member360.noteBody, exact: true}).fill("M2 acceptance follow-up");
    await page.getByRole("button", {name: en.Admin.member360.addNote}).click();
    await expect(page.getByText(en.Admin.member360.noteSuccess)).toBeVisible();
    await expect(page.getByText("M2 acceptance follow-up", {exact: true})).toBeVisible();
  });

  test("the canonical segment has exact rows and CSV headers and its draft entry cannot queue on GET", async ({page}) => {
    await resetM2AuthenticatedFixtures(buildM2RuntimeEnvironment(process.env), undefined, new Date());
    await signInForM2(page, "staff");
    const query = new URLSearchParams([
      ["tier", "corporate"],
      ["status", "active"],
      ["status", "past_due"],
      ["scoreMax", "19.99"],
      ["renewalWithinDays", "60"],
      ["campaignDraft", CAMPAIGN_DRAFT_ID],
    ]);
    await page.goto(`/admin/segments?${query}`);
    await expect(page.getByText(`${en.Admin.segments.total}: 3`, {exact: true})).toBeVisible();
    await expect(page.locator("table tbody th")).toHaveText(["M2 Risk 01", "M2 Risk 02", "M2 Risk 03"]);

    const exportResponse = await page.request.get(`/api/admin/segments/${M2_UUIDS.segments[0]}/export`);
    expect(exportResponse.status()).toBe(200);
    expect(exportResponse.headers()["content-type"]).toContain("text/csv"); // Content-Type
    expect(exportResponse.headers()["content-disposition"]).toContain(`segment-${M2_UUIDS.segments[0]}.csv`);
    const csv = (await exportResponse.text()).replace(/^\uFEFF/, "");
    expect(csv.split("\r\n")[0]).toBe(CSV_HEADER);
    expect(csv.split("\r\n").slice(1, 4).map((row) => row.split(",").slice(0, 2))).toEqual([["member", "m2-risk-01"], ["member", "m2-risk-02"], ["member", "m2-risk-03"]]);

    const segment = page.getByRole("listitem").filter({hasText: "M2 engineered at-risk"});
    const entry = segment.getByRole("link", {name: en.Admin.segments.queue, exact: true});
    await expect(entry).toBeVisible();
    await entry.click();
    await expect(page).toHaveURL(/\/admin\/campaigns\?/);
    expect(new URL(page.url()).searchParams.get("segmentId")).toBe(M2_UUIDS.segments[0]);
    await expect(page.getByRole("button", {name: en.Admin.campaigns.actions.next, exact: true})).toBeVisible();
    await expect(page.getByRole("button", {name: en.Admin.campaigns.actions.approveEmail, exact: true})).toHaveCount(0);
    // Actual draft/duplicate/CAS/two-person review SQL and browser effects are
    // exercised by full-campaign-review.spec.ts and audit-full-campaign-entrypoints.

  });

  test("the operational at-risk queue contains exactly the three engineered members in order", async ({page}) => {
    // The historical July fixture is shifted only for today's operational queue.
    await resetM2AuthenticatedFixtures(buildM2RuntimeEnvironment(process.env), undefined, new Date());
    try {
      await signInForM2(page, "staff");
      await page.goto("/admin/at-risk");
      await expect(page.getByRole("heading", {level: 1, name: en.Admin.atRisk.title})).toBeVisible();
      // Other isolated suites own additional synthetic candidates. Assert the
      // complete M2 fixture partition without deleting their history or rights.
      await expect(page.locator('table tbody tr:has(a[href*="/admin/members/m2-"]) th')).toHaveText(["M2 Risk 01", "M2 Risk 02", "M2 Risk 03"]);
    } finally {await resetM2AuthenticatedFixtures(buildM2RuntimeEnvironment(process.env));}
  });

  test("the report reconciles current ledger stock and committed July flow before browser mutations", async ({page}) => {
    await resetM2AuthenticatedFixtures(buildM2RuntimeEnvironment(process.env));
    const stock = await readBrowserReportStock(new Date("2026-07-31T16:00:00Z"));
    const from = new Date("2026-06-30T16:00:00Z"), to = new Date("2026-07-31T16:00:00Z");
    const flow = await readBrowserReportFlow(from, to);
    // Keep the golden fixture assertions while also accounting for other suites' history.
    expect(await readBrowserReportFlow(from, to, true)).toEqual({paid: 2, due: 4, firstPaid: 1, firstDue: 2, attended: 3, eligible: 8});
    const percentage = (n: number, d: number) => `${(Math.round(n / d * 1000) / 10).toFixed(1)}%`;
    const currency = (amount: number) => new Intl.NumberFormat("en-HK", {style: "currency", currency: "HKD", maximumFractionDigits: 0}).format(amount);
    await signInForM2(page, "staff");
    await page.goto("/admin/reports?from=2026-07-01&to=2026-07-31");
    await expect(page.getByRole("heading", {level: 1, name: en.Admin.reports.title})).toBeVisible();
    await expect(page.locator('section[aria-labelledby="report-arr"]')).toContainText(ARR);
    await expect(page.locator('section[aria-labelledby="report-arr"]')).toContainText(currency(stock.arrHkd));
    await expect(page.locator('section[aria-labelledby="report-mrr"]')).toContainText(currency(stock.mrrHkd));
    await expect(page.locator('section[aria-labelledby="report-renewal"]')).toContainText(percentage(flow.paid, flow.due));
    await expect(page.locator('section[aria-labelledby="report-renewal"] dt')).toHaveText([en.Admin.reports.numerator, en.Admin.reports.denominator]);
    await expect(page.locator('section[aria-labelledby="report-renewal"] dd')).toHaveText([String(flow.paid), String(flow.due)]);
    await expect(page.locator('section[aria-labelledby="report-first-year-renewal"] dd')).toHaveText([String(flow.firstPaid), String(flow.firstDue)]);
    // July 31 includes the July 25 fixture event; the July 20 unit reference excludes it.
    await expect(page.locator('section[aria-labelledby="report-attendance"]')).toContainText(percentage(flow.attended, flow.eligible));
    await expect(page.locator('section[aria-labelledby="report-attendance"] dd')).toHaveText([String(flow.attended), String(flow.eligible)]);
    await expect(page.locator('section[aria-labelledby="report-at-risk"] p.tabular-nums')).toHaveText(String(stock.atRiskCount));
  });

  test("event check-in appends exactly one event_attended engagement", async ({page}) => {
    await signInForM2(page, "staff");
    await page.goto(`/admin/events-mgmt/${M2_UUIDS.events[0]}?tab=attendees&q=M2+Member+04`);
    const attendee = page.getByRole("row", {name: /M2 Member 04/});
    await expect(attendee.getByRole("button", {name: en.Admin.eventsMgmt.checkIn})).toBeEnabled();
    await attendee.getByRole("button", {name: en.Admin.eventsMgmt.checkIn}).click();
    await expect(attendee.getByText(en.Admin.eventsMgmt.checkInSuccess)).toBeVisible();
    await expect(attendee.getByRole("button", {name: en.Admin.eventsMgmt.checkIn})).toBeDisabled();

    await page.goto("/admin/members/m2-member-04?section=engagement");
    await expect(page.getByText("event_attended", {exact: false})).toHaveCount(1);
  });

  test("staff records one supported approval decision and persists its audit fact", async ({page}) => {
    await signInForM2(page, "staff");
    await page.goto("/admin/approvals");
    const campaignApproval = page.getByRole("row", {name: /Campaign delivery/});
    await expect(campaignApproval).toBeVisible();
    await campaignApproval.getByRole("button", {name: en.Admin.approvals.approve}).click();
    await expect(campaignApproval).toHaveCount(0);
    await expect.poll(() => readM2ApprovalFact(buildM2RuntimeEnvironment(process.env), M2_UUIDS.approvals[1]))
      .toEqual({status: "approved", decidedByProfileId: "m2-staff-01", auditCount: 1});
  });

  test("representative authenticated admin routes have no serious or critical axe violations", async ({page}) => {
    await signInForM2(page, "staff");
    for (const route of ["/admin/members", "/admin/segments", "/admin/reports?from=2026-07-01&to=2026-07-31"]) {
      await page.goto(route);
      const results = await new AxeBuilder({page}).analyze();
      expect(results.violations.filter(({impact}) => impact === "serious" || impact === "critical"), route).toEqual([]);
    }
  });

  test("Traditional Chinese admin routes render localized headings and segment recovery state", async ({page}) => {
    await signInForM2(page, "staff");
    await page.goto("/zh/admin/members");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-HK");
    await expect(page.getByRole("heading", {level: 1, name: zh.Admin.members.title})).toBeVisible();
    await page.goto("/zh/admin/reports?from=2026-07-01&to=2026-07-31");
    await expect(page.getByRole("heading", {level: 1, name: zh.Admin.reports.title})).toBeVisible();

    await page.goto("/zh/admin/segments");
    await expect(page.getByRole("button", {name: zh.Admin.segments.save})).toBeVisible();
    await page.locator("#segment-name-en").evaluate((element) => element.removeAttribute("required"));
    await page.getByRole("button", {name: zh.Admin.segments.save}).click();
    await expect(page.locator('p[role="alert"]')).toHaveText(zh.Admin.segments.saveValidation);
  });

  test("anonymous, member, and company-admin identities require login or receive access denied on every admin route", async ({browser}) => {
    for (const role of [null, "member", "company-admin"] as const) {
      const context = await browser.newContext();
      const rolePage = await context.newPage();
      await enterProtectedPreview(rolePage);
      if (role) await signInForM2(rolePage, role);
      for (const route of ADMIN_ROUTES) {
        const response = await rolePage.goto(route);
        expect(response?.status(), (role ?? "anonymous") + " " + route).toBe(200);
        expect(new URL(rolePage.url()).pathname).toMatch(/^\/(?:zh\/)?admin-login$/);
        if (role) await expect(rolePage.getByRole("heading", {level: 1, name: en.AdminLogin.accessDenied, exact: true})).toBeVisible();
        else await expect(rolePage.locator('form:has(input[type="email"])')).toBeVisible();
      }
      const exportResponse = await rolePage.request.get(`/api/admin/segments/${M2_UUIDS.segments[0]}/export`);
      expect(exportResponse.status(), (role ?? "anonymous") + " segment export API").toBe(404);

      await context.close();
    }
  });
});
