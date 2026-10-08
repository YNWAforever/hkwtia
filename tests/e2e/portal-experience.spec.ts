/**
 * The member portal's frame and dashboard, measured in a real browser. RUN THE FIXTURE WRITER FIRST:
 *
 *   npx vitest run tests/unit/portal-render-fixtures.test.tsx
 *   PLAYWRIGHT_BASE_URL=http://localhost:9 npx playwright test tests/e2e/portal-experience.spec.ts --project=chromium
 *
 * The portal pages need a session, the database and next-intl's request scope, none of which a
 * Playwright page can mock. The Vitest file renders them through the real portal layout against
 * mocked reads and writes one HTML document per page to .tmp/portal-fixtures/; this spec loads
 * each with the stylesheets the layout loads, in the layout's order, the way
 * experience-rhythm.spec.ts composes its documents. No server, database or session is involved
 * (the base URL above only stops Playwright starting the dev server).
 */
import {execSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';

import {AxeBuilder} from '@axe-core/playwright';
import {expect, test, type Page} from '@playwright/test';

const fixtureDir = resolve(process.cwd(), '.tmp/portal-fixtures');
const shotDir = resolve(process.cwd(), 'test-results/portal');
const viewports = [{width: 1440, height: 900}, {width: 390, height: 844}] as const;

const dashboardStates = ['dashboard-new-member', 'dashboard-onboarding', 'dashboard-past-due', 'dashboard-all-done'] as const;
const otherPages = [
  'profile', 'company', 'company-listing', 'company-seats', 'company-seats-accept', 'directory', 'documents',
  'events', 'events-new', 'events-edit', 'tools', 'tools-detail', 'billing',
] as const;

// The member forms, each rendered in English (-en) and Traditional Chinese (-zh).
const formPages = [
  'form-profile', 'form-company-logo', 'form-company', 'form-company-rejected', 'form-company-readonly', 'form-listing-draft',
  'form-seats-room', 'form-seats-full', 'form-seats-error', 'form-seats-accept-error',
].flatMap((name) => [`${name}-en`, `${name}-zh`]);

// Events, directory, documents, tools and billing (sub-projects 3 + 4), each in -en and -zh.
const portalPages = [
  'events-list-own', 'events-list-plain', 'event-new', 'event-edit-rejected', 'directory-results', 'directory-no-hits', 'directory-page2',
  'documents-both', 'documents-empty', 'tools-available', 'tools-locked', 'tool-page', 'billing-active', 'billing-ending', 'billing-past-due', 'billing-error',
].flatMap((name) => [`${name}-en`, `${name}-zh`]);

let css = '';

test.beforeAll(() => {
  // The pages lean on Tailwind utilities that the uncompiled globals.css does not contain, so
  // build it once; then the WiseTech layers in the order app/[locale]/(member)/portal/layout.tsx
  // imports them, so every equal-specificity tie resolves as it does in production.
  mkdirSync(shotDir, {recursive: true});
  const compiled = resolve(shotDir, 'app.css');
  execSync(`npx tailwindcss -c tailwind.config.ts -i app/globals.css -o "${compiled}"`, {stdio: 'pipe'});
  css = [compiled, ...['wisetech.css', 'wisetech-shell.css', 'wisetech-experience.css', 'wisetech-portal.css'].map((file) => `app/styles/${file}`)]
    .map((file) => readFileSync(resolve(process.cwd(), file), 'utf8'))
    .join('\n');
});

async function load(page: Page, name: string, viewport: {width: number; height: number}) {
  const file = resolve(fixtureDir, `${name}.html`);
  // Fail, never skip: a missing fixture would otherwise pass the whole visual gate vacuously.
  if (!existsSync(file)) {
    throw new Error(`Missing portal fixture ${file}. Run \`npx vitest run tests/unit/portal-render-fixtures.test.tsx\` first.`);
  }
  // The tool page frames an external origin; nothing here may reach the network.
  await page.route(/^https?:/, (route) => route.abort());
  await page.setViewportSize(viewport);
  await page.setContent(readFileSync(file, 'utf8').replace('</head>', `<style>${css}</style></head>`));
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'page scrolls sideways').toBeLessThanOrEqual(0);
}

