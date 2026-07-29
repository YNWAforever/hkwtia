import {expect, test} from '@playwright/test';

for (const path of ['/', '/about', '/about/chairman', '/about/committees', '/membership', '/ai-ops']) {
  test(`${path} renders one English heading`, async ({page}) => {
    await page.goto(path);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toBeVisible();
  });

  test(`/zh${path === '/' ? '' : path} renders one Chinese heading`, async ({page}) => {
    await page.goto(`/zh${path === '/' ? '' : path}`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-HK');
    await expect(page.locator('h1')).toHaveCount(1);
  });
}
