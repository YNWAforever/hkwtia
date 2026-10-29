import {expect, test} from '../fixtures/preview-oidc';

// Minimal anonymous smoke against a Vercel-protected PR Preview (opt-in):
//   PLAYWRIGHT_PREVIEW_OIDC=true PLAYWRIGHT_BASE_URL=https://<preview>.vercel.app \
//     vercel env run -- npx playwright test tests/e2e/preview-oidc-anonymous-smoke.spec.ts
// Read-only: GETs public pages only. Traces off so request headers never reach test-results/.
test.use({storageState: {cookies: [], origins: []}, trace: 'off', video: 'off'});

const TIERS = ['community', 'startup', 'corporate', 'patron'];

test.beforeEach(async ({previewOidc}) => {
  test.skip(!previewOidc, 'Set PLAYWRIGHT_PREVIEW_OIDC=true with a Preview PLAYWRIGHT_BASE_URL');
});

test('Preview home renders past Deployment Protection', async ({page, baseURL}) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('h1')).toHaveCount(1);
});

for (const path of ['/membership', '/zh/membership']) {
  test(`Preview ${path} lists the four membership tiers`, async ({page, baseURL}) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('.plan-grid article')).toHaveCount(TIERS.length);
    expect(await page.locator('.plan-grid article').evaluateAll((cards) => cards.map((card) => card.id))).toEqual(TIERS);
  });
}
