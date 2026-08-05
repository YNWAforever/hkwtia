import {Pool} from "pg";
import {expect, test, type Page} from "@playwright/test";

import {getFundingResults} from "@/lib/launchpad/funding";
import {assertM6SeedEnvironment} from "@/scripts/seed-m6";

const COHORT_ID = "60000060-0000-4000-8000-000000000001";
const M6_REQUIRED_ENV = [
  "M6_ACCEPTANCE_SEED",
  "DATABASE_URL_TEST",
  "M6_ACCEPTANCE_DATABASE_HOST_ALLOWLIST",
  "NEON_AUTH_BASE_URL",
  "NEON_AUTH_COOKIE_SECRET",
  "M6_TEST_MEMBER_EMAIL",
  "M6_TEST_MEMBER_PASSWORD",
  "M6_TEST_MEMBER_COMPANY_DISPLAY_NAME",
  "M6_TEST_STAFF_EMAIL",
  "M6_TEST_STAFF_PASSWORD",
  "M6_TEST_GRADUATE_COMPANY_DISPLAY_NAME",
] as const;

const fundingFixtures = [
  {id: "bud", query: {sector: "trade", stage: "business-registered-non-subvented", market: "covered-economy", employees: "standard", revenue: "under-100m"}},
  {id: "nittp", query: {sector: "advanced-training", stage: "business-registered-non-subvented", market: "hong-kong", employees: "trainee-hk-pr", revenue: "under-100m"}},
  {id: "nifs", query: {sector: "smart-production", stage: "incorporated-non-subvented", market: "hong-kong", employees: "standard", revenue: "under-100m"}},
  {id: "nias", query: {sector: "ai-data-science", stage: "incorporated-non-subvented", market: "hong-kong", employees: "standard", revenue: "investment-100m-project-150m"}},
  {id: "rd-cash-rebate", query: {sector: "research-development", stage: "incorporated-non-subvented", market: "hong-kong", employees: "standard", revenue: "eligible-rd-expenditure"}},
] as const;

function missingM6Environment(): readonly string[] {
  return M6_REQUIRED_ENV.filter((name) => !process.env[name]?.trim());
}

function validateM6Target(): void {
  const configured = process.env.PLAYWRIGHT_BASE_URL?.trim();
  if (!configured) return;
  const target = new URL(configured);
  const hostname = target.hostname.toLowerCase();
  const loopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if (loopback) return;
  if (target.protocol !== "https:" || hostname === "hkwtia.vercel.app" || !hostname.endsWith(".vercel.app")) {
    throw new Error("M6_E2E_TARGET_MUST_BE_AN_ISOLATED_VERCEL_PREVIEW");
  }
}

const configuredTarget = process.env.PLAYWRIGHT_BASE_URL?.trim() ?? "";
const managedM6Target = configuredTarget.length === 0;
const missingEnvironment = missingM6Environment();
if (!managedM6Target) validateM6Target();
if (managedM6Target && missingEnvironment.length === 0) {
  const databaseUrl = process.env.DATABASE_URL_TEST!.trim();
  assertM6SeedEnvironment({...process.env, DATABASE_URL: databaseUrl, DATABASE_URL_TEST: databaseUrl});
}

const skipReason = !managedM6Target
  ? "M6 mutating real-route acceptance is restricted to Playwright's managed loopback server; an external PLAYWRIGHT_BASE_URL target is read-only for this spec."
  : missingEnvironment.length > 0
  ? `M6 real-route acceptance requires an explicitly seeded isolated runtime; missing: ${missingEnvironment.join(", ")}`
  : "";

type ApplicationRow = Readonly<{id: string; companyId: string; stage: string}>;

let database: Pool | null = null;

async function query<T extends Record<string, unknown>>(text: string, values: unknown[] = []): Promise<readonly T[]> {
  if (!database) throw new Error("M6_ACCEPTANCE_DATABASE_NOT_OPEN");
  const result = await database.query<T>(text, values);
  return result.rows;
}

async function signIn(page: Page, role: "member" | "staff"): Promise<void> {
  const prefix = role === "member" ? "M6_TEST_MEMBER" : "M6_TEST_STAFF";
  const email = process.env[`${prefix}_EMAIL`]?.trim();
  const password = process.env[`${prefix}_PASSWORD`]?.trim();
  if (!email || !password) throw new Error(`${prefix}_EMAIL and ${prefix}_PASSWORD are required`);
  await page.goto("/");
  const response = await page.request.post("/api/auth/sign-in/email", {
    data: {email, password, callbackURL: role === "staff" ? "/admin/cohorts" : "/launchpad"},
    headers: {Origin: new URL(page.url()).origin},
  });
  expect(response.ok()).toBe(true);
}

test.describe("M6 Launch Pad deterministic funding contract", () => {
  test("maps each fixture answer set to exactly one eligible scheme", () => {
    for (const fixture of fundingFixtures) {
      const results = getFundingResults(fixture.query, "en");
      expect(results.filter((result) => result.potentiallyEligible).map((result) => result.id), fixture.id).toEqual([fixture.id]);
    }
  });
});

