import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

import {expect, test, type Page} from '@playwright/test';

// The cascade is the thing under test, so this renders the real public stylesheets in a real
// browser rather than asserting on CSS source. No server or database is involved: each case is
// static markup copied from the component that emits it, which is what makes the open-events
// grid testable while production has no event open.
const css = ['app/globals.css', 'app/styles/wisetech.css', 'app/styles/wisetech-shell.css', 'app/styles/wisetech-experience.css']
  .map((file) => readFileSync(resolve(process.cwd(), file), 'utf8'))
  // Tailwind directives are compile-time only; the browser would skip them anyway.
  .join('\n')
  .replace(/@tailwind [a-z]+;/g, '');

async function contrastOf(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((element) => {
    const parse = (value: string) => {
      const match = value.match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const [r, g, b, a = 1] = match[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return {r, g, b, a};
    };
    const luminance = ({r, g, b}: {r: number; g: number; b: number}) => {
      const channel = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const foreground = parse(getComputedStyle(element).color)!;
    let node: Element | null = element;
    let background = null;
    while (node) {
      const style = getComputedStyle(node);
      const color = parse(style.backgroundColor);
      if (color && color.a > 0.5) { background = color; break; }
      // A gradient host is measured against its first colour stop.
      const stop = style.backgroundImage.match(/rgba?\([^)]+\)/);
      if (stop) { background = parse(stop[0]); break; }
      node = node.parentElement;
    }
    background ??= {r: 255, g: 255, b: 255, a: 1};
    const [light, dark] = [luminance(foreground), luminance(background)].sort((x, y) => y - x);
    return Math.round(((light + 0.05) / (dark + 0.05)) * 100) / 100;
  });
}

async function render(page: Page, body: string) {
  await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body><div class="site-root" lang="en"><main>${body}</main></div></body></html>`);
}

test.describe('public surface contrast', () => {
  test('open-event cards keep a readable title inside the ink "Open now" section', async ({page}) => {
    // components/home/open-now.tsx -> CardGrid variant "service". The ink section inverts its
    // headings to white; the cards inside it are white, so the event title rendered at 1:1.
    await render(page, `
      <section class="section opportunity-section"><div class="shell">
        <div class="service-grid">
          <a class="service-link" href="/events/x"><span>01</span><h3>AI Clinic for SMEs</h3><p>1 December 2026 · Kwun Tong</p><span aria-hidden="true">↗</span></a>
        </div>
      </div></section>`);

    expect(await contrastOf(page, '.service-link h3')).toBeGreaterThanOrEqual(4.5);
    expect(await contrastOf(page, '.service-link p')).toBeGreaterThanOrEqual(4.5);
  });

  test('the route finder reads at AA in both its states', async ({page}) => {
    await render(page, `
      <section class="section"><div class="shell"><div class="route-finder">
        <fieldset class="route-picker"><legend class="route-legend">Choose who you are</legend>
          <div class="route-choice"><input class="route-input" type="radio" name="r" id="route-corporates" checked>
            <label class="route-option" for="route-corporates"><span class="route-option-index">01</span><span class="route-option-title">For Corporates</span><span class="route-option-copy" id="c1">Find solutions.</span></label></div>
          <div class="route-choice"><input class="route-input" type="radio" name="r" id="route-smes">
            <label class="route-option" for="route-smes"><span class="route-option-index">02</span><span class="route-option-title">For SMEs</span><span class="route-option-copy" id="c2">Turn AI into practice.</span></label></div>
        </fieldset>
        <div class="route-panels"><article class="route-panel accent-cyan" data-route="corporates">
          <div class="route-origin"><p class="route-eyebrow">Your route</p><h3>For Corporates</h3><p class="route-benefits">Buyer challenges</p>
            <a class="route-primary" href="/membership"><span>Start here</span>Explore membership</a></div>
          <div class="route-destinations"><p class="route-lead">Three places to start.</p><ol><li><a class="route-destination" href="/membership"><span class="route-node" aria-hidden="true"></span><strong>Membership</strong><span>Compare plans.</span><span aria-hidden="true">↗</span></a></li></ol></div>
        </article></div>
      </div></div></section>`);

    expect(await contrastOf(page, '.route-legend')).toBeGreaterThanOrEqual(4.5);
    expect(await contrastOf(page, 'label[for="route-corporates"] .route-option-copy')).toBeGreaterThanOrEqual(4.5);
    expect(await contrastOf(page, 'label[for="route-smes"] .route-option-copy')).toBeGreaterThanOrEqual(4.5);
    expect(await contrastOf(page, 'label[for="route-smes"] .route-option-index')).toBeGreaterThanOrEqual(4.5);
    expect(await contrastOf(page, '.route-eyebrow')).toBeGreaterThanOrEqual(4.5);
    expect(await contrastOf(page, '.route-benefits')).toBeGreaterThanOrEqual(4.5);
    expect(await contrastOf(page, '.route-primary > span')).toBeGreaterThanOrEqual(4.5);
    expect(await contrastOf(page, '.route-destination strong')).toBeGreaterThanOrEqual(4.5);
    expect(await contrastOf(page, '.route-lead')).toBeGreaterThanOrEqual(4.5);
  });

  test('index numerals on white read at AA on /programmes, /showcase and /launchpad', async ({page}) => {
    // Pre-existing on production 2026-10-05 (axe): the light accent blues measured 2.96:1 and
    // 3.73:1 as 10-11px numerals on white.
    await render(page, `
      <section class="section"><div class="shell">
        <nav class="programme-groupings"><a href="#catalogue"><span>01</span><span>Catalogue</span></a></nav>
        <div class="solution-needs"><form class="contents"><button type="submit"><span>01</span><span>AI concierge</span></button></form></div>
        <div class="service-grid"><article><span>01</span><h3>Cohort</h3><p>Copy</p></article></div>
      </div></section>`);

    expect(await contrastOf(page, '.programme-groupings a > span:first-child')).toBeGreaterThanOrEqual(4.5);
    expect(await contrastOf(page, '.solution-needs button > span:first-child')).toBeGreaterThanOrEqual(4.5);
    expect(await contrastOf(page, '.service-grid article > span')).toBeGreaterThanOrEqual(4.5);
  });

  test('the concierge launcher shows its label on desktop and collapses to its mark on phones', async ({page}) => {
    // components/ai/concierge-launcher.tsx. The donor styles *every* span in the trigger as the
    // 38px white "W+" disc, so wrapping the label in a span squeezed "Ask WiseTech" into a disc.
    const markup = `<div class="concierge"><button class="concierge-trigger" type="button" aria-label="Ask WiseTech"><span aria-hidden="true">W+</span><span class="concierge-trigger-label">Ask WiseTech</span></button></div>`;
    await page.setViewportSize({width: 1440, height: 900});
    await render(page, markup);
    const desktop = await page.locator('.concierge-trigger-label').boundingBox();
    expect(desktop?.width ?? 0).toBeGreaterThan(60);
    expect(desktop?.height ?? 99).toBeLessThan(30);

    await page.setViewportSize({width: 390, height: 844});
    const phone = await page.locator('.concierge-trigger-label').boundingBox();
    expect(phone?.width ?? 99).toBeLessThanOrEqual(1);
  });

  test('the measuring helper detects an unreadable pair', async ({page}) => {
    // Proves the guard can fail: white on white must measure 1:1.
    await render(page, `<div style="background:#fff"><p id="bad" style="color:#fff">x</p></div>`);
    expect(await contrastOf(page, '#bad')).toBe(1);
  });
});
