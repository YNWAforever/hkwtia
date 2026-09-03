import {readFileSync} from "node:fs";

import {expect, test} from "@playwright/test";

// Read the launcher copy from the bundles rather than repeating it. WP-2 renamed
// `Concierge.launcher` from "Ask WTIA" to "Ask WiseTech", and a hard-coded label would have
// silently retired this matrix's hero-action/launcher overlap assertion instead of failing.
function conciergeLauncher(locale: "en" | "zh-HK"): string {
  const bundle = JSON.parse(
    readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8"),
  ) as {Concierge: {launcher: string}};
  return bundle.Concierge.launcher;
}

const featuredHistorySlug = "the-strategies-for-expanding-global-internet-of-things-iot-markets";
const runtimeOverlay = "[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay";

const homeCases = [
  {
    path: "/",
    h1: "Where can Hong Kong innovation go next?",
    imageAlt: "Hong Kong technology community",
    eventAction: "Find an event",
    membershipAction: "Explore membership",
    discoverAction: "Discover WiseTech",
    concierge: conciergeLauncher("en"),
    retiredStatsHeading: "A platform for the whole ecosystem",
    highlights: [
      {label: "Next event", empty: "No upcoming public event is available.", unavailable: "Event information is temporarily unavailable.", href: /^\/events(?:\/|$)/},
      {label: "Latest news", empty: "No published news is available.", unavailable: "News is temporarily unavailable.", href: /^\/news(?:\/|$)/},
      {label: "Member solution", empty: "No published member solution is available.", unavailable: "Member solutions are temporarily unavailable.", href: /^\/showcase(?:\/|$)/},
    ],
  },
  {
    path: "/zh",
    h1: "香港創新下一站，可以走多遠？",
    imageAlt: "香港創科社群",
    eventAction: "尋找活動",
    membershipAction: "探索會員服務",
    discoverAction: "探索 WiseTech",
    concierge: conciergeLauncher("zh-HK"),
    retiredStatsHeading: "服務整個創科生態",
    highlights: [
      {label: "下一場活動", empty: "暫時沒有即將舉行的公開活動。", unavailable: "活動資訊暫時未能提供。", href: /^\/zh\/events(?:\/|$)/},
      {label: "最新消息", empty: "暫時沒有已發布的消息。", unavailable: "消息資訊暫時未能提供。", href: /^\/zh\/news(?:\/|$)/},
      {label: "會員方案", empty: "暫時沒有已發布的會員方案。", unavailable: "會員方案資訊暫時未能提供。", href: /^\/zh\/showcase(?:\/|$)/},
    ],
  },
] as const;

const institutionalPaths = [
  "/about",
  "/about/chairman",
  "/about/committees",
  "/about/history",
  `/about/history/${featuredHistorySlug}`,
  "/programs/asa",
  "/programs/cpai",
  "/programs/hkict",
  "/programs/tct",
] as const;

function localizedPath(path: string, prefix: "" | "/zh") {
  return `${prefix}${path}`;
}

function rectanglesOverlap(
  a: {x: number; y: number; width: number; height: number},
  b: {x: number; y: number; width: number; height: number},
) {
  return !(
    a.x + a.width <= b.x
    || b.x + b.width <= a.x
    || a.y + a.height <= b.y
    || b.y + b.height <= a.y
  );
}

