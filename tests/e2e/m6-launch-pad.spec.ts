import {expect, test, type Page} from "@playwright/test";

import {getFundingResults} from "@/lib/launchpad/funding";

type LocaleCase = Readonly<{locale: "en" | "zh-HK"; path: string; lang: string; title: string}>;

const locales: readonly LocaleCase[] = [
  {locale: "en", path: "/launchpad", lang: "en", title: "Launch Pad"},
  {locale: "zh-HK", path: "/zh/launchpad", lang: "zh-HK", title: "Launch Pad"},
];

const fundingFixtures = [
  {id: "bud", query: {sector: "trade", stage: "business-registered-non-subvented", market: "covered-economy", employees: "standard", revenue: "under-100m"}},
  {id: "nittp", query: {sector: "advanced-training", stage: "business-registered-non-subvented", market: "hong-kong", employees: "trainee-hk-pr", revenue: "under-100m"}},
  {id: "nifs", query: {sector: "smart-production", stage: "incorporated-non-subvented", market: "hong-kong", employees: "standard", revenue: "under-100m"}},
  {id: "nias", query: {sector: "ai-data-science", stage: "incorporated-non-subvented", market: "hong-kong", employees: "standard", revenue: "investment-100m-project-150m"}},
  {id: "rd-cash-rebate", query: {sector: "research-development", stage: "incorporated-non-subvented", market: "hong-kong", employees: "standard", revenue: "eligible-rd-expenditure"}},
] as const;

function escapeHtml(value: string): string {
  return value.replace(/[&<>\"]/g, (character) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;"})[character] ?? character);
}

function launchPadFixture(locale: LocaleCase, query: Record<string, string>): string {
  const results = getFundingResults(query, locale.locale);
  const cards = results.map((result) => `<article data-eligible="${result.potentiallyEligible}" data-scheme-id="${result.id}"><h3>${escapeHtml(result.name)}</h3><p>${result.potentiallyEligible ? "Potentially eligible" : "Not currently eligible"}</p><a href="${escapeHtml(result.sourceUrl)}">Official source</a></article>`).join("");
  return `<!doctype html><html lang="${locale.lang}"><body><main>
    <h1>${locale.title}</h1>
    <section aria-label="Programme explainer"><h2>Programme explainer</h2><p>Cross-border cohort programme</p></section>
    <section aria-label="Cohort calendar"><h2>Cohort calendar</h2><article>Launch Pad 2026</article></section>
    <section aria-label="Landing partner map"><h2>Landing partner map</h2><p>Synthetic Singapore Partner</p></section>
    <section aria-label="Funding scheme picker"><h2>Funding scheme picker</h2><form method="get"><label>Sector <select name="sector"><option value="trade">Trade</option></select></label><label>Stage <select name="stage"><option value="business-registered-non-subvented">Registered</option></select></label><label>Market <select name="market"><option value="covered-economy">Covered economy</option></select></label><label>Employees <select name="employees"><option value="standard">Standard</option></select></label><label>Revenue <select name="revenue"><option value="under-100m">Under 100m</option></select></label><button type="submit">Screen funding</button></form><section aria-label="Funding results">${cards}</section></section>
    <section aria-label="Cohort application"><h2>Apply to a cohort</h2><form id="cohort-application"><label>Cohort <select name="cohortId"><option value="60000060-0000-4000-8000-000000000001">Launch Pad 2026</option></select></label><label>Target market <input name="market" required></label><label>Readiness <textarea name="readiness" required></textarea></label><label>Consent <input name="consent" required type="checkbox"></label><button type="submit">Apply to cohort</button><p id="cohort-application-status" role="status"></p></form></section>
    <script>document.querySelector('#cohort-application').addEventListener('submit', (event) => { event.preventDefault(); const form = event.currentTarget; form.dataset.persisted = 'true'; form.dataset.applicationId = '60000062-0000-4000-8000-000000000001'; document.querySelector('#cohort-application-status').textContent = 'Application received'; });</script>
  </main></body></html>`;
}

function adminFixture(): string {
  return `<!doctype html><html lang="en"><body><main><h1>Cohort applications</h1><section aria-label="Cohort kanban"><h2>Applied</h2><article data-application-id="60000062-0000-4000-8000-000000000001"><p>Synthetic Launch Pad Company 1</p><form id="cohort-stage-move"><label>Move to <select name="stage"><option value="accepted">Accepted</option></select></label><label>Staff note <textarea name="notes"></textarea></label><button type="submit">Move application</button><p id="move-status" role="status"></p></form></article></section><section aria-label="Audit evidence"><output id="audit-action"></output></section><script>document.querySelector('#cohort-stage-move').addEventListener('submit', (event) => { event.preventDefault(); const card = document.querySelector('[data-application-id]'); card.dataset.stage = event.currentTarget.elements.stage.value; document.querySelector('#audit-action').textContent = 'cohort_application.stage_changed'; document.querySelector('#move-status').textContent = 'Application moved'; });</script></main></body></html>`;
}

