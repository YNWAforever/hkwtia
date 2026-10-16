import {readFileSync} from "node:fs";

import {expect, test} from "@playwright/test";

// Strings only the signed-in dashboard renders, read from the bundle so a copy change cannot leave
// this guard asserting the absence of text that no longer exists anywhere (it once checked the
// retired "Membership status", which made the assertion pass vacuously).
const en = JSON.parse(readFileSync(new URL("../../messages/en.json", import.meta.url), "utf8")) as typeof import("../../messages/en.json");
const privateDashboardText = [en.Portal.nextStep.label, en.Portal.glance.title];

const locales = [
  {path: "/portal", lang: "en", loginPath: "/member-login"},
  {path: "/zh/portal", lang: "zh-HK", loginPath: "/zh/member-login"},
] as const;

for (const locale of locales) {
  test(`${locale.lang} protects the member portal with a locale-aware continuation`, async ({page}) => {
    await page.goto(locale.path);

    await expect(page).toHaveURL(new RegExp(`${locale.loginPath}\\?next=`));
    await expect(page.locator("html")).toHaveAttribute("lang", locale.lang);
    await expect(page.getByRole("heading", {level: 1})).toHaveCount(1);
  });
}

test("portal navigation does not expose a private dashboard to an anonymous user", async ({page}) => {
  const response = await page.goto("/portal");

  expect(response?.status()).toBeLessThan(400);
  for (const text of privateDashboardText) await expect(page.getByText(text, {exact: true})).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp("/member-login\\?next=%2Fportal"));
});

test("an anonymous portal never exposes company controls", async ({page}) => {
  await page.goto("/portal");

  await expect(page).toHaveURL(new RegExp("/member-login\\?next=%2Fportal"));
  await expect(page.getByText("Company members", {exact: true})).toHaveCount(0);
});
