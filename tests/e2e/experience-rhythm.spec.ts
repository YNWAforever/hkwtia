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

// components/home/hero.tsx (round 3).
const hero = `<section class="hero"><div class="hero-scrim"></div><div class="hero-content shell">
  <p class="eyebrow light">WiseTech Hong Kong</p><h1>How can Hong Kong lead the AI+ era?</h1><p>Lead</p>
  <div class="hero-actions"><a class="button" href="#pathways">Find your route</a></div></div>
  <div class="hero-note">WiseTech Hong Kong · AI+ industry platform</div></section>`;

test.describe('homepage hero', () => {
  test('the duplicate corner note is gone on desktop', async ({page}) => {
    // At 1440x900 the note repeated the eyebrow and sat 2px from the concierge launcher.
    await page.setViewportSize({width: 1440, height: 900});
    await render(page, hero);
    await expect(page.locator('.hero-note')).toBeHidden();
  });

  test('the entrance plays once and is skipped under reduced motion', async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});
    await render(page, hero);
    const motion = await page.locator('.hero-content > h1').evaluate((h) => getComputedStyle(h).animationName);
    expect(motion).toBe('xp-rise');

    await page.emulateMedia({reducedMotion: 'reduce'});
    const still = await page.locator('.hero-content > h1').evaluate((h) => getComputedStyle(h).animationName);
    expect(still).toBe('none');
  });
});

// Round 5: chapter numbers, the side-by-side event journey, the phone close.
async function renderMain(page: Page, main: string) {
  await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body><div class="site-root" lang="en">${main}</div></body></html>`);
}
const beforeContent = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => getComputedStyle(el, '::before').content);

test.describe('homepage chapters', () => {
  test('chapter numbers follow position, survive content-visibility, and stay off other pages', async ({page}) => {
    // Every section after the hero is content-visibility:auto, whose style containment scoped a
    // CSS counter to each section, so every chapter read "01". Reproduced here inline.
    const cv = 'style="content-visibility:auto"';
    await renderMain(page, `<main>
      <section class="hero"><div class="hero-content shell"><p class="eyebrow light">WiseTech</p><h1>H</h1></div></section>
      <section class="section" id="a" ${cv}><div class="shell"><div class="section-heading split-heading"><div><p class="eyebrow">Open now</p><h2>A</h2></div></div></div></section>
      <section class="gba-section" id="b" ${cv}><div class="shell gba-copy"><p class="eyebrow light">GBA Gateway</p><h2>B</h2></div></section>
      <section class="legacy-network" id="c" ${cv}><div class="shell"><div class="legacy-network-heading"><div><p class="eyebrow">Network</p><h2>C</h2></div></div></div></section>
    </main>`);
    expect(await beforeContent(page, '#a .eyebrow')).toContain('"01"');
    expect(await beforeContent(page, '#b .eyebrow')).toContain('"02"');
    expect(await beforeContent(page, '#c .eyebrow')).toContain('"03"');
    expect(await beforeContent(page, '.hero .eyebrow')).toBe('none');

    // Any other page: no hero, no numbers.
    await renderMain(page, `<main><section class="section" id="x"><div class="shell"><div class="section-heading"><div><p class="eyebrow">Events</p><h2>X</h2></div></div></div></section></main>`);
    expect(await beforeContent(page, '#x .eyebrow')).toBe('none');
  });

  test('on a wide screen the event journey sits beside its heading, stages descending', async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});
    await renderMain(page, `<main><section class="section" id="events-journey"><div class="shell">
      <div class="section-heading split-heading"><div><p class="eyebrow">Events</p><h2>A useful event is a journey, not a single date.</h2></div><p>Lead</p></div>
      <div class="event-stage-grid"><article><span>01</span><h3>Before</h3><p>a</p></article><article><span>02</span><h3>During</h3><p>b</p></article><article><span>03</span><h3>After</h3><p>c</p></article></div>
    </div></section></main>`);
    const heading = await page.locator('#events-journey .section-heading').boundingBox();
    const stages = await page.locator('#events-journey .event-stage-grid article').evaluateAll((a) => a.map((x) => x.getBoundingClientRect().top));
    const grid = await page.locator('#events-journey .event-stage-grid').boundingBox();
    expect(grid!.x).toBeGreaterThan(heading!.x + heading!.width);
    expect(stages[1]).toBeGreaterThan(stages[0]);
    expect(stages[2]).toBeGreaterThan(stages[1]);
  });

  test('the closing cards on a phone have no blank band above their titles', async ({page}) => {
    await page.setViewportSize({width: 390, height: 844});
    await render(page, `<section class="section conversion-section"><div class="shell"><div class="conversion-grid">
      <article><span class="status-label">Membership</span><h3>Build an active route</h3><p>Copy</p></article></div></div></section>`);
    const margin = await page.locator('.conversion-grid h3').evaluate((h) => parseFloat(getComputedStyle(h).marginTop));
    expect(margin).toBeLessThanOrEqual(32);
  });
});

// Round 6: inner pages.
test.describe('inner pages', () => {
  test('a bare section h2 takes the section heading scale, not the browser default', async ({page}) => {
    // app/[locale]/(public)/membership/page.tsx: "Membership FAQ" and "What happens after you
    // join" are unclassed h2s in the section shell; they rendered at 16px.
    await page.setViewportSize({width: 1440, height: 900});
    await render(page, `<section class="section"><div class="shell"><h2 id="faq">Membership FAQ</h2></div></section>
      <section class="section"><div class="shell"><h2 class="any-own-class" id="classed">Classed</h2></div></section>`);
    const size = await page.locator('#faq').evaluate((h) => parseFloat(getComputedStyle(h).fontSize));
    expect(size).toBeGreaterThanOrEqual(36);
    // A heading that carries its own class (sr-only, a component's own) is left alone.
    const classed = await page.locator('#classed').evaluate((h) => parseFloat(getComputedStyle(h).fontSize));
    expect(classed).not.toBe(size);
  });

  test('the breadcrumb keeps "Home" on one line beside a long page title on a phone', async ({page}) => {
    // components/wt/page-hero.tsx. It measured 31x37px ("Hom / e") on /membership at 390.
    await page.setViewportSize({width: 390, height: 844});
    await render(page, `<section class="page-hero"><div class="shell"><nav class="breadcrumb"><a href="/">Home</a><span>/</span>
      <b>Find your place in Hong Kong's technology community</b></nav></div></section>`);
    const home = await page.locator('.breadcrumb > a').boundingBox();
    expect(home!.height).toBeLessThan(28);
  });

  test('a consent checkbox is a checkbox, not a full-width field', async ({page}) => {
    // /events opt-in: the form field rule sized it 325x52 with its label pushed aside.
    await page.setViewportSize({width: 1440, height: 900});
    await render(page, `<form class="partner-form interest-form"><label class="consent" for="opt"><input id="opt" type="checkbox"><span>Also send me updates on WhatsApp</span></label></form>`);
    const box = await page.locator('#opt').boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(24);
    expect(box!.width).toBeLessThanOrEqual(28);
    expect(box!.height).toBeLessThanOrEqual(28);
  });
});