async function screenshot(page: Page, name: string, width: number, fullPage = true) {
  await page.screenshot({path: resolve(shotDir, `${name}-${width}.png`), fullPage});
}

/** Scrolled, the sticky nav column must start at or below the sticky header's bottom edge, not under it. */
async function expectNavClearsHeader(page: Page) {
  // A short viewport so even the briefest dashboard scrolls far enough for the column to stick.
  await page.setViewportSize({width: 1440, height: 400});
  // Instant: globals.css sets scroll-behavior: smooth, so a plain scrollTo has not moved yet when measured.
  await page.evaluate(() => window.scrollTo({top: document.documentElement.scrollHeight, behavior: 'instant'}));
  const gap = await page.evaluate(() => {
    const header = document.querySelector('.portal-header')!.getBoundingClientRect();
    return document.querySelector('.portal-nav')!.getBoundingClientRect().top - header.bottom;
  });
  await page.evaluate(() => window.scrollTo({top: 0, behavior: 'instant'}));
  expect(gap, 'nav column under the header').toBeGreaterThanOrEqual(0);
}

/**
 * At 390 the header is one row holding the logo, the actions and the Menu trigger, and the h1
 * starts within the first ~120px. The header once stacked logo / descriptor / actions over a
 * separate Menu row, and the h1 sat at 236px.
 */
async function expectPhoneFirstView(page: Page) {
  const geometry = await page.evaluate(() => {
    const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
    const header = box('.portal-header');
    const menu = box('.portal-nav-menu-button');
    return {headerHeight: header.height, menuInHeader: menu.top >= header.top && menu.bottom <= header.bottom, h1Top: box('main h1').top};
  });
  expect(geometry.headerHeight, 'phone header height').toBeLessThanOrEqual(72);
  expect(geometry.menuInHeader, 'Menu trigger inside the header row').toBe(true);
  expect(geometry.h1Top, 'h1 top at 390').toBeLessThanOrEqual(120);
}

/** Text that is rendered and visible but set below 11px. Screen-reader-only text is 1px square. */
async function smallText(page: Page) {
  return page.evaluate(() => {
    const found: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim();
      const element = node.parentElement;
      if (!text || !element) continue;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.visibility === 'hidden' || style.display === 'none' || rect.width <= 1 || rect.height <= 1) continue;
      if (parseFloat(style.fontSize) < 11) found.push(`${style.fontSize} ${element.tagName.toLowerCase()}.${element.className}: ${text.slice(0, 40)}`);
    }
    return found;
  });
}

/** Links and buttons on screen whose box is under 24x24 (WCAG 2.5.8). The off-screen skip link is excluded until focused. */
async function smallTargets(page: Page) {
  return page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('a[href], button')).flatMap((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.right <= 0 || rect.bottom <= 0 || getComputedStyle(element).visibility === 'hidden' || rect.width === 0) return [];
    return rect.width < 24 || rect.height < 24 ? [`${Math.round(rect.width)}x${Math.round(rect.height)} ${element.tagName.toLowerCase()}.${element.className}: ${element.textContent?.trim().slice(0, 40)}`] : [];
  }));
}

async function seriousAxeViolations(page: Page, include?: string) {
  const builder = new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']);
  const results = await (include ? builder.include(include) : builder).analyze();
  return results.violations
    .filter(({impact}) => impact === 'serious' || impact === 'critical')
    .map((violation) => ({id: violation.id, impact: violation.impact, targets: violation.nodes.map((node) => node.target.join(' '))}));
}

/**
 * Visible inputs, selects and textareas with no accessible name: no label[for] pointing at them, no
 * wrapping label, and no non-empty aria-label / aria-labelledby. Hidden inputs carry form state only.
 */
async function unlabelledControls(page: Page) {
  return page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('input:not([type="hidden"]), select, textarea')).flatMap((control) => {
    const byFor = control.id ? Array.from(document.querySelectorAll('label[for]')).some((label) => label.getAttribute('for') === control.id && label.textContent?.trim()) : false;
    const wrapped = Boolean(control.closest('label')?.textContent?.trim());
    const ariaLabel = Boolean(control.getAttribute('aria-label')?.trim());
    const labelledBy = (control.getAttribute('aria-labelledby') ?? '').split(/\s+/).some((id) => id && document.getElementById(id)?.textContent?.trim());
    return byFor || wrapped || ariaLabel || labelledBy ? [] : [`${control.tagName.toLowerCase()}[name=${control.getAttribute('name')}]#${control.id}`];
  }));
}

