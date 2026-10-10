/**
 * The personal-invite pages, measured in a real browser. RUN THE FIXTURE WRITER FIRST:
 *
 *   npx vitest run tests/unit/join-invite-render-fixtures.test.tsx
 *   PLAYWRIGHT_BASE_URL=http://localhost:9 npx playwright test tests/e2e/join-invite.spec.ts --project=chromium
 *
 * The page needs the database and next-intl's request scope, so the Vitest file renders it against
 * mocked reads and writes static HTML to .tmp/join-invite-fixtures/. This spec loads each with the
 * compiled stylesheet (the (join) route group loads globals.css only). No server is involved.
 */
import {execSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';

import {expect, test, type Page} from '@playwright/test';

const fixtureDir = resolve(process.cwd(), '.tmp/join-invite-fixtures');
const shotDir = resolve(process.cwd(), 'test-results/join-invite');
const viewports = [{width: 1440, height: 900}, {width: 390, height: 844}] as const;
const locales = ['en', 'zh'] as const;

let css = '';

test.beforeAll(() => {
  mkdirSync(shotDir, {recursive: true});
  const compiled = resolve(shotDir, 'app.css');
  execSync(`npx tailwindcss -c tailwind.config.ts -i app/globals.css -o "${compiled}"`, {stdio: 'pipe'});
  css = readFileSync(compiled, 'utf8');
});

async function load(page: Page, name: string, viewport: {width: number; height: number}) {
  const file = resolve(fixtureDir, `${name}.html`);
  // Fail, never skip: a missing fixture would otherwise pass the whole gate vacuously.
  if (!existsSync(file)) {
    throw new Error(`Missing fixture ${file}. Run \`npx vitest run tests/unit/join-invite-render-fixtures.test.tsx\` first.`);
  }
  await page.route(/^https?:/, (route) => route.abort());
  await page.setViewportSize(viewport);
  await page.setContent(readFileSync(file, 'utf8').replace('</head>', `<style>${css}</style></head>`));
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'page scrolls sideways').toBeLessThanOrEqual(0);
}

for (const locale of locales) {
  for (const viewport of viewports) {
    test(`welcome page ${locale} at ${viewport.width}: no sideways scroll, Continue is at least 44px tall`, async ({page}) => {
      await load(page, `welcome-${locale}`, viewport);
      await expectNoHorizontalScroll(page);
      const cta = page.locator('a[href$="/continue"]');
      await expect(cta).toHaveCount(1);
      const box = await cta.boundingBox();
      expect(box!.height, 'Continue control height').toBeGreaterThanOrEqual(44);
      await page.screenshot({path: resolve(shotDir, `welcome-${locale}-${viewport.width}.png`), fullPage: true});
    });

    test(`invalid page ${locale} at ${viewport.width}: shows no contact data and does not scroll sideways`, async ({page}) => {
      await load(page, `invalid-${locale}`, viewport);
      await expectNoHorizontalScroll(page);
      const text = await page.locator('main').innerText();
      expect(text).not.toContain('Chan Tai Man');
      expect(text).not.toContain('Willy');
      expect(text).not.toContain('HK$');
      await expect(page.locator('a[href$="/continue"]')).toHaveCount(0);
      for (const link of await page.locator('main a').all()) {
        const box = await link.boundingBox();
        expect(box!.height, 'link target height').toBeGreaterThanOrEqual(44);
      }
    });
  }
}
