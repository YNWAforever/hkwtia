# WiseTech design fidelity — living checklist

Programme spec: `docs/superpowers/plans/2026-09-01-wisetech-design-fidelity.md` (errata in its Appendix D).
Overview picture: `docs/integration/wisetech-hkwtia-overview.png`.

This file is the spec's §6 acceptance table turned into a living checklist: one row per design section,
component or function the programme ports. The status column is the only field that changes between work
packages; rows are never deleted, so the table stays a complete record of what "perfectly integrated" means.

Statuses:

- `not started` — no code on `main` for the row.
- `ported` — the code exists on a branch or on `main` with RED/GREEN evidence in its PR, but the row's check has not yet passed in the owning WP's final gate.
- `verified` — the row's check passed in the owning WP's final gate and the PR link is recorded.

Rules (spec §5, §6):

- A work package is done only when every row it owns is `verified` with a PR link.
- A row may not skip `ported`.
- A row whose check needs an isolated Preview (Lighthouse, credential-gated e2e) is never marked `verified` from a local run alone; record the Preview URL in the evidence column.
- Flipping a row is part of the PR that earns it, in the same commit as the code or evidence.

## Work-package rows

| # | WP | Area | Item (donor pattern → hkwtia target) | Check | Status | PR | Evidence |
|---|---|---|---|---|---|---|---|
| 0.1 | WP-0 | Harness | `tests/e2e/wisetech-visual-baseline.spec.ts`: 9 routes × 4 viewports × 2 locales, reduced motion, `maxDiffPixelRatio` 0.02 | first run writes the baselines, a second run passes unchanged | verified | [#33](https://github.com/YNWAforever/hkwtia/pull/33) | PR #33 command log: full local gate, RED/GREEN e2e runs, review trail |
| 0.2 | WP-0 | Harness | Baselines committed under `tests/e2e/__screenshots__/wisetech-visual-baseline/` with the platform and project in the file name | files present, spec green against them | verified | [#33](https://github.com/YNWAforever/hkwtia/pull/33) | PR #33 command log: full local gate, RED/GREEN e2e runs, review trail |
| 0.3 | WP-0 | Docs | Spec committed as `docs/superpowers/plans/2026-09-01-wisetech-design-fidelity.md` with errata appendix; overview picture in `docs/integration/` | files present | verified | [#33](https://github.com/YNWAforever/hkwtia/pull/33) | PR #33 command log: full local gate, RED/GREEN e2e runs, review trail |
| 0.4 | WP-0 | Docs | `CLAUDE.md` pointer block (spec §0.4) and corrected unsubscribe sunset date | block present, date matches `lib/email/unsubscribe-token.ts` | verified | [#33](https://github.com/YNWAforever/hkwtia/pull/33) | PR #33 command log: full local gate, RED/GREEN e2e runs, review trail |
| 1.1 | WP-1 | Tokens | `--wt-*` colour, line, shadow and focus tokens with the exact donor values in `app/globals.css` (§4.1) | `tests/unit/wisetech-tokens.test.ts` | not started | | |
| 1.2 | WP-1 | Tokens | Retuned `--shell-*` and shadcn HSL triplets to the donor palette; names kept for `public-shell-tokens.test.ts` | `wisetech-tokens.test.ts`; `public-shell-tokens.test.ts` untouched and green | not started | | |
| 1.3 | WP-1 | Typography | `--font-serif` Iowan Old Style / Palatino Linotype stack, `--font-sans` Avenir Next stack plus zh fallbacks; `Playfair_Display` / `Inter` removed from `app/[locale]/layout.tsx` (D-2); `h1,h2` weight 500, tracking -0.045em | `wisetech-tokens.test.ts`; e2e request filter on `fonts.gstatic.com` = 0 | not started | | |
| 1.4 | WP-1 | Tokens | `tailwind.config.ts`: `colors.wt.*`, `screens` wt-xl/lg/md/sm (1320/1120/820/520), `maxWidth.shell` 1440px, font families | `wisetech-tokens.test.ts` | not started | | |
| 1.5 | WP-1 | CSS port | `app/styles/wisetech.css`: selective donor rules, no `@import "tailwindcss"`, no `url(http`, no donor route strings, pinned selectors present, imported after the Tailwind layers | `tests/unit/wisetech-css-port.test.ts` | not started | | |
| 1.6 | WP-1 | Primitives | `components/wt/`: shell, section, section-heading, eyebrow, status-label, arrow, card-index, honest-empty, page-hero, closing-band, interest-band, step-grid, card-grid, page-updated (Server Components, `Readonly` props, no strings inside) | `tests/unit/wt-primitives.test.tsx` | not started | | |
| 1.7 | WP-1 | Primitives | `components/ui/button.tsx` variants `wt`, `wtDark`, `wtLight`, `wtText` | `wt-primitives.test.tsx` | not started | | |
| 1.8 | WP-1 | Motion | `hero-breathe`, `node-pulse`, `pulse-ring` keyframes inside `prefers-reduced-motion: no-preference`; existing `reduce` block kept | `wisetech-css-port.test.ts` | not started | | |
| 1.9 | WP-1 | Harness | Baselines regenerated at the end of WP-1 (colour / type drift only) and committed | visual baseline spec green | not started | | |
| 2.1 | WP-2 | Shell | Announcement bar: ink bar, amber dot, link with arrow, dismiss button with `aria-label`, per-session dismissal; data still `announcementsRepository.getActive` | `tests/unit/public-layout-announcement.test.tsx` | not started | | |
| 2.2 | WP-2 | Shell | Site header: `overlay` / `solid` variant, `.scrolled` at scrollY > 56, `.no-announcement`, 3-column grid, brand lockup, triggers with `⌄`, actions (search, language, Member sign in, Join WiseTech), mobile trigger | `tests/unit/public-shell.test.tsx`; `tests/e2e/public-shell.spec.ts` scrolled assertion | not started | | |
| 2.3 | WP-2 | Shell | Desktop mega menu: "Explore <group>" heading, "View overview ↗", titled columns, feature aside per group from `config/navigation.ts` (`PublicRoute` hrefs); keyboard contract and timers preserved (D-3, 4 canonical groups) | `tests/unit/navigation.test.ts`, `public-shell.test.tsx`, `public-shell.spec.ts` | not started | | |
| 2.4 | WP-2 | Shell | Mobile dialog: top bar, priority actions, utilities, "Explore the ecosystem" accordions with view-all, focus trap, scroll lock, closes after locale switch | `tests/unit/mobile-navigation.test.tsx`, `public-shell.spec.ts` | not started | | |
| 2.5 | WP-2 | Shell | Brand lockup tile (108×48) with `public/images/wtia-logo.png` and the D-10 descriptor | `tests/unit/wisetech-asset-provenance.test.ts` | not started | | |
| 2.6 | WP-2 | Shell | Footer: brand + description + legal line, newsletter prepared-`mailto:` form with `role="status"` / `role="alert"` (D-6), 4 link columns, `<address>` from `siteConfig.contact`, bottom row | footer snapshot test | not started | | |
| 2.7 | WP-2 | Shell | Concierge launcher restyled to `W+` "Ask WiseTech", panel classes, per-section prompt labels; no runtime change | `tests/unit/concierge-widget.test.tsx`, `tests/e2e/concierge.spec.ts` unchanged and green | not started | | |
| 2.8 | WP-2 | Shell | `app/[locale]/(public)/layout.tsx` wraps `div.site-root` with the `zh-Hant-HK` lang; header variant from `lib/public-shell/hero-variant.ts` | `public-shell.test.tsx` | not started | | |
| 2.9 | WP-2 | i18n | `Navigation.feature.*`, `Navigation.explore` / `viewOverview` / `search`, `Footer.newsletter.*`, `Footer.tagline`, `Concierge.prompts.*` in `en` and `zh-HK` parity | `tests/unit/messages.test.ts`, `npm run audit:strings` | not started | | |
| 2.10 | WP-2 | Gate | Shell boundary green (no donor imports or donor-only paths); axe clean; baselines updated at 1440 / 1120 / 820 / 520 | `tests/unit/wisetech-shell-boundary.test.ts`, `tests/e2e/accessibility.spec.ts`, visual baseline | not started | | |
| 3.1 | WP-3 | Home | 1 · Hero (`components/home/hero.tsx`): `Home.hero.*`, own-origin image with `fetchPriority="high"`, scrim, network field | `tests/unit/homepage.test.tsx` | not started | | |
| 3.2 | WP-3 | Home | 2 · Open now: `eventsRepository.listPublic(anonymous, {status:"open", limit:3})` `.catch(() => [])`; honest empty + interest band + "Submit a challenge" | `homepage.test.tsx` | not started | | |
| 3.3 | WP-3 | Home | 3 · Pathways: 5 static cards with audience accents | `homepage.test.tsx` | not started | | |
| 3.4 | WP-3 | Home | 4 · Events journey: `listFeaturedPublic(anonymous, {limit:2})`, stage grid always, `.event-empty` fallback | `homepage.test.tsx` | not started | | |
| 3.5 | WP-3 | Home | 5 · Directory + Marketplace: `showcaseRepository.listPublished({}, {limit:12})` length, bounded, never a total | `homepage.test.tsx` | not started | | |
| 3.6 | WP-3 | Home | 6 · Outcomes: honest publishing-framework state (D-8) | `homepage.test.tsx` | not started | | |
| 3.7 | WP-3 | Home | 7 · AI+ Ecosystem: 6 industries, client selector with list passed in, links per D-4 | `homepage.test.tsx` | not started | | |
| 3.8 | WP-3 | Home | 8 · Programme showcase: `content/programs/index.ts` typed records | `homepage.test.tsx` | not started | | |
| 3.9 | WP-3 | Home | 9 · GBA gateway: open-cohort flag from `cohortRepository` (`PUBLIC_COHORT_STATUSES`) | `homepage.test.tsx` | not started | | |
| 3.10 | WP-3 | Home | 10 · Impact evidence: `lib/home/impact-metrics.ts` with definition + period + source per tile, `Promise.allSettled`, zero or failed tiles omitted, section hidden when none survive | `tests/unit/impact-metrics.test.ts` | not started | | |
| 3.11 | WP-3 | Home | 11 · Archive stories: `featuredOnly(milestones)` top 4 with `content/milestone-image-map.json` images (D-9); hidden below 1 image | `homepage.test.tsx` | not started | | |
| 3.12 | WP-3 | Home | 12 · Legacy network: `partnersRepository.listPublished(locale, {limit:100})` grouped supporting / regional / media, 12 per tab, hidden at 0, no hard-coded 79 | `tests/unit/wisetech-no-fabricated-metrics.test.ts` | not started | | |
| 3.13 | WP-3 | Home | 13 · Conversion paths (static) | `homepage.test.tsx` | not started | | |
| 3.14 | WP-3 | Home | `app/[locale]/(public)/page.tsx` is a thin composition; 13 landmarks in donor order with donor ids; `lib/home/home-highlights.ts` retained | `homepage.test.tsx` (rewritten), `home-highlights*.test.ts` | not started | | |
| 3.15 | WP-3 | SEO | Metadata: absolute title `WiseTech Hong Kong`, donor description via `Home.metaTitle` / `Home.metaDescription`, own-origin `public/images/og-wisetech.png` | homepage metadata test | not started | | |
| 3.16 | WP-3 | Config | `config/site.ts` `contact` block (email, phone verified against hkwtia.org, address lines) read by footer, contact page and structured data | footer / contact tests | not started | | |
| 3.17 | WP-3 | SEO | `buildOrganizationData()` gains `alternateName`, `telephone`, `address`; `WebSite` node with `inLanguage` | structured-data test | not started | | |
| 3.18 | WP-3 | Gate | `homepage-partner-wall-integration.test.tsx` migrated; `wisetech-pr3-public-pages.spec.ts` updated for the new H1 | unit + e2e | not started | | |
| 3.19 | WP-3 | Performance | `/` added to `lighthouserc.js`; Performance ≥ 90 with the hero as LCP; CLS < 0.05 | `npm run test:lighthouse` on an isolated Preview | not started | | |
| 4.1 | WP-4 | Pages | `/events`: inner hero, quick tabs Open Now / Past Events only (D-5), activity strip to canonical routes, results count `role="status"`, cards ↔ calendar toggle (`?view=calendar`), donor EventCard, recommendations row, interest band, closing band | `tests/unit/wt-pages/events.test.tsx`, `tests/e2e/wisetech-pr5-public-journeys.spec.ts` | not started | | |
| 4.2 | WP-4 | Pages | `/events/[slug]`: detail hero (PR5 `0023` media), facts, main/aside layout, action bar with the real registration form or "Past event" state, `Event` JSON-LD | `tests/unit/event-detail-seo.test.ts`, `event-*` suites | not started | | |
| 4.3 | WP-4 | Pages | `/showcase`: page hero, prompts (`?q=`), search bound to `ShowcaseFilters`, 12 need chips (`?useCase=`), restyled cards, `HonestEmpty`, "Proposed badge definitions — not currently awarded", buyer / provider pathways, interest band | `tests/unit/wt-pages/showcase.test.tsx`, `m5-*` suites | not started | | |
| 4.4 | WP-4 | Pages | `/showcase/[slug]`: existing detail + intro form restyled to the inner-page grammar (donor pending-record page not used) | `m5-*` suites | not started | | |
| 4.5 | WP-4 | Pages | `/membership`: plan grid over the 4 canonical plans with anchors and `/join?plan=`, SME pathway card (D-7), pricing note from the catalog, 12 dimensions, first-90 steps | `tests/unit/wt-pages/membership.test.tsx`, `membership-*` suites | not started | | |
| 4.6 | WP-4 | Pages | `/about`, `/about/history`, `/about/chairman`, `/about/committees`: rich-page grammar over the existing intro / story / timeline primitives | `tests/unit/wt-pages/about.test.tsx` | not started | | |
| 4.7 | WP-4 | Pages | `/programs/{tct,asa,hkict,cpai}`: programme record header + existing editions / credential; "Ask the programme team" `mailto:` (D-6) | `tests/unit/wt-pages/programs.test.tsx` | not started | | |
| 4.8 | WP-4 | Pages | `/launchpad`: route board + descriptive service grid, then the real cohort calendar, funding wizard and application form | `m6-*` suites | not started | | |
| 4.9 | WP-4 | Pages | `/news`, `/news/[slug]`: category chips only for categories that exist in `posts`, research-quality section, subscribe band (D-6) | `tests/unit/wt-pages/news.test.tsx` | not started | | |
| 4.10 | WP-4 | Pages | `/contact`: 6 enquiry routes, verified details from `siteConfig.contact`, Concierge launcher, prepared-email form with `?topic=` presets, no persistence | `tests/unit/wt-pages/contact.test.tsx` | not started | | |
| 4.11 | WP-4 | Pages | `/ai-transparency`, `/ai-ops`, `/privacy`: page hero + existing content; `/ai-ops` cards in `.impact-metrics` styling | `tests/unit/wt-pages/*.test.tsx` | not started | | |
| 4.12 | WP-4 | Pages | `app/[locale]/not-found.tsx`: donor not-found page (inner hero, "Go to the homepage" / "Find an event") | `tests/unit/wt-pages/not-found.test.tsx` | not started | | |
| 4.13 | WP-4 | Contract | Every public route uses `components/wt/page-hero.tsx` with an own-origin figure, caption and breadcrumb; exactly one `main#main-content` and a skip link | `tests/unit/public-landmark-contract.test.ts` | not started | | |
| 4.14 | WP-4 | Gate | `public-route-matrix.spec.ts` and `wisetech-pr5-public-journeys.spec.ts` selectors updated; `event-*`, `m5-*`, `membership-*` suites green | unit + e2e | not started | | |
| 5.1 | WP-5 | Content | `scripts/import-wisetech-partners.ts`: refuses without `WISETECH_PARTNER_IMPORT=true` plus sentinel or the owner's production pair; R2 upload; media + partner rows in one transaction, unpublished and unconfirmed; `partner.created` audit row; idempotent on `(category, name_en)`; prints counts only | `tests/unit/wisetech-partner-import.test.ts` | not started | | |
| 5.2 | WP-5 | Content | Staff runbook `docs/integration/wisetech-partner-import-runbook.md` (confirm relationship window + logo rights, then publish) | review | not started | | |
| 5.3 | WP-5 | Assets | Archive photography stays `retire` until rights are recorded; approved images enter via `/admin/media` with EN/ZH alt | `tests/unit/wisetech-asset-provenance.test.ts` | not started | | |
| 5.4 | WP-5 | Content | Page-copy allowlist leaves for staff-editable marketing strings, shipped copy seeded (M7.2 fail-soft) | page-copy tests | not started | | |
| 5.5 | WP-5 | Assets | Each `retire` → `merge` flip in `config/wisetech-authoritative-source-inventory.ts` in its own commit with the confirmation reference | provenance test | not started | | |
| 6.1 | WP-6 | Functions | `/[locale]/member-login` page + action on the existing rate-limited magic-link path | `tests/e2e/member-login.spec.ts` (credential-free) | not started | | |
| 6.2 | WP-6 | Functions | Operable Portal sign-out control | `tests/e2e/portal-dashboard.spec.ts` | not started | | |
| 6.3 | WP-6 | Functions | One typed authority for safe Portal continuation paths | PR6 RED tests | not started | | |
| 6.4 | WP-6 | Functions | Onboarding hand-off carries the paid membership id + checkout command: profile → company → checkout → review / complete | `join-*`, `checkout-*` suites | not started | | |
| 6.5 | WP-6 | Functions | Completion page reads the webhook-authoritative membership state | PR6 tests | not started | | |
| 6.6 | WP-6 | Functions | Locale-correct Billing Portal return URL | PR6 tests | not started | | |
| 6.7 | WP-6 | Shell | `components/app-shell/*` Join / Portal / Admin variants on WP-1 tokens; no public chrome inside authenticated layouts; axe on `/portal` and `/admin` | PR6 tests, credential-gated e2e | not started | | |
| 7.1 | WP-7 | Routes | `/partners` un-retired: real page (source note, category nav with counts, record cards with relationship status), `config/public-routes.ts`, sitemap, Connect column | `tests/unit/wisetech-route-parity.test.ts` + parity doc in the same commit | not started | | |
| 7.2 | WP-7 | Routes | `/programmes` un-retired as a typed index; `/programmes/{tct,asa,hkict,cpai,launchpad}` redirect | route-parity test | not started | | |
| 7.3 | WP-7 | Routes | 51 `merge` sitemap routes and the `merge` dispatcher patterns as `next.config.ts` redirects (`permanent: false`) generated from `config/wisetech-redirects.ts`; parity doc's "merge 45" corrected | `tests/unit/redirects.test.ts`, route-parity test | not started | | |
| 7.4 | WP-7 | Routes | `/search`, `/accessibility`, `/terms`, retired portal paths stay retired | route-parity test | not started | | |
| 7.5 | WP-7 | SEO | Sitemap `alternates.languages` per route; titles `<Page> \| WiseTech Hong Kong`; `noindex` for portal / join / unsubscribe | `seo-routes.test.ts`, `sitemap.test.ts`, `page-indexability.test.ts` | not started | | |
| 8.1 | WP-8 | Evidence | Full local suite plus `npm audit --omit=dev --audit-level=high` | command log in the PR | not started | | |
| 8.2 | WP-8 | Evidence | Browser suite on an isolated Preview: public matrix, shell, axe, concierge, PR3 / PR5 journeys, visual baseline | Preview URL + totals | not started | | |
| 8.3 | WP-8 | Performance | Lighthouse `/`, `/membership`, `/events` on the Preview: Performance ≥ 90, Accessibility ≥ 95, SEO ≥ 95, LCP < 2.5 s, CLS < 0.05 | report location | not started | | |
| 8.4 | WP-8 | i18n | Key parity + manual `/zh` walk of the 13 home sections and every WP-4 page | walk record | not started | | |
| 8.5 | WP-8 | Evidence | This checklist all `verified`; `docs/integration/wisetech-design-fidelity-evidence.md` with before / after screenshots per breakpoint and locale | review | not started | | |
| 8.6 | WP-8 | Owner | Owner actions recorded, not performed: `quality` required on `main` and `release`, isolated Neon + test identities, UAT owner, production approval, unsubscribe Phase B on or after 2026-09-10 | `docs/integration/wisetech-delivery-gates.md` | not started | | |
| 8.7 | WP-8 | Owner | Donor archived: README note in `YNWAforever/wisetech` pointing here; repo read-only | review | not started | | |

## §6 acceptance criteria

| Area | Criterion | How it is checked | Status |
|---|---|---|---|
| Tokens | Every `--wt-*` token equals the donor value; `--shell-*` retuned per §4.1; no Playfair / Inter font requests | `wisetech-tokens.test.ts`; Playwright request filter on `fonts.gstatic.com` = 0 | not started |
| Typography | `h1` on `/` computes to the serif stack at `clamp(60px,7.7vw,128px)`, `line-height: 0.9`; eyebrows 11px / 800 / 0.2em uppercase | computed-style assertions in `wisetech-visual-baseline.spec.ts` | not started |
| Layout | `.shell` width and `.section` padding match the donor at 1440 / 1120 / 820 / 520; no horizontal scroll at 390px | e2e `scrollWidth <= innerWidth` | not started |
| Home | 13 sections in donor order with donor ids; data-backed sections render real rows or the honest empty state; no hard-coded numbers | `homepage.test.tsx`, `impact-metrics.test.ts`, `wisetech-no-fabricated-metrics.test.ts` | not started |
| Shell | Overlay header over photo heroes, solid on scroll; mega menu with feature aside; mobile dialog with priority actions; 4-column footer; `W+` concierge pill | `public-shell.test.tsx`, `public-shell.spec.ts`, screenshots | not started |
| Inner pages | Every public route uses `components/wt/page-hero.tsx`; exactly one `main#main-content` and a skip link | `public-landmark-contract.test.ts`, `wt-pages/*.test.tsx` | not started |
| Journeys | Event registration, cohort application and showcase introduction still submit through their Server Actions; `/join` → checkout → completion works with the webhook-authoritative state; `/member-login` and portal sign-out exist | `event-*`, `m5-*`, `m6-*`, `join-*`, `checkout-*` suites + PR6 e2e | not started |
| i18n | `en` / `zh-HK` key parity; `/zh` renders every new section; no `/zh-HK/` href; `audit:strings` clean | `messages.test.ts`, `locale-href-boundary.test.ts`, `npm run audit:strings` | not started |
| Content | Partners imported unpublished with logos and bilingual alt; published only after both confirmations; home wall and `/partners` show only published rows | `wisetech-partner-import.test.ts`, `partner-*` suites | not started |
| Routes / SEO | All 51 `merge` donor sitemap routes redirect; `/partners` and `/programmes` are real pages; sitemap carries `hreflang` pairs; portal / join `noindex` | `redirects.test.ts`, `wisetech-route-parity.test.ts`, `sitemap.test.ts`, `page-indexability.test.ts` | not started |
| Accessibility | axe: 0 serious / critical on the public matrix; mega-menu roving focus, `Escape`, mobile focus trap; reduced motion honoured | `accessibility.spec.ts`, `public-shell.spec.ts` | not started |
| Performance | Lighthouse `/`, `/membership`, `/events` on Preview: Performance ≥ 90, Accessibility ≥ 95, SEO ≥ 95; LCP < 2.5 s; CLS < 0.05 | `npm run test:lighthouse` with extended targets | not started |
| Security | CSP unchanged (`img-src 'self' data:`); no donor runtime; no env access outside `lib/config/env.ts`; `npm audit --omit=dev --audit-level=high` clean | `ci-security-contract.test.ts`, `endpoint-hardening.test.ts`, `wisetech-shell-boundary.test.ts` | not started |
| Evidence | PR descriptions carry commands, exit codes and focused-test totals; the evidence doc has before / after screenshots per breakpoint and locale | review | not started |
