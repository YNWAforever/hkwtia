// WP-0 measures visual drift before any pixel change lands: these screenshots are
// the "before" every later work package is diffed against. The spec skips wherever
// no baselines are committed for the current platform (CI included) unless
// WISETECH_VISUAL_BASELINE=1 opts in, because rendering differs per platform —
// hence {platform} in the snapshot file name (see playwright.config.ts). It also
// skips whenever PLAYWRIGHT_BASE_URL targets an external server, since the
// baselines are empty-database renders of the managed dev server and have
// nothing valid to compare against elsewhere. The Next dev indicator is hidden
// before capture because it is not part of the design and changes state while
// `next dev` compiles.
import {existsSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {expect, test, type Page} from '@playwright/test';

test.use({contextOptions: {reducedMotion: 'reduce'}});

test.skip(
  Boolean(process.env.PLAYWRIGHT_BASE_URL),
  'Visual baselines are captured against the managed dev server with an empty database; a PLAYWRIGHT_BASE_URL target has nothing valid to compare against.'
);

const baselineDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '__screenshots__/wisetech-visual-baseline'
);
const platformHasBaselines =
  existsSync(baselineDir) &&
  readdirSync(baselineDir).some(
    (file) => file.startsWith(`home-en-desktop-1440-${process.platform}-`) && file.endsWith('.png')
  );

test.skip(
  !platformHasBaselines && !process.env.WISETECH_VISUAL_BASELINE,
  `No visual baselines are committed for ${process.platform}; set WISETECH_VISUAL_BASELINE=1 and run with --update-snapshots to capture them on this platform.`
);

const routes = [
  {slug: 'home', path: '/'},
  {slug: 'events', path: '/events'},
  {slug: 'showcase', path: '/showcase'},
  {slug: 'membership', path: '/membership'},
  {slug: 'about', path: '/about'},
  {slug: 'contact', path: '/contact'},
  {slug: 'programs-asa', path: '/programs/asa'},
  {slug: 'news', path: '/news'},
  {slug: 'launchpad', path: '/launchpad'}
] as const;

const locales = [
  {name: 'en', prefix: ''},
  {name: 'zh', prefix: '/zh'}
] as const;

const viewports = [
  {name: 'desktop-1440', width: 1440, height: 900},
  {name: 'laptop-1120', width: 1120, height: 800},
  {name: 'tablet-820', width: 820, height: 1100},
  {name: 'mobile-390', width: 390, height: 844}
] as const;

function urlFor(prefix: string, routePath: string): string {
  if (prefix === '') return routePath;
  return routePath === '/' ? prefix : `${prefix}${routePath}`;
}

async function revealLazyContent(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight) {
      window.scrollTo(0, y);
      await new Promise(requestAnimationFrame);
    }
    window.scrollTo(0, 0);
  });
  await page.waitForFunction(
    () => Array.from(document.images).every((image) => image.complete),
    undefined,
    {timeout: 15_000}
  );
}

for (const viewport of viewports) {
  test.describe(viewport.name, () => {
    test.use({viewport: {width: viewport.width, height: viewport.height}});

    for (const locale of locales) {
      for (const route of routes) {
        const url = urlFor(locale.prefix, route.path);

        test(`${url} renders the visual baseline`, async ({page}) => {
          const response = await page.goto(url, {waitUntil: 'networkidle'});
          expect(response?.status()).toBeLessThan(400);
          await expect(page.locator('body')).not.toContainText(
            'Missing required production environment variables'
          );
          await page.addStyleTag({content: 'nextjs-portal { display: none !important; }'});
          expect(
            await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
          ).toBe(true);
          await expect(page.locator('h1')).toHaveCount(1);
          await expect(page.locator('h1')).toBeVisible();
          await revealLazyContent(page);
          await page.evaluate(() => document.fonts.ready);
          await page.waitForLoadState('networkidle');
          await expect(page).toHaveScreenshot(
            ['wisetech-visual-baseline', `${route.slug}-${locale.name}-${viewport.name}.png`],
            {fullPage: true, maxDiffPixelRatio: 0.02, animations: 'disabled', caret: 'hide'}
          );
        });
      }
    }
  });
}
