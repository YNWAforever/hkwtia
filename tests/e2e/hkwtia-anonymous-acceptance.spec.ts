import {readFileSync} from 'node:fs';
import {expect, test} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.use({storageState: {cookies: [], origins: []}, trace: 'off'});
test.beforeEach(async ({context, baseURL}) => {
  test.skip(process.env.HKWTIA_ANONYMOUS_ACCEPTANCE !== 'true', 'Explicit local anonymous acceptance only');
  expect(baseURL).toBe('http://localhost:3212');
  await context.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
});
// Infinite decorative effects are excluded; a stuck finite effect fails within 10s.
async function settleAnimations(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter(animation => {
      const timing = animation.effect?.getComputedTiming();
      return timing && Number.isFinite(timing.endTime) && Number.isFinite(timing.iterations);
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.all(finite.map(animation => animation.finished.catch(() => undefined))),
        new Promise<never>((_, reject) => {timer = setTimeout(() => reject(Error('Finite animations did not settle within 10s')), 10_000);})
      ]);
    } finally {clearTimeout(timer);}
  });
}
// Assert the effective colours, including every ancestor's opacity.
async function homeContrast(page: import('@playwright/test').Page) {
  const result = await page.locator('.hero .hero-actions .button[href="#pathways"]').evaluate(element => {
    const rgb = (value: string) => {
      const channels = value.match(/[\d.]+/g)?.map(Number);
      if (!channels || channels.length < 3) throw Error(`Unsupported colour: ${value}`);
      return channels;
    };
    const foreground = getComputedStyle(element).color;
    let background = '';
    const opacities: number[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      opacities.push(Number(style.opacity));
      if (Number(style.opacity) !== 1) throw Error(`Unsettled opacity: ${style.opacity}`);
      if (!background) {
        const channels = rgb(style.backgroundColor);
        if (channels.length === 3 || channels[3] === 1) background = style.backgroundColor;
        else if (channels[3] !== 0) throw Error('Translucent background needs compositing');
      }
    }
    if (!background) throw Error('No opaque background');
    const luminance = (value: string) => rgb(value).slice(0, 3).map(c => {
      const v = c / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
    const fg = rgb(foreground);
    if (fg.length === 4 && fg[3] !== 1) throw Error('Translucent foreground');
    const a = luminance(foreground), b = luminance(background);
    return {foreground, background, opacities, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)};
  });
  expect(result.ratio).toBeGreaterThanOrEqual(4.5);
  return result;
}
const paths = ['/', '/about', '/about/chairman', '/about/committees', '/membership', '/ai-ops', '/contact', '/members'];
for (const prefix of ['', '/zh']) for (const width of [375, 768, 1024, 1440]) {
  test(`${prefix || 'en'} ${width} public render, keyboard and axe`, async ({page}, info) => {
    await page.setViewportSize({width, height: 900});
    const records = [];
    for (const path of paths) {
      const response = await page.goto(prefix + (path === '/' ? '' : path) || '/');
      expect(response?.status()).toBe(200);
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
      const axe = await new AxeBuilder({page}).analyze();
      records.push({path, status: response?.status(), contrast, heading: await page.locator('h1').innerText(), axe: axe.violations.map(v => ({id: v.id, impact: v.impact}))});
      await page.screenshot({path: info.outputPath(path.replaceAll('/', '_') + '.png'), fullPage: true});
      expect.soft(axe.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
    }
    await info.attach('observations', {body: JSON.stringify(records), contentType: 'application/json'});
  });
}
for (const prefix of ['', '/zh']) {
  test(`${prefix || 'en'} membership four tiers, help and anchor`, async ({page}) => {
    await page.goto(prefix + '/membership');
    // Paid tiers require configured Stripe prices, deliberately absent in this runtime.
    // Keep the unmet four-tier requirement red while still exercising help/anchor behavior.
    const codes = await page.locator('.plan-grid article').evaluateAll(cards => cards.map(card => card.id));
    expect.soft(codes).toEqual(['community', 'startup', 'corporate', 'patron']);
    for (const code of codes) await expect(page.locator(`#${code} h2`)).toBeVisible();
    await page.locator('a[href="#plans"]').click();
    await expect(page).toHaveURL(/#plans$/);
    await expect(page.locator('#membership-faq-title')).toBeVisible();
    expect(await page.locator('main a[href="' + prefix + '/contact"]').count()).toBeGreaterThan(0);
  });
  test(`${prefix || 'en'} anonymous protected boundaries`, async ({page}, info) => {
    const records = [];
    for (const path of ['/admin', '/admin/members', '/portal', '/portal/company']) {
      const response = await page.goto(prefix + path);
      expect(response?.status()).toBe(200);
      expect(new URL(page.url()).pathname).toBe(prefix + (path.startsWith('/admin') ? '/admin-login' : '/member-login'));
      records.push({path: prefix + path, status: response?.status(), destination: new URL(page.url()).pathname, redirects: response?.request().redirectedFrom() !== null});
    }
    await info.attach('boundaries', {body: JSON.stringify(records), contentType: 'application/json'});
  });
}
test('locale round-trip retains query/hash and localized hrefs', async ({page}) => {
  await page.goto('/membership?evidence=anonymous#plans');
  await page.getByRole('button', {name: 'Switch to Chinese'}).first().click();
  await expect(page).toHaveURL(/\/zh\/membership\?evidence=anonymous#plans$/);
  expect(await page.locator('main a[href^="/zh/contact"]').count()).toBeGreaterThan(0);
  await page.getByRole('button', {name: 'Switch to English'}).first().click();
  await expect(page).toHaveURL(/3212\/membership\?evidence=anonymous#plans$/);
});
for (const locale of ['en', 'zh-HK']) test(`${locale} disabled concierge returns 503 and manual fallback`, async ({page}) => {
  const labels = JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), 'utf8')).Concierge;
  await page.goto(locale === 'en' ? '/about' : '/zh/about');
  await page.getByRole('button', {name: labels.launcher}).click();
  const dialog = page.getByRole('dialog', {name: labels.title});
  await dialog.getByRole('textbox', {name: labels.messageLabel}).fill('Synthetic anonymous acceptance question');
  const pending = page.waitForResponse(r => r.url().endsWith('/api/ai/concierge') && r.request().method() === 'POST');
  await dialog.getByRole('button', {name: labels.send, exact: true}).click();
  expect((await pending).status()).toBe(503);
  await expect(dialog.getByRole('alert')).toHaveText(labels.disabled);
  await expect(dialog.getByRole('link', {name: labels.contactSupport})).toBeVisible();
});

test('seeded non-opt-in company is absent from healthy directory', async ({page}) => {
  const preflight = JSON.parse(readFileSync('.tmp/anon/directory-preflight.json', 'utf8'));
  expect(preflight.rows).toBe(1);
  expect(preflight.companies[0].directory_visible).toBe(false);
  expect(preflight.companies[0].public_profile_status).not.toBe('published');
  for (const prefix of ['', '/zh']) {
    const labels = JSON.parse(readFileSync(new URL(`../../messages/${prefix ? 'zh-HK' : 'en'}.json`, import.meta.url), 'utf8')).Members;
    expect((await page.goto(prefix + '/members'))?.status()).toBe(200);
    await expect(page.getByText(labels.unavailableTitle, {exact: true})).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText(preflight.companies[0].display_name);
  }
});

for (const prefix of ['', '/zh']) for (const area of ['admin', 'portal']) {
  test(`${prefix || 'en'} ${area} initial anonymous HTTP boundary`, async ({request}, info) => {
    const records = [];
    for (const suffix of area === 'admin' ? ['', '/members'] : ['', '/company']) {
      const path = prefix + '/' + area + suffix;
      const response = await request.get(path, {maxRedirects: 0});
      expect(response.status()).toBe(307);
      const location = new URL(response.headers().location, 'http://localhost:3212');
      expect(location.origin).toBe('http://localhost:3212');
      expect(location.pathname).toBe(prefix + (area === 'admin' ? '/admin-login' : '/member-login'));
      expect(location.searchParams.get('next')).toBe('/' + area + suffix);
      records.push({path, status: response.status(), location: location.pathname + location.search});
    }
    await info.attach('initial-boundaries', {body: JSON.stringify(records), contentType: 'application/json'});
  });
}

for (const prefix of ['', '/zh']) test(`${prefix || 'en'} reduced-motion home axe`, async ({page}, info) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.goto(prefix || '/');
  await settleAnimations(page);
  const contrast = await homeContrast(page);
  const axe = await new AxeBuilder({page}).analyze();
  await info.attach('reduced-motion', {body: JSON.stringify({contrast, violations: axe.violations}), contentType: 'application/json'});
  expect(axe.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
});

// Freeze real time-based document effects; scroll-driven effects retain their scroll progress.
for (const prefix of ['', '/zh']) for (const width of [375, 768, 1024, 1440]) {
  test(`${prefix || 'en'} ${width} home mid-entrance contrast`, async ({page}, info) => {
    await page.emulateMedia({reducedMotion: 'no-preference'});
    await page.setViewportSize({width, height: 900});
    await page.goto(prefix || '/', {waitUntil: 'domcontentloaded'});
    const samples = [];
    for (const time of [0, 450, 600, 800]) {
      const animations = await page.evaluate(time => {
        const animations = document.getAnimations().filter(animation => animation.timeline === document.timeline);
        for (const animation of animations) {
          animation.pause();
          animation.currentTime = time;
        }
        return animations.filter(animation => (animation.effect as KeyframeEffect | null)?.target === document.querySelector('.hero-actions')).length;
      }, time);
      expect(animations).toBe(1);
      samples.push({time, ...await homeContrast(page)});
      if (time === 600) {
        const axe = await new AxeBuilder({page}).include('.hero').analyze();
        expect(axe.violations.filter(v => v.id === 'color-contrast')).toEqual([]);
      }
    }
    await info.attach('mid-entrance', {body: JSON.stringify(samples), contentType: 'application/json'});
  });
}
