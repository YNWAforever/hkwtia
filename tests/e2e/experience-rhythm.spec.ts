import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

import {expect, test, type Page} from '@playwright/test';

// Round 2 of the experience pass (2026-10-06). Like experience-contrast.spec.ts, this renders
// the real public stylesheets around static markup copied from the emitting components, so the
// cascade is what is tested and no server or database is involved.
const css = ['app/globals.css', 'app/styles/wisetech.css', 'app/styles/wisetech-shell.css', 'app/styles/wisetech-experience.css']
  .map((file) => readFileSync(resolve(process.cwd(), file), 'utf8'))
  .join('\n')
  .replace(/@tailwind [a-z]+;/g, '');

async function render(page: Page, body: string) {
  await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body><div class="site-root" lang="en"><main>${body}</main></div></body></html>`);
}

// components/home/programme-showcase.tsx, as served on production.
const programmeCard = (feature: boolean, title: string) => `
  <article class="programme-card${feature ? ' feature' : ''}"><div><span class="status-label">Event series</span><span class="card-index">02</span></div>
  <h3>${title}</h3><p>Recognising excellence across Hong Kong's technology sector.</p><small>6 editions since 2020</small>
  <a href="/programs/hkict">View programme <span aria-hidden="true">↗</span></a></article>`;

test.describe('public surface rhythm', () => {
  test('a programme title never touches its eyebrow row', async ({page}) => {
    // At 1440 the two-line "HKICT Awards" filled its card, the title's auto top margin
    // collapsed to 0 and the title sat flush against "EVENT SERIES" (measured 0px).
    await page.setViewportSize({width: 1440, height: 900});
    await render(page, `<section class="section"><div class="shell"><div class="programme-grid">
      ${programmeCard(true, 'CPAI')}${programmeCard(false, 'HKICT Awards')}${programmeCard(false, 'TCT')}${programmeCard(false, 'Asia Smart App Awards')}
    </div></div></section>`);
    const gap = await page.locator('.programme-card:nth-child(2)').evaluate((card) => {
      const row = card.querySelector(':scope > div')!.getBoundingClientRect();
      return card.querySelector('h3')!.getBoundingClientRect().top - row.bottom;
    });
    expect(gap).toBeGreaterThanOrEqual(16);
  });

  test('the event journey is a compact sequence on a phone', async ({page}) => {
    // components/home/events-journey.tsx. Each stage was a 220px box with a 60px gap above
    // its title, so the three stages filled most of a 390x844 screen with blank space.
    await page.setViewportSize({width: 390, height: 844});
    await render(page, `<section class="section"><div class="shell"><div class="event-stage-grid">
      <article><span>01</span><h3>Before</h3><p>Recommendations, pricing, capacity and matchmaking.</p></article>
      <article><span>02</span><h3>During</h3><p>Check-in, sessions, questions and meetings.</p></article>
      <article><span>03</span><h3>After</h3><p>Resources, introductions, follow-up and outcomes.</p></article>
    </div></div></section>`);
    const height = await page.locator('.event-stage-grid').evaluate((grid) => grid.getBoundingClientRect().height);
    expect(height).toBeLessThan(520);
  });

  test('the phone footer uses two columns and keeps 44px link targets', async ({page}) => {
    // components/layout/site-footer.tsx. The links carry Tailwind's min-h-11, which is not in
    // the uncompiled globals.css, so it is restated inline. Four single-file 240px columns ran
    // ~3.5 screens at 390x844.
    await page.setViewportSize({width: 390, height: 844});
    const link = (label: string) => `<a style="display:inline-flex;min-height:44px;align-items:center" href="#">${label}</a>`;
    const column = (title: string, n: number) =>
      `<div><strong>${title}</strong>${Array.from({length: n}, (_, i) => link(`${title} link ${i + 1}`)).join('')}</div>`;
    await render(page, `<footer class="site-footer"><div class="shell footer-links">
      ${column('Explore', 7)}${column('Membership', 5)}${column('About', 8)}${column('Contact', 4)}
    </div></footer>`);
    const columns = await page.locator('.footer-links > div').evaluateAll((divs) => divs.map((d) => d.getBoundingClientRect()));
    expect(columns[1].top).toBe(columns[0].top);
    expect(columns[1].left).toBeGreaterThan(columns[0].left);
    const heights = await page.locator('.footer-links a').evaluateAll((links) => links.map((a) => a.getBoundingClientRect().height));
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
    const total = await page.locator('.footer-links').evaluate((el) => el.getBoundingClientRect().height);
    expect(total).toBeLessThan(844 * 1.25);
  });
});