for (const homeCase of homeCases) {
  test(`${homeCase.path} renders the PR3 hero and three repository-backed highlight states`, async ({page}) => {
    const response = await page.goto(homeCase.path);
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("main#main-content")).toHaveCount(1);
    await expect(page.locator("main#main-content")).toBeVisible();
    await expect(page.locator("h1:visible")).toHaveCount(1);
    await expect(page.getByRole("heading", {level: 1, name: homeCase.h1})).toHaveCount(1);
    await expect(page.getByRole("heading", {level: 1, name: homeCase.h1})).toBeVisible();
    await expect(page.locator(runtimeOverlay)).toHaveCount(0);

    const hero = page.locator("section").filter({
      has: page.getByRole("heading", {level: 1, name: homeCase.h1}),
    }).first();
    await expect(hero.getByRole("img", {name: homeCase.imageAlt})).toBeVisible();
    await expect(hero.getByRole("link", {name: homeCase.eventAction})).toBeVisible();
    await expect(hero.getByRole("link", {name: homeCase.membershipAction})).toBeVisible();
    await expect(page.getByRole("heading", {name: homeCase.retiredStatsHeading})).toHaveCount(0);

    const cards = page.locator("#home-discover article");
    await expect(cards).toHaveCount(3);
    for (const highlight of homeCase.highlights) {
      const card = cards.filter({hasText: highlight.label});
      await expect(card, highlight.label).toHaveCount(1);
      const link = card.getByRole("link");
      await expect(link).toHaveCount(1);
      await expect(link).toHaveAttribute("href", highlight.href);

      const availableHeading = card.getByRole("heading", {level: 3});
      const available = await availableHeading.count() === 1;
      if (available) {
        await expect(availableHeading).toBeVisible();
      } else {
        const text = await card.innerText();
        expect(
          text.includes(highlight.empty) || text.includes(highlight.unavailable),
          `${highlight.label} must render available, empty, or unavailable state`,
        ).toBe(true);
      }
    }
  });

  for (const width of [375, 768, 1024, 1440]) {
    test(`${homeCase.path} fits ${width}px with 44px actions clear of Concierge`, async ({page}) => {
      await page.setViewportSize({width, height: 900});
      const response = await page.goto(homeCase.path);
      expect(response?.status()).toBeLessThan(400);

      const horizontalMetrics = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(horizontalMetrics.scrollWidth).toBeLessThanOrEqual(horizontalMetrics.clientWidth + 1);

      const hero = page.locator("section").filter({
        has: page.getByRole("heading", {level: 1, name: homeCase.h1}),
      }).first();
      const actions = hero.getByRole("link");
      await expect(actions).toHaveCount(3);
      const actionBoxes = await actions.evaluateAll((links) => links.map((link) => {
        const rect = link.getBoundingClientRect();
        return {x: rect.x, y: rect.y, width: rect.width, height: rect.height};
      }));
      for (const box of actionBoxes) {
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }

      const concierge = page.getByRole("button", {name: homeCase.concierge});
      await expect(concierge).toBeVisible();
      const conciergeBox = await concierge.boundingBox();
      expect(conciergeBox).not.toBeNull();
      for (const actionBox of actionBoxes) {
        expect(rectanglesOverlap(actionBox, conciergeBox!)).toBe(false);
      }

      await page.setViewportSize({width, height: 600});
      const discoverTarget = page.locator("#home-discover");
      const discoverLink = hero.getByRole("link", {name: homeCase.discoverAction});
      await expect(discoverLink).toBeInViewport();
      await expect(discoverTarget).not.toBeInViewport();
      await page.evaluate(() => {
        document.documentElement.dataset.testScrollEnded = "false";
        document.addEventListener("scrollend", () => {
          document.documentElement.dataset.testScrollEnded = "true";
        }, {once: true});
      });
      await discoverLink.click();
      await expect(page).toHaveURL(/#home-discover$/);
      await expect(page.locator("html")).toHaveAttribute("data-test-scroll-ended", "true");
      await expect(discoverTarget).toBeInViewport();

      const renderedHeader = page.locator('header[data-variant="solid"]');
      await expect(renderedHeader).toBeVisible();
      const [headerBox, targetBox] = await Promise.all([
        renderedHeader.boundingBox(),
        discoverTarget.boundingBox(),
      ]);
      expect(headerBox).not.toBeNull();
      expect(targetBox).not.toBeNull();
      expect(
        targetBox!.y,
        "the Discover target must clear the rendered sticky header",
      ).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height);
    });
  }
}

for (const path of institutionalPaths) {
  for (const prefix of ["", "/zh"] as const) {
    const route = localizedPath(path, prefix);
    test(`${route} preserves the PR3 public route contract`, async ({page}) => {
      const response = await page.goto(route);
      expect(response?.status()).toBeLessThan(400);
      await expect(page.locator(runtimeOverlay)).toHaveCount(0);
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("main#main-content")).toHaveCount(1);
      await expect(page.locator("main#main-content")).toBeVisible();
      await expect(page.locator("h1:visible")).toHaveCount(1);
    });
  }
}

for (const width of [375, 1440]) {
  test(`captures PR3 Home and programme review evidence at ${width}px`, async ({page}, testInfo) => {
    await page.setViewportSize({width, height: 900});
    for (const [name, path] of [["home", "/"], ["programme-asa", "/programs/asa"]] as const) {
      const response = await page.goto(path);
      expect(response?.status()).toBeLessThan(400);
      await expect(page.locator(runtimeOverlay)).toHaveCount(0);
      await page.screenshot({
        path: testInfo.outputPath(`${name}-${width}.png`),
        fullPage: true,
      });
    }
  });
}
