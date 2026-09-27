import {expect, test} from '@playwright/test';

for (const prefix of ['', '/zh']) {
  test(`${prefix || 'en'}: long home sections defer layout and reveal on keyboard focus`, async ({page}) => {
    await page.setViewportSize({width: 390, height: 844});
    await page.goto(prefix || '/');
    const heading = page.locator('#programmes h2');
    await expect(heading).toHaveCount(1);
    // checkVisibility reads skipped rendering without forcing the descendant's layout.
    await expect.poll(() => heading.evaluate((element) => element.checkVisibility({contentVisibilityAuto: true}))).toBe(false);
    await expect(page.locator('main > .hero')).toHaveCSS('content-visibility', 'visible');
    await expect(page.locator('h1')).toBeInViewport();
    // End sections must retain their real height so accessibility measurement and
    // footer placement never use a placeholder that can overlap visible content.
    await expect(page.locator('.archive-proof')).toHaveCSS('content-visibility', 'visible');
    await expect(page.locator('.conversion-section')).toHaveCSS('content-visibility', 'visible');

    const link = page.locator('#programmes a').first();
    // Follow the real tab order from the page start. This also exercises intermediate
    // skipped sections; jumping with DOM focus during initial hydration can be reset
    // by Next's navigation focus handler before a person could reach this link.
    let tabs = 0;
    while (tabs < 160 && !await link.evaluate((element) => element === document.activeElement)) {
      await page.keyboard.press('Tab');
      tabs += 1;
    }
    expect(tabs).toBeLessThan(160);
    await expect(link).toBeFocused();
    await expect(link).toBeInViewport();
    await expect.poll(() => heading.evaluate((element) => element.checkVisibility({contentVisibilityAuto: true}))).toBe(true);
    await page.keyboard.press('Tab');
    await expect(page.locator('#programmes a').nth(1)).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  test(`${prefix || 'en'}: programme anchors reveal their sections and print includes the full page`, async ({page}) => {
    await page.setViewportSize({width: 390, height: 844});
    await page.goto(`${prefix}/programmes`);
    const history = page.locator('#programmes-history-title');
    await expect.poll(() => history.evaluate((element) => element.checkVisibility({contentVisibilityAuto: true}))).toBe(false);
    await expect(page.locator('main > .page-hero')).toHaveCSS('content-visibility', 'visible');
    await page.locator('a[href="#history"]').click();
    await expect(history).toBeInViewport();
    await expect.poll(() => history.evaluate((element) => element.checkVisibility({contentVisibilityAuto: true}))).toBe(true);

    await page.emulateMedia({media: 'print'});
    const sections = page.locator('main > section');
    expect(await sections.count()).toBeGreaterThanOrEqual(5);
    for (const section of await sections.all()) {
      await expect(section).toHaveCSS('content-visibility', 'visible');
      await expect(section).toHaveCSS('contain-intrinsic-block-size', 'none');
    }
    expect(await page.locator('main h2').evaluateAll((elements) => elements.every((element) => element.checkVisibility({contentVisibilityAuto: true})))).toBe(true);
  });

  test(`${prefix || 'en'}: membership FAQ remains available on direct fragment navigation`, async ({page}) => {
    await page.setViewportSize({width: 390, height: 844});
    await page.goto(`${prefix}/membership#faq`);
    await expect(page.locator('#membership-faq-title')).toBeInViewport();
    await expect(page.locator('#faq dd')).toHaveCount(9);
    await expect.poll(() => page.locator('#faq dd').evaluateAll((elements) => elements.every((element) => element.checkVisibility({contentVisibilityAuto: true})))).toBe(true);
    await expect(page.locator('main > .page-hero')).toHaveCSS('content-visibility', 'visible');
  });
}