test.describe("M6 Launch Pad managed isolated real-route acceptance (mutating)", () => {
  test.skip(!managedM6Target || missingEnvironment.length > 0, skipReason);
  test.beforeAll(async () => {
    if (!managedM6Target) return;
    database = new Pool({connectionString: process.env.DATABASE_URL_TEST, max: 1});
  });
  test.afterAll(async () => {
    await database?.end();
    database = null;
  });

  test("member submits through the real route and the application survives a reload", async ({page}) => {
    await signIn(page, "member");
    const response = await page.goto(`/launchpad?${new URLSearchParams(fundingFixtures[0].query)}`);
    expect(response?.status()).toBe(200);
    const application = page.locator("form").filter({has: page.locator("#cohort-application-cohort")});
    await expect(application).toBeVisible();
    await application.locator("#cohort-application-cohort").selectOption(COHORT_ID);
    await application.locator("#cohort-application-market").fill("Singapore");
    await application.locator("#cohort-application-readiness").fill("Pilot-ready isolated acceptance submission");
    await application.locator("#cohort-application-consent").check();
    await application.getByRole("button", {name: /apply|申請/i}).click();
    await expect(page.locator("#cohort-application-status")).not.toBeEmpty();

    const companyName = process.env.M6_TEST_MEMBER_COMPANY_DISPLAY_NAME!.trim();
    await expect.poll(async () => Number((await query<{count: string}>(
      `SELECT count(*)::text AS count
       FROM cohort_applications ca
       INNER JOIN companies c ON c.id = ca.company_id
       WHERE ca.cohort_id = $1 AND c.display_name = $2`,
      [COHORT_ID, companyName],
    ))[0]?.count ?? 0)).toBe(1);
    await page.reload();
    await expect(application).toBeVisible();
  });

  test("staff performs legal stage moves, proves audit persistence, and sees the real Showcase projection", async ({page}) => {
    const companyName = process.env.M6_TEST_GRADUATE_COMPANY_DISPLAY_NAME!.trim();
    const applicationRows = await query<ApplicationRow>(
      `SELECT ca.id, ca.company_id AS "companyId", ca.stage
       FROM cohort_applications ca
       INNER JOIN companies c ON c.id = ca.company_id
       WHERE ca.cohort_id = $1 AND c.display_name = $2
       LIMIT 1`,
      [COHORT_ID, companyName],
    );
    test.skip(applicationRows.length === 0, `M6 isolated seed has no application for ${companyName}; reseed the isolated fixture.`);
    const applicationRow = applicationRows[0]!;
    test.skip(applicationRow.stage === "graduated", "M6 graduate fixture is already graduated; reseed before repeating this mutating acceptance.");
    const listingRows = await query<{slug: string}>(
      `SELECT slug FROM showcase_listings WHERE company_id = $1 AND status = 'published' LIMIT 1`,
      [applicationRow.companyId],
    );
    test.skip(listingRows.length === 0, `M6 isolated seed has no published Showcase listing for ${companyName}; seed the linked M5 fixture first.`);
    const beforeAudit = Number((await query<{count: string}>(
      `SELECT count(*)::text AS count FROM audit_events WHERE action = 'cohort_application.stage_changed' AND target_id = $1`,
      [applicationRow.id],
    ))[0]?.count ?? 0);

    const nextStage: Readonly<Record<string, string>> = {applied: "accepted", accepted: "ready", ready: "match", match: "land", land: "scale", scale: "graduated"};
    let stage = applicationRow.stage;
    let moves = 0;
    await signIn(page, "staff");
    while (stage !== "graduated") {
      const targetStage = nextStage[stage];
      if (!targetStage) throw new Error(`M6_UNSUPPORTED_GRADUATE_PATH_${stage}`);
      await page.goto("/admin/cohorts");
      const card = page.locator("article").filter({hasText: companyName});
      await expect(card).toBeVisible();
      await card.getByRole("combobox").selectOption(targetStage);
      await card.getByRole("textbox").fill(`M6 isolated acceptance move to ${targetStage}`);
      await card.getByRole("button").click();
      await expect.poll(async () => (await query<ApplicationRow>("SELECT stage FROM cohort_applications WHERE id = $1", [applicationRow.id]))[0]?.stage).toBe(targetStage);
      stage = targetStage;
      moves += 1;
    }

    const afterAudit = Number((await query<{count: string}>(
      `SELECT count(*)::text AS count FROM audit_events WHERE action = 'cohort_application.stage_changed' AND target_id = $1`,
      [applicationRow.id],
    ))[0]?.count ?? 0);
    expect(afterAudit).toBeGreaterThanOrEqual(beforeAudit + moves);

    await page.goto(`/showcase/${listingRows[0]!.slug}`);
    await expect(page.getByRole("heading", {level: 1})).toContainText(companyName);
    await expect(page.getByText(/gone global/i)).toBeVisible();
  });
});
