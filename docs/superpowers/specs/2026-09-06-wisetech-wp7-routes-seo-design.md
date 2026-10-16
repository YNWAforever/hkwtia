# WP-7 — Route, redirect, SEO and manifest amendments (design)

Date: 2026-09-06. Programme: `docs/superpowers/plans/2026-09-01-wisetech-design-fidelity.md` §5 "WP-7"
(read Appendix D first; E-5 and E-21 bear directly on this package). Base: `origin/main` at `7412756`
(WP-6 merged). This package runs on `worktree-wt-wp7-routes-seo`.

## 1. Goal

Turn the integration manifest's classification decisions into real routing: every donor `merge`
path resolves on the production domain instead of 404ing, the two routes the manifest retired for
want of an authority (`/partners`, `/programmes`) become real pages now that PR4/WP-5 created the
partner authority and the four typed programme records exist, and the public SEO surface
(titles, `hreflang`, `noindex`) is completed. The manifest stays the law: every amendment here is
one the master plan pre-approved for WP-7, and each lands with its validator fixtures and the
parity document in the same commit (master plan §0.3 rule 5).

## 2. Scope

In scope (checklist rows 7.1–7.5):

1. `config/wisetech-redirects.ts` — a build-time generator that derives `next.config.ts` redirects
   from `config/wisetech-integration-manifest.ts` (`permanent: false`), covering all 51 `merge`
   sitemap routes and the `merge` dispatcher patterns.
2. `/partners` un-retired as a real page over `partnersRepository.listPublished`.
3. `/programmes` un-retired as a typed index over `content/programs/index.ts`; `/programmes/{tct,
   asa,hkict,cpai,launchpad}` and the donor aliases become real redirects through item 1.
4. Navigation: `/programmes` enters the Events & Programmes group's Programmes column as its first
   leaf; `/partners` enters the About group's Connect column. Both join `config/public-routes.ts`
   and therefore the sitemap and the footer's every-leaf-once partition.
5. SEO: page titles move to `<Page> | WiseTech Hong Kong`; the sitemap and `buildPageMetadata`
   gain an `x-default` alternate; Portal, Admin and `/member-login` carry `robots: noindex`
   metadata and `robots.ts` disallows the authenticated and mid-flow surfaces for every listed
   crawler.
6. Documents: `docs/integration/wisetech-route-parity.md` rewritten to describe redirects as
   implemented (and its "merge 45" corrected to 51, E-5); checklist rows 7.1–7.5; Appendix D
   errata rows for every deviation below.

Out of scope, deliberately:

- `/search`, `/accessibility`, `/terms`, `/programmes/[slug]`, `/programmes/[slug]/[edition]` and
  the five retired portal paths stay `retire` (checklist 7.4). No page, no redirect.
- No schema migration, no auth/billing/webhook change, no CSP change (`next.config.ts` gains
  redirect rules only).
- No donor photography or partner logos: `/partners` renders only rows the repository already
  publishes (both confirmations + media alt text in both languages), exactly like the home wall.
- No fabricated counts: the donor's "79 organisations" hero is not ported; the page counts what
  the repository returns.
- The donor's 7 marketing groupings on `/programmes` ("Open for Applications", "Upcoming", …)
  have no data behind them; the index renders the three groupings hkwtia can back (catalogue,
  Launch Pad, history) and one honest state for applications.

## 3. Decisions (with the user, 2026-09-06)

