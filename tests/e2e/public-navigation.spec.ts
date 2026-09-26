import {AxeBuilder} from "@axe-core/playwright";
import {expect, test} from "@playwright/test";

const locales = [
  {prefix: "", memberLink: "Discover members", showcaseLink: "Explore solutions", faq: "Membership FAQ"},
  {prefix: "/zh", memberLink: "探索會員", showcaseLink: "探索解決方案", faq: "會員常見問題"},
] as const;

for (const {prefix, memberLink, showcaseLink, faq} of locales) {
  test(`${prefix || "en"}: home destinations, member directory, showcase and answered FAQ`, async ({page}) => {
    const response = await page.goto(prefix || "/");
    expect(response?.status()).toBe(200);
    await expect(page.locator(".directory-panel").getByRole("link", {name: memberLink})).toHaveAttribute("href", `${prefix}/members`);
    await expect(page.locator(".marketplace-panel").getByRole("link", {name: showcaseLink})).toHaveAttribute("href", `${prefix}/showcase`);
    await page.goto(`${prefix}/members`);
    await expect(page.getByRole("main").getByRole("heading", {level: 1})).toBeVisible();
    await page.goto(`${prefix}/showcase`);
    await expect(page.getByRole("main").getByRole("heading", {level: 1})).toBeVisible();
    await page.goto(`${prefix}/membership#faq`);
    await expect(page.getByRole("heading", {name: faq, exact: true}).last()).toBeVisible();
    await expect(page.locator("#faq dt")).toHaveCount(9);
    await expect(page.locator("#faq dd")).toHaveCount(9);
  });

  for (const width of [390, 768, 1440]) {
    test(`${prefix || "en"}: public home and membership fit ${width}px`, async ({page}) => {
      await page.setViewportSize({width, height: 900});
      for (const path of [prefix || "/", `${prefix}/membership`]) {
        await page.goto(path);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
        const heading = page.getByRole("main").getByRole("heading", {level: 1});
        await expect(heading).toBeVisible();
        expect(await heading.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      }
    });
  }

  test(`${prefix || "en"}: membership FAQ and navigation have no serious axe findings`, async ({page}) => {
    await page.goto(`${prefix}/membership`);
    const result = await new AxeBuilder({page}).analyze();
    expect(result.violations.filter(({impact}) => impact === "serious" || impact === "critical")).toEqual([]);
  });
}

const authAvailable = Boolean(process.env.NEON_AUTH_BASE_URL?.trim() && process.env.NEON_AUTH_COOKIE_SECRET?.trim());
for (const prefix of ["", "/zh"] as const) {
  test(`${prefix || "en"}: member login keeps safe return and recovery paths`, async ({page}) => {
    test.skip(!authAvailable, "Neon Auth pair is required to load the member login route");
    await page.goto(`${prefix}/member-login?next=%2Fportal%2Fbilling`);
    const form = page.getByTestId("member-login-form");
    await expect(form).toHaveAttribute("data-continuation", "/portal/billing");
    await expect(page.getByRole("link", {name: /join|加入/i})).toHaveAttribute("href", `${prefix}/join`);
    await expect(page.getByRole("link", {name: /support|支援/i})).toHaveAttribute("href", /mailto:/);
    await page.goto(`${prefix}/member-login?next=%2Fadmin`);
    await expect(page.getByTestId("member-login-form")).toHaveAttribute("data-continuation", "/portal");
  });
}
