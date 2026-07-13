import {AxeBuilder} from '@axe-core/playwright';
import {expect, test} from '@playwright/test';

const pages = ['/', '/membership', '/zh', '/zh/membership', '/showcase', '/events'];

for (const path of pages) {
  test(`${path} has no serious or critical accessibility violations`, async ({page}) => {
    await page.goto(path);
    const results = await new AxeBuilder({page}).analyze();
    const seriousOrCritical = results.violations.filter((violation) =>
      violation.impact === 'serious' || violation.impact === 'critical',
    );
    expect(seriousOrCritical, JSON.stringify(seriousOrCritical, null, 2)).toEqual([]);
  });
}

test('skip link targets the main content landmark', async ({page}) => {
  await page.goto('/');
  const skipLink = page.locator('a.skip-link');

  await expect(skipLink).toHaveAttribute('href', '#main-content');
  await skipLink.focus();
  await expect(skipLink).toBeVisible();
  await expect(skipLink).toBeFocused();
  await skipLink.press('Enter');
  await expect(page).toHaveURL(/#main-content$/);
  await expect(page.locator('#main-content')).toBeVisible();
});

test('desktop keyboard navigation reaches primary navigation and locale switcher', async ({page}) => {
  await page.goto('/');
  await page.locator('nav[aria-label]').first().getByRole('link').first().focus();
  await expect(page.locator('nav[aria-label]').first().getByRole('link').first()).toBeFocused();

  const localeSwitcher = page.getByRole('button', {name: /switch to/i}).first();
  await localeSwitcher.focus();
  await expect(localeSwitcher).toBeFocused();
});

test('mobile keyboard navigation reaches the menu trigger', async ({page}) => {
  await page.setViewportSize({width: 375, height: 800});
  await page.goto('/');

  const menuTrigger = page.getByRole('button', {name: /menu|navigation/i}).first();
  await menuTrigger.focus();
  await expect(menuTrigger).toBeFocused();

  await menuTrigger.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
});
