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

  test('a checkbox in a flex label row is not squeezed by a long sentence', async ({page}) => {
    // Round 7. /launchpad's consent is a native checkbox in a Tailwind flex label (the
    // utilities are restated inline: they are not in the uncompiled stylesheet); the zh-HK
    // sentence shrank it to 13x16px at 390.
    await page.setViewportSize({width: 390, height: 844});
    await render(page, `<form><label style="display:flex;align-items:flex-start;gap:12px" for="agree">
      <input id="agree" type="checkbox"><span>${'我同意 WTIA 使用此申請作小組評審。'.repeat(4)}</span></label></form>`);
    const box = await page.locator('#agree').boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(24);
    expect(box!.height).toBeGreaterThanOrEqual(24);
  });
});

// Round 8: record grids and the last sub-11px text.
const recordCard = (logo: string) => `<article class="partner-record-card">${logo}
  <div class="partner-record-body"><span class="status-label partner-status">Published record</span>
  <h3>The Hong Kong Advertisers Association (HKAA)</h3>
  <dl><div><dt>Relationship</dt><dd>Listed by WTIA as a supporting organisation.</dd></div><div><dt>Current status</dt><dd>Confirmed by WTIA</dd></div></dl></div></article>`;
// A logo plate whose image has not loaded yet (lazy), as on first paint.
const plate = '<div class="partner-record-logo"><img alt="HKAA logo" width="320" height="202" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></div>';

test.describe('record grids', () => {
  test('a record card on a phone is a compact band, its logo held inside the plate', async ({page}) => {
    // /partners: 79 cards at 545px each (a 233px plate over the record) ran 48,542px at 390.
    await page.setViewportSize({width: 390, height: 844});
    await render(page, `<section class="section partner-directory-page"><div class="shell"><div class="partner-record-grid">${recordCard(plate)}${recordCard(plate)}</div></div></section>`);
    const card = await page.locator('.partner-record-card').first().boundingBox();
    expect(card!.height).toBeLessThan(380);
    const fits = await page.locator('.partner-record-logo').first().evaluate((l) => {
      const box = l.getBoundingClientRect(); const img = l.querySelector('img')!.getBoundingClientRect();
      return img.bottom <= box.bottom + 1 && img.right <= box.right + 1 && box.height > 0;
    });
    expect(fits).toBe(true);
  });

  test('a card without a logo keeps its stacked layout', async ({page}) => {
    // components/marketing/showcase-card.tsx omits the plate when a listing has no logo.
    await page.setViewportSize({width: 390, height: 844});
    await render(page, `<div class="partner-record-grid">${recordCard('')}</div>`);
    expect(await page.locator('.partner-record-card').evaluate((c) => getComputedStyle(c).flexDirection)).toBe('column');
  });

  test('rich-page labels reach 11px without shrinking the related-card arrow', async ({page}) => {
    // /about, /about/history, /about/chairman: the related label was 9px and the compass label
    // 10px. The arrow is the related card's last span (20px) and must keep its size.
    await page.setViewportSize({width: 1440, height: 900});
    await render(page, `<section class="rich-compass"><div class="rich-compass-grid"><div><span>Founding year</span><strong>2001</strong></div></div></section>
      <div class="rich-related-grid"><a href="/about"><span>Since 2001</span><h3>Our history</h3><p>Copy</p><span aria-hidden="true">↗</span></a></div>`);
    const size = (selector: string) => page.locator(selector).first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    expect(await size('.rich-compass-grid span')).toBeGreaterThanOrEqual(11);
    expect(await size('.rich-related-grid > a > span:first-child')).toBeGreaterThanOrEqual(11);
    expect(await size('.rich-related-grid > a > span:last-child')).toBe(20);
  });
});

// Round 9: the programme history list.
test.describe('programme history list', () => {
  test('the span of years sits under the name, not in the 20px arrow track', async ({page}) => {
    // app/[locale]/(public)/programmes/page.tsx: the list shares the nav links' 34px 1fr 20px
    // grid; the third child fell into the arrow track and measured 20px wide, 537px tall.
    await page.setViewportSize({width: 1440, height: 900});
    await render(page, `<section class="section"><div class="shell">
      <nav class="programme-groupings"><a href="#c"><span>01</span><span>Catalogue</span><span aria-hidden="true">↗</span></a></nav>
      <ul class="programme-groupings"><li><span>01</span><b>CPAI</b><span>Credential issued directly by WTIA; no editions to record.</span></li>
      <li><span>02</span><b>HKICT Awards</b><span>2020–2025 · 6 recorded editions</span></li></ul></div></section>`);
    const meta = await page.locator('ul.programme-groupings li').first().locator('span').last().boundingBox();
    expect(meta!.width).toBeGreaterThan(150);
    const item = await page.locator('ul.programme-groupings li').first().boundingBox();
    expect(item!.height).toBeLessThan(160);
    // The nav links keep their arrow track.
    const arrow = await page.locator('nav.programme-groupings a span[aria-hidden]').boundingBox();
    expect(arrow!.width).toBeLessThanOrEqual(20);
  });
});

