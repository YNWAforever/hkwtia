import {expect, test} from "@playwright/test";

const locales = [
  {
    path: "/join?plan=startup",
    lang: "en",
    heading: "Join WTIA",
    steps: ["Choose plan", "Sign in", "Your profile", "Company details"],
  },
  {
    path: "/zh/join?plan=startup",
    lang: "zh-HK",
    heading: "加入 WTIA",
    steps: ["選擇計劃", "登入", "個人資料", "公司資料"],
  },
] as const;

for (const locale of locales) {
  test(`${locale.lang} join shows localized progress and a single heading`, async ({page}) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await page.goto(locale.path);

    await expect(page.locator("html")).toHaveAttribute("lang", locale.lang);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByRole("heading", {level: 1, name: locale.heading})).toBeVisible();
    for (const step of locale.steps) await expect(page.getByText(step, {exact: true})).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });
}

test("a forged completion status still renders anonymous authentication", async ({page}) => {
  await page.goto("/join?plan=community&status=complete&application=foreign-application");

  await expect(page.getByRole("heading", {level: 1, name: "Join WTIA"})).toBeVisible();
  await expect(page.getByRole("heading", {level: 1, name: "Welcome to WTIA"})).toHaveCount(0);
});
