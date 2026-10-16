import {readFileSync} from "node:fs";

import {expect, test} from "@playwright/test";

import {finalAuditIsolatedDatabaseUrl} from "../fixtures/audit-isolated-db";
import {missingM2IdentityEnvironment, signInForM2} from "../fixtures/m2-auth";

type BillingCopy = Readonly<{
  billing: Readonly<{title: string; manage: string}>;
  plans: Readonly<{corporate: string}>;
  status: Readonly<{active: Readonly<{label: string}>}>;
}>;

function labels(locale: "en" | "zh-HK"): BillingCopy {
  const bundle = JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8")) as {Portal: BillingCopy};
  return bundle.Portal;
}

const missing = missingM2IdentityEnvironment();
test.describe("isolated active company billing entry", () => {
  test.skip(missing.length > 0, `Synthetic identity acceptance needs: ${missing.join(", ")}`);

  for (const {locale, prefix} of [
    {locale: "en" as const, prefix: ""},
    {locale: "zh-HK" as const, prefix: "/zh"},
  ]) {
    test(`${locale}: company billing manager can reach billing without starting payment`, async ({page}) => {
      if (!finalAuditIsolatedDatabaseUrl()) {
        test.skip(true, "Billing entry requires the exact isolated acceptance database and opt-in");
        return;
      }
      const copy = labels(locale);
      await signInForM2(page, "company-admin");
      const response = await page.goto(`${prefix}/portal/billing`);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", {level: 1, name: copy.billing.title})).toBeVisible();
      const corporate = page.locator("article", {hasText: copy.plans.corporate}).first();
      await expect(corporate).toContainText(copy.status.active.label);
      await expect(corporate.getByRole("button", {name: copy.billing.manage})).toBeVisible();
      if (locale === "en") await page.screenshot({path: "test-results/final-billing-company-en.png", fullPage: true});
    });
  }
});