| # | Decision | Chosen | Consequence |
|---|---|---|---|
| D-1 | Title suffix | `<Page> \| WiseTech Hong Kong` (master plan, D-10 public brand) | ~16 `metaTitle` keys per locale plus `Metadata.title`. The zh-HK bundle mixes the fullwidth `｜` and ASCII `\|` separators today; the rewrite normalises every zh title to `｜WiseTech Hong Kong`. Tests asserting the literal `\| WTIA` (`history-page`, `extract-milestones`, `aiops-page`) are updated in the same commit. `siteConfig.shortName` (`WTIA`, the `openGraph.siteName`) is unchanged — the Association's legal short name is not the public brand. |
| D-2 | `hreflang` codes | Keep `en` + `zh-HK`, add `x-default` → English | No churn on existing metadata; `zh-Hant` recorded as an erratum (zh-HK is the more specific valid tag and matches `<html lang>`). |
| D-3 | Nav placement | `/programmes` first in the Programmes column; `/partners` in the Connect column | Mobile accordion for Events shows events, launchpad, programmes, hkict, asa; `tct` and `cpai` remain on desktop and in the footer (E-19 precedent). |
| D-4 | WP-8 delivery | Own PR after WP-7 merges | WP-7's PR carries its command log; WP-8 runs the browser and Lighthouse evidence against WP-7's Vercel Preview. |
| D-5 | Redirect status | 307 (`permanent: false`) for every generated rule | Master plan wording; the pre-existing four rules and the hkwtia.org legacy list keep their own values. |
| D-6 | Donor `/en/*` and `/zh/*` prefixes | Generate three sources per rule: `/x`, `/en/x`, `/zh/x` | The chatgpt.site sitemap and old links are all locale-prefixed. `/zh/x` would otherwise be rewritten by the next-intl proxy to a non-existent `zh-HK` page; `/en/x` is also emitted so the rule fires before the proxy instead of relying on the proxy's default-locale strip (one hop, no behavioural dependency on `as-needed` mode). |
| D-7 | Static source → dynamic canonical | Redirect to the canonical's static prefix | `/request-introduction` → `/showcase`; the two historical donor event paths → `/events`. No slug is invented. |
| D-8 | Collision with an explicit rule | The generator skips a merge whose normalised source already has an explicit rule | `/members/[slug]` (merge → `/showcase/[slug]`) yields to the pre-existing `/members/:id` → `/showcase`; documented, tested. |

## 4. Architecture

### 4.1 `config/wisetech-redirects.ts`

```ts
export type WisetechRedirect = Readonly<{source: string; destination: string; permanent: false}>;
export function wisetechDesignRedirects(explicitSources: readonly string[]): readonly WisetechRedirect[];
export const wisetechRedirectSources: ReadonlySet<string>; // for tests that must exclude these rules
```

Rules, in order:

1. Take every manifest entry with `kind === "route"`, `disposition === "merge"`, a `source`
   starting with `/`, and a string `canonicalPath`.
2. Drop identity merges: after normalisation the source equals the canonical (`/events/[slug]`,
   `/portal/profile`, `/portal/company`, `/portal/directory`, `/portal/events`, `/portal/documents`,
   `/portal/billing`; `/programmes/cpai` is *not* identity — it targets `/programs/cpai`).
3. Convert `[param]` to `:param` in both source and destination. If the destination still holds a
   param the source does not supply, cut the destination at its first dynamic segment (D-7).
4. Drop any source whose param-normalised form (`:p` for every param) matches an explicit rule
   passed in by `next.config.ts` (D-8).
5. Emit `{source, destination}` for the unprefixed pair, then `/en` + source → destination, then
   `/zh` + source → `/zh` + destination (D-6). `permanent: false` on all three.
6. Sort by source for a stable diff; freeze.

`next.config.ts` imports the generator with a *relative* path and spreads it after the four
explicit rules and before the legacy rules. The manifest's own import of the source inventory
changes from the `@/` alias to a relative path so the whole chain resolves under Next's config
loader, which does not apply `tsconfig` paths.

Why generated, not listed: the manifest is the reviewed classification; a hand-copied list would
drift from it the first time a disposition changes. The generator is pure and has no I/O, so the
unit test can assert every one of the 51 sitemap merges and every dispatcher merge is covered
by enumerating `authoritativeSourceInventory` rather than a second hand-written list.