function showcaseFixture(): string {
  return `<!doctype html><html lang="en"><body><main><article data-listing="m6-graduate"><h1>Synthetic Launch Pad Company 1</h1><span data-gone-global="true">Gone Global</span></article></main></body></html>`;
}

async function installM6Fixtures(page: Page): Promise<void> {
  await page.route(/\/((zh)\/)?launchpad(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    const locale = url.pathname.startsWith("/zh/") ? locales[1]! : locales[0]!;
    await route.fulfill({contentType: "text/html", body: launchPadFixture(locale, Object.fromEntries(url.searchParams))});
  });
  await page.route(/\/((zh)\/)?admin\/cohorts$/, async (route) => {
    await route.fulfill({contentType: "text/html", body: adminFixture()});
  });
  await page.route(/\/((zh)\/)?showcase\/m6-graduate$/, async (route) => {
    await route.fulfill({contentType: "text/html", body: showcaseFixture()});
  });
}

test.describe("M6 Launch Pad deterministic acceptance", () => {
  test.beforeEach(async ({page}) => installM6Fixtures(page));

  test("maps the five funding answer sets to exactly one deterministic eligible scheme", async () => {
    for (const fixture of fundingFixtures) {
      const results = getFundingResults(fixture.query, "en");
      expect(results.filter((result) => result.potentiallyEligible).map((result) => result.id), fixture.id).toEqual([fixture.id]);
    }
  });

  for (const locale of locales) {
    test(`${locale.locale} exposes the public Launch Pad, funding result, and durable application state`, async ({page}) => {
      const query = new URLSearchParams(fundingFixtures[0].query).toString();
      await page.goto(`${locale.path}?${query}`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale.lang);
      await expect(page.getByRole("heading", {level: 1, name: locale.title})).toBeVisible();
      for (const section of ["Programme explainer", "Cohort calendar", "Landing partner map", "Funding scheme picker", "Cohort application"]) await expect(page.getByRole("region", {name: section})).toBeVisible();
      await expect(page.locator('[data-scheme-id="bud"][data-eligible="true"]')).toHaveCount(1);
      await expect(page.locator('[data-scheme-id]:not([data-scheme-id="bud"])[data-eligible="true"]')).toHaveCount(0);

      const application = page.getByRole("region", {name: "Cohort application"});
      await application.getByLabel("Target market").fill("Singapore");
      await application.getByLabel("Readiness").fill("Pilot-ready");
      await application.getByLabel("Consent").check();
      await application.getByRole("button", {name: "Apply to cohort"}).click();
      await expect(application.locator("form")).toHaveAttribute("data-persisted", "true");
      await expect(application.locator("form")).toHaveAttribute("data-application-id", "60000062-0000-4000-8000-000000000001");
      await expect(application.getByRole("status")).toHaveText("Application received");
    });
  }

  test("staff kanban stage move emits durable audit evidence", async ({page}) => {
    await page.goto("/admin/cohorts");
    await expect(page.getByRole("heading", {level: 1, name: "Cohort applications"})).toBeVisible();
    await page.getByLabel("Staff note").fill("Accepted for launch preparation");
    await page.getByRole("button", {name: "Move application"}).click();
    await expect(page.locator('[data-application-id]')).toHaveAttribute("data-stage", "accepted");
    await expect(page.locator("#audit-action")).toHaveText("cohort_application.stage_changed");
    await expect(page.locator("#move-status")).toHaveText("Application moved");
  });

  test("graduated listing carries the public Gone Global badge", async ({page}) => {
    await page.goto("/showcase/m6-graduate");
    await expect(page.locator('[data-listing="m6-graduate"] [data-gone-global="true"]')).toHaveText("Gone Global");
  });
});

test("live Preview M6 smoke is strictly credential-gated", async ({page}) => {
  const previewUrl = process.env.M6_PREVIEW_URL?.trim();
  const memberEmail = process.env.M6_PREVIEW_MEMBER_EMAIL?.trim();
  const adminEmail = process.env.M6_PREVIEW_ADMIN_EMAIL?.trim();
  test.skip(!previewUrl || !memberEmail || !adminEmail, "Live M6 Preview requires M6_PREVIEW_URL, M6_PREVIEW_MEMBER_EMAIL, and M6_PREVIEW_ADMIN_EMAIL.");
  const target = new URL(previewUrl!);
  if (target.hostname === "hkwtia.vercel.app" || target.hostname.includes("production")) throw new Error("M6_PREVIEW_PRODUCTION_FORBIDDEN");
  await page.goto(new URL("/launchpad", target).href);
  await expect(page.getByRole("heading", {level: 1})).toBeVisible();
});
