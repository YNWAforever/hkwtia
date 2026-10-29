import AxeBuilder from '@axe-core/playwright';
import {expect, test} from '../fixtures/preview-oidc';
import {homeContrast, settleAnimations} from '../fixtures/anon-acceptance-helpers';

// Opt-in anonymous acceptance against a Vercel-protected PR Preview (UC22-01/03/55 Preview gap):
//   PLAYWRIGHT_PREVIEW_OIDC=true PLAYWRIGHT_BASE_URL=https://<preview>.vercel.app \
//     vercel env run -- npx playwright test tests/e2e/preview-oidc-anonymous-acceptance.spec.ts
// Read-only GETs plus in-page keyboard/anchor/locale clicks. Mirrors the local
// hkwtia-anonymous-acceptance spec, except: no concierge POST (provider call), no local-DB
// directory preflight, and protected-route boundaries are checked in the browser only (an
// APIRequestContext would not carry the origin-scoped OIDC header). Traces/video off.
test.use({storageState: {cookies: [], origins: []}, trace: 'off', video: 'off'});

test.beforeEach(async ({previewOidc}) => {
  test.skip(!previewOidc, 'Set PLAYWRIGHT_PREVIEW_OIDC=true with a Preview PLAYWRIGHT_BASE_URL');
});

const TIERS = ['community', 'startup', 'corporate', 'patron'];
const paths = ['/', '/about', '/about/chairman', '/about/committees', '/membership', '/ai-ops', '/contact', '/members'];
// Vercel's Preview toolbar is injected on Preview deployments only; it is not product UI.
const axeFor = (page: import('@playwright/test').Page) => new AxeBuilder({page}).exclude('vercel-live-feedback');

for (const prefix of ['', '/zh']) for (const width of [375, 768, 1024, 1440]) {
  test(`Preview ${prefix || 'en'} ${width} public render, keyboard and axe`, async ({page, baseURL}, info) => {
    await page.setViewportSize({width, height: 900});
    const records = [];
    for (const path of paths) {
      const response = await page.goto(prefix + (path === '/' ? '' : path) || '/');
      expect(response?.status()).toBe(200);
      expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('main#main-content')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.keyboard.press('Tab');
      await expect(page.locator('a.skip-link')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/#main-content$/);
      await settleAnimations(page);
      const contrast = path === '/' ? await homeContrast(page) : undefined;
      const axe = await axeFor(page).analyze();
      records.push({path, status: response?.status(), contrast, axe: axe.violations.map(v => ({id: v.id, impact: v.impact}))});
      expect.soft(axe.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
    }
    await info.attach('observations', {body: JSON.stringify(records), contentType: 'application/json'});
  });
}

for (const prefix of ['', '/zh']) {
  test(`Preview ${prefix || 'en'} membership four tiers, help and anchor`, async ({page}) => {
    await page.goto(prefix + '/membership');
    expect(await page.locator('.plan-grid article').evaluateAll(cards => cards.map(card => card.id))).toEqual(TIERS);
    for (const code of TIERS) await expect(page.locator(`#${code} h2`)).toBeVisible();
    await page.locator('a[href="#plans"]').click();
    await expect(page).toHaveURL(/#plans$/);
    await expect(page.locator('#membership-faq-title')).toBeVisible();
    expect(await page.locator('main a[href="' + prefix + '/contact"]').count()).toBeGreaterThan(0);
  });

  test(`Preview ${prefix || 'en'} anonymous protected boundaries`, async ({page}, info) => {
    const records = [];
    for (const path of ['/admin', '/admin/members', '/portal', '/portal/company']) {
      const response = await page.goto(prefix + path);
      expect(response?.status()).toBe(200);
      const landed = new URL(page.url());
      expect(landed.pathname).toBe(prefix + (path.startsWith('/admin') ? '/admin-login' : '/member-login'));
      expect(landed.searchParams.get('next')).toBe(path);
      records.push({path: prefix + path, destination: landed.pathname + landed.search});
    }
    await info.attach('boundaries', {body: JSON.stringify(records), contentType: 'application/json'});
  });

  test(`Preview ${prefix || 'en'} reduced-motion home axe`, async ({page}) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.goto(prefix || '/');
    await settleAnimations(page);
    await homeContrast(page);
    const axe = await axeFor(page).analyze();
    expect(axe.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  });
}

test('Preview locale round-trip retains query/hash and localized hrefs', async ({page, baseURL}) => {
  const origin = new URL(baseURL!).origin;
  await page.goto('/membership?evidence=anonymous#plans');
  await page.getByRole('button', {name: 'Switch to Chinese'}).first().click();
  await expect(page).toHaveURL(`${origin}/zh/membership?evidence=anonymous#plans`);
  expect(await page.locator('main a[href^="/zh/contact"]').count()).toBeGreaterThan(0);
  await page.getByRole('button', {name: 'Switch to English'}).first().click();
  await expect(page).toHaveURL(`${origin}/membership?evidence=anonymous#plans`);
});