### 4.2 Manifest and inventory amendments

`config/wisetech-integration-manifest.ts`:

- `route-design-partners` moves from `retiredDesignRoutes` to a `retain` entry with
  `canonicalPath: "/partners"`, `dataOwner: "Published partner records (partners repository; both confirmations and bilingual logo alt required)."`, `evidence: "hkwtia-repository"`.
- `route-design-programmes` likewise → `/programmes`, `dataOwner: "Typed programme index over content/programs/index.ts and the four typed records."`.
- IDs are kept so the parity document and any reference keep resolving. Entry count stays 134,
  route count 117; the retired list shrinks from 15 to 13 (asset retirements unchanged).

`config/wisetech-authoritative-source-inventory.ts` (the frozen donor evidence carries the
reconciliation decision per row, and `donorRouteContractErrors` compares the two files):

- `sitemap-29` (`programmes`) and `sitemap-46` (`partners`) rows: `retire|` → `retain|/programmes`
  and `retain|/partners`.
- `navigationTargets` rows for the `programmes-gba` group's `programmes` root and columns:
  `retire`/`null` → `retain`/`/programmes`.
- `forms`/`formFlows`: unchanged (the donor partner-enquiry form stays retired; `/partners` sends
  people to `/contact`).
- Identity fields (`commit`, `tree`, `treeListingSha256`) are untouched; they describe the donor
  tree, not these decisions.

`docs/integration/wisetech-route-parity.md`: counts (retain 49, retire 13), the retired table loses
two rows with a note pointing here, the "Design-document routes merged into real destinations"
section becomes "… now real redirects" with the D-6/D-7/D-8 rules stated, and line 158's "merge 45"
becomes 51 (E-5).

### 4.3 `/partners`

`app/[locale]/(public)/partners/page.tsx` (Server Component, dynamic like `/showcase`):

- Read: `partnersRepository.listPublished(locale, {limit: 100}).catch(() => [])`, grouped by the
  five `partner_category` values in a fixed order (supporting, regional, media, programme, sponsor).
- Projection change (`lib/db/repos/partners.ts`): `PartnerProjection` gains
  `relationshipStartsOn: string | null` and `relationshipEndsOn: string | null` so a record can
  state its window. Read-only mapping; no schema change; the home wall ignores the new fields.
- Markup (donor `PartnersPage` grammar, classes already in `app/styles/wisetech.css:788–812`):
  `PageHero` with breadcrumb → `.partner-source-note` → `<nav class="partner-category-nav">`
  (categories with ≥ 1 record, each with its live count) → one `.partner-record-group` per
  non-empty category → `.partner-confirmation` ("Represent one of these organisations?" →
  `/contact`).
- Record card `<dl>`: Relationship (category sentence), Website (only when `websiteUrl` is set),
  Since/Window (from the projection; "Confirmed" when no dates are recorded — every published
  row has `relationship_confirmed_at`, so "Unconfirmed" never renders here and the donor's
  "historical listing, unconfirmed" copy is not ported).
- Zero published rows: the hero and source note render, the category nav and groups do not, and
  a `HonestEmpty variant="inner"` block ("No published partner records yet") replaces them — the
  home wall's "render nothing at 0" rule does not fit a dedicated page.
- Home: `components/home/legacy-network.tsx`'s two "View all partners" links move from `/about`
  to `/partners`.
- Messages: new `Partners` namespace (`metaTitle`, `metaDescription`, `hero.*`, `sourceNote.*`,
  `categories.{supporting,regional,media,programme,sponsor}`, `record.{relationship,website,
  since,window,confirmed}`, `empty.*`, `update.*`) in both bundles; added to
  `lib/i18n/page-copy-scope.ts` with `pageCopyRoutes.Partners = ["/partners"]`.

### 4.4 `/programmes`

`app/[locale]/(public)/programmes/page.tsx` (static, like `/programs/*`):