// Round 10: the homepage's last small print, the pinned header, tap targets, the archive grid.
test.describe('round 10', () => {
  test('the homepage has no text under 11px in the industry list, its chips or the partner tabs', async ({page}) => {
    // components/home/ecosystem.tsx and the partner tabs: index and arrow 10px, chips 10px,
    // record counts 9px; the industry names were 14px in 106px rows.
    await page.setViewportSize({width: 1440, height: 900});
    await render(page, `<div class="ecosystem-board"><div class="industry-list">
      <button type="button" class="industry-button active"><span>01</span><b>Commerce + Professional Services</b><span aria-hidden="true">↗</span></button></div>
      <div class="industry-focus"><ul><li>Industry challenges</li></ul></div></div>
      <div class="legacy-tabs"><button type="button" class="active"><span>Supporting Organizations</span><b>58</b></button></div>`);
    const size = (selector: string) => page.locator(selector).first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    for (const selector of ['.industry-button > span', '.industry-focus li', '.legacy-tabs b']) {
      expect(await size(selector), selector).toBeGreaterThanOrEqual(12);
    }
    expect(await size('.industry-button b')).toBeGreaterThanOrEqual(16);
  });

  test('the pinned header drops the descriptor without moving the navigation', async ({page}) => {
    // components/layout/header-shell.tsx adds .scrolled. `display: none` narrowed the brand
    // column and the navigation jumped left; the descriptor now gives up its height only.
    await page.setViewportSize({width: 1440, height: 900});
    const header = (scrolled: boolean) => `<header class="site-header no-announcement${scrolled ? ' scrolled' : ''}"><div class="header-inner">
      <a class="brand" href="/"><span class="brand-copy"><strong>WiseTech Hong Kong</strong>
      <small>The evolving AI+ industry platform of the Hong Kong Wireless Technology Industry Association</small></span></a>
      <nav class="desktop-nav"><a href="/events">Events</a></nav></div></header>`;
    await render(page, header(false));
    const before = await page.locator('.desktop-nav').boundingBox();
    await render(page, header(true));
    const small = await page.locator('.brand-copy small').evaluate((s) => ({h: s.getBoundingClientRect().height, v: getComputedStyle(s).visibility}));
    expect(small).toEqual({h: 0, v: 'hidden'});
    const after = await page.locator('.desktop-nav').boundingBox();
    expect(after!.x).toBe(before!.x);
  });

  test('the breadcrumb Home link and the partner note link reach the 24px target', async ({page}) => {
    await page.setViewportSize({width: 390, height: 844});
    await render(page, `<nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><b>About WTIA</b></nav>
      <div class="legacy-network-note"><p>Every organisation shown here is a published record.</p><a href="/partners">View all partners <span aria-hidden="true">↗</span></a></div>`);
    for (const selector of ['.breadcrumb > a', '.legacy-network-note a']) {
      expect((await page.locator(selector).boundingBox())!.height, selector).toBeGreaterThanOrEqual(24);
    }
  });

  test('an unpaired last archive story closes the grid full width, mirrored', async ({page}) => {
    // components/home/archive-stories.tsx: four stories ran feature + 2 + 1, the last alone at
    // half width beside an empty column.
    await page.setViewportSize({width: 1440, height: 900});
    const card = (cls: string) => `<figure class="archive-photo-card ${cls}"><div class="archive-photo-media"><img alt="" width="960" height="606" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></div><figcaption><span>WTIA event highlights</span><h3>Title</h3><p>Body</p></figcaption></figure>`;
    await render(page, `<div class="shell"><div class="archive-photo-grid">${card('archive-photo-feature')}${card('')}${card('')}${card('archive-photo-feature archive-photo-feature-reverse')}</div></div>`);
    const grid = (await page.locator('.archive-photo-grid').boundingBox())!;
    const last = page.locator('.archive-photo-card').last();
    expect((await last.boundingBox())!.width).toBeCloseTo(grid.width, 0);
    const media = (await last.locator('.archive-photo-media').boundingBox())!;
    const caption = (await last.locator('figcaption').boundingBox())!;
    expect(media.x).toBeGreaterThan(caption.x);
  });
});

