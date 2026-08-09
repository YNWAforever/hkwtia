import {expect, test} from '@playwright/test';

const paths = [
  '/showcase', '/launchpad', '/ai-ops', '/events', '/news',
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
