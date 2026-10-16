import {readFileSync} from "node:fs";

import {expect, test} from "@playwright/test";

import {missingM2LiveEnvironment, signInForM2} from "../fixtures/m2-auth";

type Bundle = Readonly<{
  Join: Readonly<{choosePlanTitle: string; choosePlanCompare: string; invalidPlanDescription: string; plans: Readonly<Record<string, string>>}>;
  Interest: Readonly<{email: string; submit: string; success: string; website: string}>;
  Admin: Readonly<{inbox: Readonly<{title: string}>; tasks: Readonly<{title: string}>}>;
}>;

const bundle = (locale: "en" | "zh-HK") =>
  JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8")) as Bundle;

const locales = [
  {locale: "en" as const, prefix: ""},
  {locale: "zh-HK" as const, prefix: "/zh"},
];

/**
 * Phase A exit checklist (docs/superpowers/plans/2026-09-08-phase-a-foundation-and-funnel.md):
 * bare /join shows the plan chooser (F8), /events carries the interest form (F7), and the
 * inbox and task queue answer for the credential-gated admin fixture (F2), in both locales.
 */
for (const {locale, prefix} of locales) {
  const copy = bundle(locale);

  test(`${locale}: bare /join renders the plan chooser with four plans`, async ({page}) => {
    await page.goto(`${prefix}/join`);
    await expect(page.getByRole("heading", {level: 1, name: copy.Join.choosePlanTitle})).toBeVisible();
    for (const code of ["community", "startup", "corporate", "patron"]) {
      await expect(page.getByRole("heading", {level: 2, name: copy.Join.plans[code]})).toBeVisible();
    }
    await expect(page.getByRole("link", {name: copy.Join.choosePlanCompare})).toHaveAttribute("href", `${prefix}/membership`);
    // A malformed plan still gets the "unavailable" state rather than the chooser. Both
    // states share the same h1 string, so the description and the absent plan cards are
    // what tell them apart.
    await page.goto(`${prefix}/join?plan=gold`);
    await expect(page.getByText(copy.Join.invalidPlanDescription)).toBeVisible();
    await expect(page.getByRole("heading", {level: 2, name: copy.Join.plans.startup})).toHaveCount(0);
  });

  test(`${locale}: /events interest form acknowledges a submission`, async ({page}) => {
    await page.goto(`${prefix}/events#events-interest`);
    const form = page.locator("form.interest-form");
    await expect(form).toBeVisible();
    await form.getByLabel(copy.Interest.email).fill("phase-a-funnel@example.test");
    // Filling the honeypot makes the service acknowledge without writing a contact, so the
    // spec proves the wiring on any Preview without depending on that database's state.
    await form.locator('input[name="website"]').fill("http://spam.example", {force: true});
    await form.getByRole("button", {name: copy.Interest.submit}).click();
    await expect(form.getByText(copy.Interest.success)).toBeVisible();
  });
}

const missingEnvironment = missingM2LiveEnvironment();

test.describe("admin inbox and staff tasks", () => {
  test.skip(missingEnvironment.length > 0, `Requires ${missingEnvironment.join(", ")}`);

  for (const {locale, prefix} of locales) {
    const copy = bundle(locale);

    test(`${locale}: /admin/inbox and /admin/tasks render for staff`, async ({page}) => {
      await signInForM2(page, "staff");
      await page.goto(`${prefix}/admin/inbox`);
      await expect(page.getByRole("heading", {level: 1, name: copy.Admin.inbox.title})).toBeVisible();
      await page.goto(`${prefix}/admin/inbox?channel=whatsapp`);
      await expect(page.getByRole("heading", {level: 1, name: copy.Admin.inbox.title})).toBeVisible();
      await page.goto(`${prefix}/admin/tasks`);
      await expect(page.getByRole("heading", {level: 1, name: copy.Admin.tasks.title})).toBeVisible();
    });
  }
});
