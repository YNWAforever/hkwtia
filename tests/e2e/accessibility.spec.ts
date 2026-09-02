import {AxeBuilder} from "@axe-core/playwright";
import {expect, test} from "@playwright/test";

const featuredHistorySlug = "the-strategies-for-expanding-global-internet-of-things-iot-markets";
const pages = [
  "/", "/events", "/membership", "/news", "/about", "/about/chairman",
  `/about/history/${featuredHistorySlug}`, "/programs/asa",
  "/zh", "/zh/events", "/zh/membership", "/zh/news", "/zh/about", "/zh/about/chairman",
  `/zh/about/history/${featuredHistorySlug}`, "/zh/programs/asa",
];

async function expectNoSeriousOrCritical(page: import("@playwright/test").Page) {
  await expect(page.locator("main#main-content")).toBeVisible();
  await expect(page.locator("[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay")).toHaveCount(0);
  const results = await new AxeBuilder({page}).analyze();
  const violations = results.violations.filter(({impact}) => impact === "serious" || impact === "critical");
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
}

for (const path of pages) {
  test(`${path} has no serious or critical accessibility violations`, async ({page}) => {
    await page.goto(path);
    await expectNoSeriousOrCritical(page);
  });
}

test("open desktop and mobile navigation surfaces pass axe", async ({page}) => {
  // Above the ported `@media(max-width:1240px)` collapse (app/styles/wisetech.css:1085-1090);
  // at 1120 the trigger is `display: none` and the click would assert nothing.
  await page.setViewportSize({width: 1360, height: 900});
  await page.goto("/");
  await page.getByRole("navigation", {name: "Primary navigation"}).getByRole("button").first().click();
  await expectNoSeriousOrCritical(page);

  await page.setViewportSize({width: 375, height: 800});
  await page.goto("/zh");
  await page.getByRole("button", {name: "開啟導覽選單"}).click();
  await page.getByRole("button", {name: "活動及計劃"}).click();
  await expectNoSeriousOrCritical(page);
});

test("skip link targets the sole main content landmark", async ({page}) => {
  await page.goto("/");
  const skipLink = page.locator("a.skip-link");
  await expect(skipLink).toHaveAttribute("href", "#main-content");
  await skipLink.focus();
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await skipLink.press("Enter");
  await expect(page).toHaveURL(/#main-content$/);
  await expect(page.locator("main#main-content")).toHaveCount(1);
});
