import {expect, test} from '@playwright/test';

const paths = [
  '/showcase', '/launchpad', '/ai-ops', '/events', '/news', '/programmes', '/partners',
  '/about', '/about/chairman', '/about/committees', '/about/history',
  // Every featured milestone, which is exactly the set with a detail page. Keep in
  // step with `featured: true` in content/milestones.ts — tests/unit/history-detail
  // pins that list, and this matrix is the deployed-route check over the same set.
  '/about/history/2001-establishment-of-wtia',
  '/about/history/2014-wi-fi-hk',
  '/about/history/the-strategies-for-expanding-global-internet-of-things-iot-markets',
  '/about/history/new-term-of-executive-committee-2022-2024',
  '/about/history/wtia-21st-anniversary-celebration-and-inauguration-gala-dinner',
  '/about/history/asia-smart-innovation-awards-2025',
  '/programs/cpai', '/programs/hkict', '/programs/tct', '/programs/asa',
  '/contact', '/privacy', '/ai-transparency'
];

for (const path of paths) {
  for (const prefix of ['', '/zh']) {
    test(`${prefix}${path} renders one public heading`, async ({page}) => {
      const response = await page.goto(`${prefix}${path}`);
      expect(response?.status()).toBeLessThan(400);
      await expect(page.locator('body')).not.toContainText(
        'Missing required production environment variables',
      );
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toBeVisible();
    });
  }
}
