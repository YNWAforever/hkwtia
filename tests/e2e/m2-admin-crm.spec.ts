import {readFileSync} from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import {expect, test} from "@playwright/test";

import {M2_UUIDS} from "../../scripts/seed-m2";
import {missingM2LiveEnvironment, signInForM2} from "../fixtures/m2-auth";
import {buildM2RuntimeEnvironment} from "../fixtures/m2-runtime-env";
import {readM2ApprovalFact, resetM2AuthenticatedFixtures} from "../fixtures/m2-reset";

type AcceptanceMessages = Readonly<{
  About: {title: string};
  Membership: {title: string};
  NotFound: {title: string};
  Admin: {
    members: {title: string; search: string};
    member360: {engagement: string; noteBody: string; addNote: string; noteSuccess: string};
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

const CSV_HEADER = "profileId,displayName,email,companyName,planCode,membershipStatus,renewalAt,score";
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

test.describe("M2 credential-free browser evidence", () => {
  test("anonymous admin requests receive a real 404", async ({page}) => {
    const response = await page.goto("/admin");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", {level: 1, name: en.NotFound.title})).toBeVisible();
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
    await expect(page).toHaveURL(/\/join\?next=%2Fportal/);
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
    await page.getByRole("button", {name: en.Admin.members.search}).click();
    await expect(page.getByRole("row", {name: /M2 Risk 01/})).toBeVisible();

    await page.goto("/admin/members/m2-risk-01");
    await expect(page.getByRole("heading", {level: 1, name: "M2 Risk 01"})).toBeVisible();
    await expect(page.getByRole("heading", {level: 2, name: en.Admin.member360.engagement})).toBeVisible();
    await page.getByLabel(en.Admin.member360.noteBody).fill("M2 acceptance follow-up");
    await page.getByRole("button", {name: en.Admin.member360.addNote}).click();
    await expect(page.getByText(en.Admin.member360.noteSuccess)).toBeVisible();
    await expect(page.getByText("M2 acceptance follow-up", {exact: true})).toBeVisible();
  });

  test("the canonical segment has exact rows and CSV headers while queueing is idempotent", async ({page}) => {
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
    expect(csv.split("\r\n").slice(1, 4).map((row) => row.split(",")[0])).toEqual(["m2-risk-01", "m2-risk-02", "m2-risk-03"]);

    const segment = page.getByRole("listitem").filter({hasText: "M2 engineered at-risk"});
    await segment.getByRole("button", {name: en.Admin.segments.queue}).click();
    await expect(segment.getByText(`${en.Admin.segments.queued}: 3 ${en.Admin.segments.recipients}`, {exact: true})).toBeVisible();
    await segment.getByRole("button", {name: en.Admin.segments.queue}).click();
    await expect(segment.getByText(`${en.Admin.segments.existing}: 3 ${en.Admin.segments.recipients}`, {exact: true})).toBeVisible();
  });

  test("the operational at-risk queue contains exactly the three engineered members in order", async ({page}) => {
    await signInForM2(page, "staff");
    await page.goto("/admin/at-risk");
    await expect(page.getByRole("heading", {level: 1, name: en.Admin.atRisk.title})).toBeVisible();
    await expect(page.locator("table tbody th")).toHaveText(["M2 Risk 01", "M2 Risk 02", "M2 Risk 03"]);
  });

  test("the report reconciles committed July fixture values before browser mutations", async ({page}) => {
    await signInForM2(page, "staff");
    await page.goto("/admin/reports?from=2026-07-01&to=2026-07-31");
    await expect(page.getByRole("heading", {level: 1, name: en.Admin.reports.title})).toBeVisible();
    await expect(page.locator('section[aria-labelledby="report-arr"]')).toContainText(ARR);
    await expect(page.locator('section[aria-labelledby="report-arr"]')).toContainText("HK$87,600");
    await expect(page.locator('section[aria-labelledby="report-mrr"]')).toContainText("HK$7,300");
    await expect(page.locator('section[aria-labelledby="report-renewal"]')).toContainText("50.0%");
    await expect(page.locator('section[aria-labelledby="report-renewal"]')).toContainText(`${en.Admin.reports.numerator}2`);
    await expect(page.locator('section[aria-labelledby="report-renewal"]')).toContainText(`${en.Admin.reports.denominator}4`);
    await expect(page.locator('section[aria-labelledby="report-first-year-renewal"]')).toContainText(`${en.Admin.reports.numerator}1`);
    await expect(page.locator('section[aria-labelledby="report-first-year-renewal"]')).toContainText(`${en.Admin.reports.denominator}2`);
    await expect(page.locator('section[aria-labelledby="report-attendance"]')).toContainText(`${en.Admin.reports.numerator}3`);
    await expect(page.locator('section[aria-labelledby="report-attendance"]')).toContainText(`${en.Admin.reports.denominator}6`);
    await expect(page.locator('section[aria-labelledby="report-at-risk"]')).toContainText("3");
  });

  test("event check-in appends exactly one event_attended engagement", async ({page}) => {
    await signInForM2(page, "staff");
    await page.goto(`/admin/events-mgmt/${M2_UUIDS.events[0]}`);
    const attendee = page.getByRole("row", {name: /M2 Member 04/});
    await expect(attendee.getByRole("button", {name: en.Admin.eventsMgmt.checkIn})).toBeEnabled();
    await attendee.getByRole("button", {name: en.Admin.eventsMgmt.checkIn}).click();
    await expect(attendee.getByText(en.Admin.eventsMgmt.checkInSuccess)).toBeVisible();
    await expect(attendee.getByRole("button", {name: en.Admin.eventsMgmt.checkIn})).toBeDisabled();

    await page.goto("/admin/members/m2-member-04");
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
    await expect(page.getByText(zh.Admin.segments.saveValidation)).toBeVisible();
  });

  test("anonymous, member, and company-admin identities receive 404 for every admin route", async ({browser}) => {
    for (const role of [null, "member", "company-admin"] as const) {
      const context = await browser.newContext();
      const rolePage = await context.newPage();
      if (role) await signInForM2(rolePage, role);
      for (const route of ADMIN_ROUTES) {
        const response = await rolePage.goto(route);
        expect(response?.status(), (role ?? "anonymous") + " " + route).toBe(404);
        await expect(rolePage.getByRole("heading", {level: 1, name: en.NotFound.title})).toBeVisible();
      }
      await context.close();
    }
  });
});