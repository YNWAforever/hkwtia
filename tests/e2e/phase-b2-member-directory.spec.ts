import {readFileSync} from "node:fs";

import {expect, test} from "@playwright/test";

import {missingM2LiveEnvironment, signInForM2} from "../fixtures/m2-auth";

type Bundle = Readonly<{
  Members: Readonly<{
    title: string;
    filters: Readonly<{search: string; anyTag: string; submit: string}>;
  }>;
  Portal: Readonly<{
    companyProfile: Readonly<{save: string; saved: string; publish: string; submitted: string}>;
  }>;
  Admin: Readonly<{profilesReview: Readonly<{title: string; approve: string}>}>;
}>;

const bundle = (locale: "en" | "zh-HK") =>
  JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8")) as Bundle;

const locales = [
  {locale: "en" as const, prefix: ""},
  {locale: "zh-HK" as const, prefix: "/zh"},
];

const missing = missingM2LiveEnvironment();

// The tag facet is a closed vocabulary (S-4, `config/industry-tags.ts`); `ai` is its first slug,
// so the value is safe to hard-code while the label stays the component's business.
const TAG = "ai";

// The filter panel carries no class of its own — it is the only form on /members, and the closed
// `tag` select is what identifies it without depending on markup the design layer may restyle.
const FILTER_FORM = "form:has(select[name=tag])";

/**
 * Phase B2 exit checklist (docs/superpowers/plans/2026-09-09-phase-b2-member-directory.md, B-8):
 * the public directory renders and round-trips its industry filter through the URL (B-6), a member
 * page describes itself to crawlers with both `Organization` and `BreadcrumbList` (D-11), and a
 * company admin's page reaches the staff queue and goes live only after staff publish it (B-7).
 *
 * The anonymous cases run against any target and skip rather than fail on an empty directory —
 * every profile is opt-in and hidden by default (S-1), so "no members yet" is a legitimate state.
 * The publishing walk writes, so it runs only against the isolated M2 environment: the same
 * `missingM2LiveEnvironment()` gate the Phase A and B1 specs use, which demands `DATABASE_URL_TEST`
 * and the `M2_TEST_NEON_*` allowlist alongside the credentials and therefore cannot fire against a
 * shared or production database.
 */
for (const {locale, prefix} of locales) {
  const copy = bundle(locale);

  test(`${locale}: /members renders the directory heading and its filter form`, async ({page}) => {
    await page.goto(`${prefix}/members`);
    await expect(page.getByRole("heading", {level: 1, name: copy.Members.title})).toBeVisible();
    const filters = page.locator(FILTER_FORM);
    await expect(filters).toBeVisible();
    // The bundle owns every label; the empty option is the "no tag" state the repository reads as null.
    await expect(filters.locator("select[name=tag] option[value='']")).toHaveText(copy.Members.filters.anyTag);
    await expect(filters.getByLabel(copy.Members.filters.search)).toBeVisible();
    await expect(filters.getByRole("button", {name: copy.Members.filters.submit})).toBeVisible();
  });

  test(`${locale}: the industry filter round-trips through the URL`, async ({page}) => {
    await page.goto(`${prefix}/members`);
    const filters = page.locator(FILTER_FORM);
    await filters.locator("select[name=tag]").selectOption(TAG);
    await filters.getByRole("button", {name: copy.Members.filters.submit}).click();
    await expect(page).toHaveURL(new RegExp(`tag=${TAG}`));
    // Re-resolved after the GET submit replaced the document: the select's value is what proves the
    // server parsed the query back into the filter state, not the browser restoring the old form.
    await expect(page.locator(`${FILTER_FORM} select[name=tag]`)).toHaveValue(TAG);
  });

  test(`${locale}: a member page carries Organization and BreadcrumbList JSON-LD`, async ({page}) => {
    await page.goto(`${prefix}/members`);
    const first = page.locator(".partner-record-grid a[href*='/members/']").first();
    test.skip((await first.count()) === 0, "no published member pages on this target");
    await first.click();
    // Both blocks are `<script>` contents, so read text rather than visibility, and parse instead of
    // matching a substring: a company whose name happened to contain "Organization" would otherwise
    // pass a spec that the JSON-LD had gone missing.
    const payloads = await page.locator('script[type="application/ld+json"]').allTextContents();
    const types = payloads.map((payload) => (JSON.parse(payload) as Readonly<{"@type"?: string}>)["@type"]);
    expect(types).toContain("Organization");
    expect(types).toContain("BreadcrumbList");
  });
}

test.describe("member publishes a page and staff reviews it", () => {
  test.skip(missing.length > 0, `Requires ${missing.join(", ")}`);

  const copy = bundle("en");

  /**
   * One walk, not one per locale: a company has a single public profile, so a second pass would
   * find it already `pending_review` and the publish control correctly disabled. The locales are
   * covered where they differ — the published page is fetched under both prefixes at the end.
   */
  test("a company admin submits their public page and staff publishes it", async ({page, browser}) => {
    await signInForM2(page, "company-admin");
    await page.goto("/portal/company");
    // The company-details form above owns `displayName`; the member page's h1 is that same column,
    // so reading it here is what lets the last assertion name the company without a fixture constant.
    const name = await page.inputValue("input[name=displayName]");
    const slug = `e2e-member-${Date.now()}`;
    const profile = page.locator("form:has(input[name=slug])");
    await profile.locator("input[name=slug]").fill(slug);
    await profile.locator("input[name=taglineEn]").fill(`Playwright acceptance ${slug}`);
    // Two submit buttons post `intent=save|publish` from the one form; the bundle names them.
    await profile.getByRole("button", {name: copy.Portal.companyProfile.save}).click();
    await expect(profile.getByText(copy.Portal.companyProfile.saved)).toBeVisible();
    // Publish is offered only from `hidden` and `rejected` (B-7). A disabled button here means the
    // fixture company's page is already live or already queued — a fixture problem, not a product one.
    await profile.getByRole("button", {name: copy.Portal.companyProfile.publish}).click();
    await expect(profile.getByText(copy.Portal.companyProfile.submitted)).toBeVisible();

    const staffContext = await browser.newContext();
    const staffPage = await staffContext.newPage();
    await signInForM2(staffPage, "staff");
    await staffPage.goto("/admin/profiles-review");
    await expect(staffPage.getByRole("heading", {level: 1, name: copy.Admin.profilesReview.title})).toBeVisible();
    // The slug cell is the row's unique text; the queue holds every company awaiting review.
    const row = staffPage.locator("tr", {has: staffPage.getByText(slug, {exact: true})});
    await expect(row).toHaveCount(1);
    await expect(row.getByText(name)).toBeVisible();
    await row.getByRole("button", {name: copy.Admin.profilesReview.approve}).click();
    await expect(row).toHaveCount(0);
    await staffContext.close();

    for (const {prefix} of locales) {
      // 200, not just a rendered heading: until staff approved, this slug 404ed in both locales.
      const response = await page.goto(`${prefix}/members/${slug}`);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", {level: 1, name})).toBeVisible();
    }
  });
});