// Round 11: /partners category counts match the homepage tabs.
test('the /partners category counts are 12px, like the homepage partner tabs', async ({page}) => {
  // app/[locale]/(public)/partners/page.tsx: the count in a 38px ring stayed at 11px.
  await page.setViewportSize({width: 1440, height: 900});
  await render(page, `<nav class="partner-category-nav" aria-label="Categories"><a href="#partners-supporting"><span>Supporting Organisations</span><b>58</b></a></nav>`);
  expect(await page.locator('.partner-category-nav b').evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBe(12);
});

test('the stacked rich-page related cards have no blank band above their titles on a phone', async ({page}) => {
  // /about, /about/history, programme pages: 240px cards with an 80px gap above the title.
  await page.setViewportSize({width: 390, height: 844});
  await render(page, `<div class="rich-related-grid"><a href="/about/chairman"><span>Leadership</span><h3>Chairman's message</h3><p>Working together to keep Hong Kong connected.</p><span aria-hidden="true">↗</span></a></div>`);
  const gap = await page.locator('.rich-related-grid > a').evaluate((a) => a.querySelector('h3')!.getBoundingClientRect().top - a.querySelector('span')!.getBoundingClientRect().bottom);
  expect(gap).toBeLessThanOrEqual(40);
  expect((await page.locator('.rich-related-grid > a').boundingBox())!.height).toBeLessThan(220);
});

// Round 12: phone grids that kept a desktop composition.
test.describe('round 12', () => {
  test('/events recommendation cards and activity links stack one per row on a phone', async ({page}) => {
    // A later 1120px rule kept the cards two-up at 390px: "Membership" broke as "Members/hip".
    await page.setViewportSize({width: 390, height: 844});
    const card = (title: string) => `<a class="inner-card" href="/membership"><span class="inner-card-index">03</span><h3>${title}</h3><p>Find the pathway that matches your organisation.</p><b>Compare plans <span aria-hidden="true">↗</span></b></a>`;
    await render(page, `<section class="section"><div class="shell">
      <nav class="activity-type-strip"><a href="#">Open events</a><a href="#">Launch Pad</a><a href="#">Showcase</a></nav>
      <div class="inner-card-grid">${card('Launch Pad')}${card('Showcase')}${card('Membership')}</div></div></section>`);
    const h3 = (await page.locator('.inner-card h3').last().boundingBox())!;
    expect(h3.height).toBeLessThan(45); // one line, not "Members / hip"
    const links = await page.locator('.activity-type-strip a').evaluateAll((as) => as.map((a) => Math.round(a.getBoundingClientRect().x)));
    expect(new Set(links).size).toBe(1);
  });

  test('stacked service cards on a phone have no blank band above their titles', async ({page}) => {
    // /launchpad: four one-line services took ~1,100px (280px boxes, 80px above each title).
    await page.setViewportSize({width: 390, height: 844});
    await render(page, `<section class="section"><div class="service-grid"><article><span>01</span><h3>Market entry</h3><p>Structured guidance on registration, distribution and first commercial contracts.</p></article></div></section>`);
    expect((await page.locator('.service-grid article').boundingBox())!.height).toBeLessThan(220);
  });
});

// Round 15: /membership's dimensions read as terms and definitions on a phone.
test('membership dimensions on a phone are name-and-definition rows with whole-word names', async ({page}) => {
  // components/marketing/membership-dimensions.tsx: twelve 157px stacked cards ran ~1,810px.
  await page.setViewportSize({width: 360, height: 800});
  const item = (title: string, copy: string) => `<article><span></span><h3>${title}</h3><p>${copy}</p></article>`;
  await render(page, `<div class="membership-dimensions">${item('Programmes', 'Participation in WTIA programmes (ASA, TCT, HKICT, CPAI).')}${item('Governance', 'Voting rights and involvement in WTIA governance, where applicable.')}</div>`);
  for (const h3 of await page.locator('.membership-dimensions h3').all()) {
    expect((await h3.boundingBox())!.height).toBeLessThan(30); // one line: no "Programme / s"
  }
  const [name, copy] = await Promise.all([page.locator('.membership-dimensions h3').first().boundingBox(), page.locator('.membership-dimensions p').first().boundingBox()]);
  expect(copy!.x).toBeGreaterThan(name!.x + 100);
  expect((await page.locator('.membership-dimensions article').first().boundingBox())!.height).toBeLessThan(120);
});