- `PageHero` → `.programme-groupings` nav with three anchors (catalogue, Launch Pad, history) →
  `HonestEmpty variant="inner"` applications state ("No programme applications are open on this
  site; ask the programme team" → `mailto:` from `siteConfig.contact.email`, mirroring
  `/programs/*`'s `askProgrammeTeam`) → the catalogue grid → a Launch Pad card linking
  `/launchpad` → history section listing each typed record's edition span from
  `summarizeProgrammes()` with `.directory-actions` to `/events` and `/contact`.
- The grid is extracted from `components/home/programme-showcase.tsx` into
  `components/marketing/programme-grid.tsx` (presentational; takes summaries and labels) and
  reused by both the home section and the index, so the two never drift.
- Messages: new `Programmes` namespace (`metaTitle`, `metaDescription`, `hero.*`, `groupings.*`,
  `open.*`, `catalogue.*`, `launchpad.*`, `history.*`); added to page-copy scope with
  `pageCopyRoutes.Programmes = ["/programmes"]`.

### 4.5 Navigation, footer, sitemap

- `config/public-routes.ts`: `+ "/partners", "/programmes"`. `PublicRoute` widens; sitemap,
  `seo-routes.test.ts` and the page-copy route map pick them up automatically.
- `config/navigation.ts`: `NavigationMessageKey` gains `links.programmes` and `links.partners`;
  the Programmes column becomes `[programmes, hkict, asa, tct, cpai]`; the Connect column becomes
  `[contact, partners]`. `Navigation.links.{programmes,partners}` added to both bundles. The
  shell-boundary test's forbidden literal is `"/programmes/"` (with a trailing slash); the index
  path does not match it and the four canonical groups are unchanged (master plan D-3).
- Footer: no code change — the About column receives `/partners` and the Explore column
  `/programmes` through the existing leaf partition; `public-shell.test.tsx`'s expected-href list
  grows by two and its every-leaf-once count moves from 20 to 22.
- Mobile: `mobile-navigation.test.tsx`'s five-leaf expectation becomes
  `["/events", "/launchpad", "/programmes", "/programs/hkict", "/programs/asa"]`.

### 4.6 SEO

- `lib/metadata.ts`: `alternates.languages["x-default"] = englishUrl`. `app/sitemap.ts`:
  `alternates()` adds the same key. Existing `zh-HK` entries stay (D-2).
- Titles (D-1): every `metaTitle` ending in `| WTIA` → `| WiseTech Hong Kong`; `Contact WTIA`,
  `About WTIA`, `Join WTIA | Membership application` keep their page-name half and gain the same
  suffix; `Metadata.title` → `WiseTech Hong Kong`. zh-HK bundle gets the parallel edits with the
  fullwidth `｜` separator throughout. `Metadata.description` and `siteConfig` are unchanged.
- `noindex`: `app/[locale]/(member)/portal/layout.tsx` and `app/[locale]/(admin)/admin/layout.tsx`
  export `metadata = {robots: {index: false, follow: false}}` (Next merges layout metadata into
  every page below it); `/member-login` already does. `app/robots.ts` adds
  `disallow: ["/portal", "/admin", "/member-login", "/join/profile", "/join/company",
  "/join/checkout", "/join/complete", "/unsubscribe", "/api"]` to every rule (`/join` itself stays
  indexable, as `page-indexability.test.ts` already pins).

### 4.7 Documents and errata

Appendix D rows to add (numbers continue from E-71):

- E-72 `zh-HK` kept over `zh-Hant`; `x-default` added.
- E-73 Three sources per generated rule (D-6) and why `/zh/` needs them.
- E-74 Static-source→dynamic-canonical rule (D-7) and the two historical event paths.
- E-75 `/members/[slug]` yields to the explicit `/members/:id` rule (D-8).
- E-76 The donor's "79 organisations" hero and "unconfirmed" record copy are not ported; published
  rows are confirmed by construction.
- E-77 `/programmes` renders three data-backed groupings, not the donor's seven.
- E-78 Title suffix and `openGraph.siteName` split (D-1).

Checklist rows 7.1–7.5 move to `verified` with the PR link when the PR exists (WP-8 fills links).

## 5. Data flow

```
manifest (merge rows) ──► wisetechDesignRedirects() ──► next.config.ts redirects() ──► Next router
inventory (frozen)   ──► donorRouteContractErrors() ◄── manifest          (parity test)
partners table ──► partnersRepository.listPublished(locale) ──► /partners groups ──► cards
content/programs/*  ──► summarizeProgrammes() ──► ProgrammeGrid ──► / (home) and /programmes
publicRoutes ──► sitemap.ts (+x-default) ──► /sitemap.xml ; robots.ts (disallow list)
```

## 6. Error handling

- `/partners` reads with `.catch(() => [])` and renders the honest empty state (public pages
  degrade, never 500). A partner whose logo media is archived is already excluded by the
  repository.
- The generator throws at build time (not at request time) if a merge entry's canonical path is
  not a string — that is a manifest bug and must fail the build, not silently drop a rule.
- Redirect loops are impossible by construction (source ≠ destination after normalisation is
  asserted in the test and by the existing "produces no self-redirect" rule).

## 7. Testing

New: `tests/unit/wisetech-redirects.test.ts` (every inventory `merge` row with a sitemap or
dispatcher id is covered by a rule or an explicit rule; all generated rules are `permanent: false`;
the `/zh/` variant of every rule exists and targets a `/zh/` destination; static→dynamic parent
cases; the `/members` collision is skipped; identity merges produce nothing; sorted, frozen);
`tests/unit/partners-page.test.tsx` (grouping, counts, honest empty state, website link only
when present, "confirmed" never "unconfirmed", contact CTA to `/contact`);
`tests/unit/programmes-page.test.tsx` (three groupings, four catalogue cards from the typed
records, Launch Pad link, mailto from `siteConfig`); `tests/unit/programme-grid.test.tsx`.

Updated: `redirects.test.ts` (exclude generated sources from the "every legacy rule permanent"
check; add "every generated rule is temporary"); `wisetech-route-parity.test.ts` (retired count,
two new `retain` rows, `/partners` and `/programmes` discovered as app routes);
`navigation.test.ts`, `mobile-navigation.test.tsx`, `public-shell.test.tsx`;
`page-indexability.test.ts` (portal and admin layouts, member-login); `seo-routes.test.ts` and
`sitemap.test.ts` (`x-default`); `page-copy-scope.test.ts`; `messages.test.ts` runs unchanged
(parity is structural).

Gate (§7 of the master plan): `audit:strings`, focused tests, `npm test`, lint, typecheck,
`next build` (proves the config-loader import chain), `npm audit --omit=dev --audit-level=high`,
then the four public e2e specs; visual baselines regenerated once at the end with
`--update-snapshots=changed`.

## 8. WP-8 outline (own PR, D-4)

Full gate command log with exit codes; `npm run test:e2e` (public matrix, shell, axe, concierge,
PR3/PR5 journeys, visual baseline) and `npm run test:lighthouse` against WP-7's Vercel Preview
URL; key parity + a `/zh` walk of the 13 home sections and every WP-4/WP-7 page through the
in-app browser; `docs/integration/wisetech-design-fidelity-evidence.md` (before/after per
breakpoint from the committed baselines plus the command log); checklist all `verified`;
owner-only actions recorded in `docs/integration/wisetech-delivery-gates.md` (required `quality`
check, isolated Neon branch + identities, UAT owner, production approval, unsubscribe Phase B on
or after 2026-09-10); a drafted README note for `YNWAforever/wisetech` (the owner pushes it — the
donor repository is read-only to this programme).
