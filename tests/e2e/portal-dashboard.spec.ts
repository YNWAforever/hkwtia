import {expect, test} from "@playwright/test";

const locales = [
  {path: "/portal", lang: "en", loginPath: "/join"},
  {path: "/zh/portal", lang: "zh-HK", loginPath: "/zh/join"},
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
  await expect(page.getByText("Membership status", {exact: true})).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp("/join\\?next=%2Fportal"));
});

test("an anonymous portal never exposes company controls", async ({page}) => {
  await page.goto("/portal");

  await expect(page).toHaveURL(new RegExp("/join\\?next=%2Fportal"));
  await expect(page.getByText("Company members", {exact: true})).toHaveCount(0);
});