test.describe('portal dashboard', () => {
  for (const name of dashboardStates) {
    for (const viewport of viewports) {
      test(`${name} at ${viewport.width}`, async ({page}) => {
        await load(page, name, viewport);
        await screenshot(page, name, viewport.width);
        await expectNoHorizontalScroll(page);
        expect(await smallText(page), 'text under 11px').toEqual([]);
        expect(await smallTargets(page), 'targets under 24x24').toEqual([]);
        expect(await seriousAxeViolations(page)).toEqual([]);
        if (viewport.width === 1440) await expectNavClearsHeader(page);
        if (viewport.width === 390) await expectPhoneFirstView(page);
      });
    }
  }

  test('the phone menu panel, opened, at 390', async ({page}) => {
    await load(page, 'dashboard-phone-menu', viewports[1]);
    // Viewport only: the panel is position: fixed, so a full-page capture cuts it off mid-page.
    await screenshot(page, 'dashboard-phone-menu', 390, false);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.portal-nav-link')).toHaveCount(10);
    await expectNoHorizontalScroll(page);
    expect(await smallText(page), 'text under 11px').toEqual([]);
    expect(await smallTargets(page), 'targets under 24x24').toEqual([]);
    // The panel only: axe samples the page behind the overlay as if it were the panel's ground
    // (the same scoping as accessibility.spec.ts gives the public menu).
    expect(await seriousAxeViolations(page, '[role="dialog"]')).toEqual([]);
  });
});

test.describe('the thirteen other portal pages', () => {
  for (const name of otherPages) {
    for (const viewport of viewports) {
      test(`${name} at ${viewport.width}`, async ({page}) => {
        await load(page, name, viewport);
        await screenshot(page, name, viewport.width);
        await expectNoHorizontalScroll(page);
      });
    }
  }
});

test.describe('the member forms, in English and Chinese', () => {
  for (const name of formPages) {
    for (const viewport of viewports) {
      test(`${name} at ${viewport.width}`, async ({page}) => {
        await load(page, name, viewport);
        await screenshot(page, name, viewport.width);
        await expectNoHorizontalScroll(page);
        expect(await smallText(page), 'text under 11px').toEqual([]);
        expect(await smallTargets(page), 'targets under 24x24').toEqual([]);
        // The accept-invitation error has no form; every other fixture must actually render one, or an
        // empty page would pass the label check vacuously.
        if (!name.startsWith('form-seats-accept-error')) {
          const controls = await page.locator('main :is(input:not([type="hidden"]), select, textarea)').count();
          expect(controls, 'visible form controls in main').toBeGreaterThan(0);
        }
        expect(await unlabelledControls(page), 'form controls without a label').toEqual([]);
        expect(await seriousAxeViolations(page)).toEqual([]);
      });
    }
  }
});

test.describe('events, directory, documents, tools and billing, in English and Chinese', () => {
  for (const name of portalPages) {
    for (const viewport of viewports) {
      test(`${name} at ${viewport.width}`, async ({page}) => {
        await load(page, name, viewport);
        await screenshot(page, name, viewport.width);
        await expectNoHorizontalScroll(page);
        expect(await smallText(page), 'text under 11px').toEqual([]);
        expect(await smallTargets(page), 'targets under 24x24').toEqual([]);
        // The event form and the directory search are forms; an empty render must not pass the label check vacuously.
        if (/^(event|directory)-/.test(name)) {
          const controls = await page.locator('main :is(input:not([type="hidden"]), select, textarea)').count();
          expect(controls, 'visible form controls in main').toBeGreaterThan(0);
        }
        expect(await unlabelledControls(page), 'form controls without a label').toEqual([]);
        // The fixture writer checks the markup; this checks what actually painted.
        expect(await page.locator('body').innerText(), 'untranslated message path').not.toMatch(/\bPortal\.[A-Za-z]+\.[A-Za-z]/);
        expect(await seriousAxeViolations(page)).toEqual([]);
      });
    }
  }
});
