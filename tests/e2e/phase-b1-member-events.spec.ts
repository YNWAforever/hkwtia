import {readFileSync} from "node:fs";

import {expect, test} from "@playwright/test";

import {missingM2LiveEnvironment, signInForM2} from "../fixtures/m2-auth";

type Bundle = Readonly<{
  Events: Readonly<{
    filters: Readonly<{apply: string; formats: Readonly<{online: string}>}>;
    guest: Readonly<{submit: string; registered: string; waitlist: string; already: string}>;
  }>;
  Portal: Readonly<{
    memberEvents: Readonly<{newTitle: string; submit: string; submitted: string; saveDraft: string; draftSaved: string}>;
  }>;
  Admin: Readonly<{eventsMgmt: Readonly<{review: Readonly<{title: string; approve: string}>}>}>;
}>;

const bundle = (locale: "en" | "zh-HK") =>
  JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8")) as Bundle;

const locales = [
  {locale: "en" as const, prefix: ""},
  {locale: "zh-HK" as const, prefix: "/zh"},
];

const missing = missingM2LiveEnvironment();

/**
 * Phase B1 exit checklist (docs/superpowers/plans/2026-09-09-phase-b1-member-events.md, B-8):
 * the public filter panel round-trips through the URL (B-6), the guest RSVP form validates
 * before it writes (B-4), and a company admin's submission reaches the staff review queue
 * (B-1, B-3) — in both locales. The anonymous cases run against any target; the publishing
 * walk needs the isolated M2 environment and skips with the missing variable names otherwise.
 */
for (const {locale, prefix} of locales) {
  const copy = bundle(locale);

  test(`${locale}: /events filter panel round-trips the format filter`, async ({page}) => {
    await page.goto(`${prefix}/events`);
    const format = page.locator("form.event-filter-panel select[name=format]");
    // The bundle owns the option label; the value is the enum the repository filters on.
    await expect(format.locator("option[value=online]")).toHaveText(copy.Events.filters.formats.online);
    await format.selectOption("online");
    await page.locator("form.event-filter-panel button[type=submit]").click();
    await expect(page).toHaveURL(/format=online/);
    await expect(page.locator("form.event-filter-panel select[name=format]")).toHaveValue("online");
  });

  test(`${locale}: guest RSVP form validates before writing`, async ({page}) => {
    // Any published rsvp event on the target; skip when the listing is empty.
    await page.goto(`${prefix}/events?status=open`);
    const first = page.locator(".event-library a[href*='/events/']").first();
    test.skip((await first.count()) === 0, "no open events on this target");
    await first.click();
    const form = page.locator("form.guest-rsvp-form");
    test.skip((await form.count()) === 0, "event is not open to guest RSVP");
    await form.locator("input[name=email]").fill("not-an-email");
    await form.getByRole("button", {name: copy.Events.guest.submit}).click();
    await expect(form.locator("#guest-rsvp-status")).toHaveClass(/form-error/);
  });
}

test.describe("member publishing and staff review", () => {
  test.skip(missing.length > 0, `Requires ${missing.join(", ")}`);

  for (const {locale, prefix} of locales) {
    const copy = bundle(locale);

    test(`${locale}: company admin submits an event and staff sees it in review`, async ({page, browser}) => {
      await signInForM2(page, "company-admin");
      await page.goto(`${prefix}/portal/events/new`);
      await expect(page.getByRole("heading", {level: 1, name: copy.Portal.memberEvents.newTitle})).toBeVisible();
      const slug = `e2e-${locale === "en" ? "en" : "zh"}-${Date.now()}`;
      await page.fill("input[name=slug]", slug);
      await page.fill("input[name=titleEn]", `E2E ${slug}`);
      await page.fill("textarea[name=descriptionEn]", "Playwright acceptance event");
      await page.fill("input[name=startsAt]", "2031-01-15T10:00");
      // Two submit buttons post `intent=draft|submit` from the same form; the bundle names them.
      await page.getByRole("button", {name: copy.Portal.memberEvents.saveDraft}).click();
      await expect(page.getByText(copy.Portal.memberEvents.draftSaved)).toBeVisible();
      // The submit button is disabled by design when the fixture company's plan carries no
      // event quota (Community); the M2 company-admin fixture is expected to hold Startup or
      // Corporate. A disabled button here is a fixture problem, not a product one.
      await page.getByRole("button", {name: copy.Portal.memberEvents.submit}).click();
      await expect(page.getByText(copy.Portal.memberEvents.submitted)).toBeVisible();

      const staffContext = await browser.newContext();
      const staffPage = await staffContext.newPage();
      await signInForM2(staffPage, "staff");
      await staffPage.goto(`${prefix}/admin/events-mgmt`);
      await expect(staffPage.getByRole("heading", {name: copy.Admin.eventsMgmt.review.title})).toBeVisible();
      await expect(staffPage.getByRole("link", {name: `E2E ${slug}`})).toBeVisible();
      await staffContext.close();
    });
  }
});
