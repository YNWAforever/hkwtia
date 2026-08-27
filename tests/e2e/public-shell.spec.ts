import {expect, test} from "@playwright/test";

test("desktop navigation supports trigger traversal, open, Escape, active state, and focus return", async ({page}, testInfo) => {
  await page.setViewportSize({width: 1120, height: 900});
  await page.goto("/events");
  const nav = page.getByRole("navigation", {name: "Primary navigation"});
  const triggers = nav.getByRole("button");
  await expect(triggers).toHaveCount(4);
  await expect(triggers).toHaveText([
    /Events & Programmes/, /Membership & Ecosystem/, /Impact & Insights/, /About WTIA/,
  ]);

  await triggers.nth(0).focus();
  await triggers.nth(0).press("ArrowRight");
  await expect(triggers.nth(1)).toBeFocused();
  await triggers.nth(1).press("End");
  await expect(triggers.nth(3)).toBeFocused();
  await triggers.nth(3).press("Home");
  await expect(triggers.nth(0)).toBeFocused();
  await triggers.nth(0).press("ArrowDown");
  await expect(page.getByRole("link", {name: "Events", exact: true}).first()).toBeVisible();
  await expect(page.getByRole("link", {name: "Events", exact: true}).first()).toHaveAttribute("aria-current", "page");
  await page.screenshot({path: testInfo.outputPath("desktop-events-menu.png"), fullPage: true});
  await page.keyboard.press("Escape");
  await expect(triggers.nth(0)).toBeFocused();
});

test("mobile Sheet traps focus, resets Accordion, closes on navigation, and restores the trigger", async ({page}, testInfo) => {
  await page.setViewportSize({width: 375, height: 800});
  await page.goto("/zh/events");
  const trigger = page.getByRole("button", {name: "開啟導覽選單"});
  await trigger.focus();
  await trigger.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (let index = 0; index < 16; index += 1) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
  }
  await page.keyboard.press("Shift+Tab");
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
  await expect(dialog.getByRole("link", {name: "尋找活動"})).toHaveAttribute("href", "/zh/events");
  await expect(dialog.getByRole("link", {name: "加入 WiseTech"})).toHaveAttribute("href", "/zh/join");
  const group = dialog.getByRole("button", {name: "活動及計劃"});
  await group.click();
  await expect(dialog.getByRole("link", {name: "活動", exact: true})).toHaveAttribute("aria-current", "page");
  await page.screenshot({path: testInfo.outputPath("mobile-zh-navigation.png"), fullPage: true});
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(page.getByRole("button", {name: "活動及計劃"})).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Escape");
});

test("captures all four open desktop menu shapes", async ({page}, testInfo) => {
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto("/");
  const triggers = page.getByRole("navigation", {name: "Primary navigation"}).getByRole("button");
  const names = ["events-programmes", "membership-ecosystem", "impact-insights", "about-wtia"];
  for (let index = 0; index < names.length; index += 1) {
    await triggers.nth(index).click();
    await expect(triggers.nth(index)).toHaveAttribute("aria-expanded", "true");
    await page.screenshot({path: testInfo.outputPath(`desktop-${names[index]}.png`), fullPage: true});
    await page.keyboard.press("Escape");
  }
});

for (const localeCase of [
  {path: "/", open: "Open navigation", group: "Events & Programmes", file: "mobile-en-navigation.png"},
  {path: "/zh", open: "開啟導覽選單", group: "活動及計劃", file: "mobile-zh-navigation-review.png"},
] as const) {
  test(`captures ${localeCase.path} mobile Sheet review evidence`, async ({page}, testInfo) => {
    await page.setViewportSize({width: 375, height: 800});
    await page.goto(localeCase.path);
    await page.getByRole("button", {name: localeCase.open}).click();
    await page.getByRole("button", {name: localeCase.group}).click();
    await page.screenshot({path: testInfo.outputPath(localeCase.file), fullPage: true});
  });
}

for (const width of [320, 375, 768, 1120, 1440]) {
  for (const path of ["/", "/zh"]) {
    test(`${path} shell fits ${width}px and keeps 44px controls`, async ({page}) => {
      await page.setViewportSize({width, height: 900});
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);

      if (width < 1024) {
        const trigger = page.getByRole("button", {name: /open navigation|開啟導覽選單/i});
        const box = await trigger.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(box?.height).toBeGreaterThanOrEqual(44);
        await trigger.click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toContainText(/Find an event|尋找活動/);
        const priorityActions = dialog.getByTestId("mobile-priority-actions").getByRole("link");
        for (let index = 0; index < await priorityActions.count(); index += 1) {
          const actionBox = await priorityActions.nth(index).boundingBox();
          expect(actionBox?.height).toBeGreaterThanOrEqual(44);
        }
        if (path === "/zh") {
          const groupButtons = dialog.getByRole("button", {expanded: false});
          for (let index = 0; index < await groupButtons.count(); index += 1) {
            expect(await groupButtons.nth(index).evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
          }
        }
      } else {
        await expect(page.getByRole("navigation", {name: /Primary navigation|主要導覽/})).toBeVisible();
      }
    });
  }
}

test("locale switch preserves path, repeated query values, and fragment", async ({page}) => {
  await page.goto("/events?topic=ai&topic=cloud#main-content");
  await page.getByRole("button", {name: "Switch to Chinese"}).first().click();
  await expect(page).toHaveURL(/\/zh\/events\?topic=ai&topic=cloud#main-content$/);
  await page.setViewportSize({width: 1120, height: 900});
  await expect(page.getByRole("button", {name: "活動及計劃"})).toHaveAttribute("data-current", "true");
});

for (const [path, group] of [
  ["/events", "Events & Programmes"],
  ["/showcase", "Membership & Ecosystem"],
  ["/ai-ops", "Impact & Insights"],
  ["/about/history", "About WTIA"],
] as const) {
  test(`${path} marks ${group} as the active group`, async ({page}) => {
    await page.setViewportSize({width: 1120, height: 900});
    await page.goto(path);
    await expect(page.getByRole("button", {name: group})).toHaveAttribute("data-current", "true");
  });
}