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

/**
 * The case above opens /zh, where no group is current, so it never renders a trigger with
 * `data-current="true"` — a colour path of its own. Tailwind emits AccordionTrigger's
 * `data-[current=true]:text-shell-blue` as `.data-\[current\=true\]\:text-shell-blue[data-current="true"]`,
 * specificity (0,2,0), which outranks the companion sheet's `.mobile-accordion > h3 > button
 * { color: white }` (0,1,2); `.event-first` (0,2,2) shields the events group, so only a route
 * inside one of the other three groups reaches it.
 *
 * The contrast half is computed here rather than left to axe, because **axe cannot score any
 * text in this dialog**: `.mobile-menu`'s background is a `linear-gradient`, so axe-core files
 * every node inside it under `results.incomplete` with `messageKey: "bgGradient"` and
 * `contrastRatio: 0` instead of under `results.violations`, and `expectNoSeriousOrCritical`
 * reads violations only. An axe assertion here would be permanently vacuous. This measures the
 * ratio the way axe would if it could — the trigger's colour against every stop of the panel
 * gradient, worst stop deciding — so a regression to `--shell-blue` (2.17:1) fails loudly.
 */
test("the current mobile group passes axe and keeps AA contrast on the donor gradient", async ({page}) => {
  await page.setViewportSize({width: 375, height: 800});
  await page.goto("/zh/membership");
  await page.getByRole("button", {name: "開啟導覽選單"}).click();
  const group = page.getByRole("button", {name: "會員與創科生態"});
  // Without `data-current` this case covers nothing the one above does not, so assert the
  // precondition rather than letting a future route change make it vacuous.
  await expect(group).toHaveAttribute("data-current", "true");

  const reading = await group.evaluate((trigger) => {
    const rgb = (value: string) => (value.match(/\d+/g) ?? []).slice(0, 3).map(Number);
    const relative = (channels: number[]) => {
      const linear = channels.map((channel) => {
        const scaled = channel / 255;
        return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const contrast = (a: number[], b: number[]) => {
      const [light, dark] = [relative(a), relative(b)].sort((x, y) => y - x);
      return (light + 0.05) / (dark + 0.05);
    };
    const colour = getComputedStyle(trigger).color;
    const panel = trigger.closest(".mobile-menu") as HTMLElement;
    const stops = (getComputedStyle(panel).backgroundImage.match(/rgba?\([^)]+\)/g) ?? []).map(rgb);
    return {
      colour,
      stops: stops.map((stop) => `rgb(${stop.join(", ")})`),
      // A flat background would leave this empty; the assertion below then fails and says so,
      // rather than silently passing on an empty `Math.min`.
      worst: stops.length === 0 ? 0 : Math.min(...stops.map((stop) => contrast(rgb(colour), stop))),
    };
  });

  expect(reading.stops.length, JSON.stringify(reading)).toBeGreaterThan(0);
  expect(reading.worst, JSON.stringify(reading)).toBeGreaterThanOrEqual(4.5);

  await group.click();
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
