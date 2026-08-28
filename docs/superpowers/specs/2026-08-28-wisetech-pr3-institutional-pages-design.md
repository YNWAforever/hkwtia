# WiseTech PR3 Institutional Pages Design

PR3 is stacked on verified PR2 head `4d28a87eca70466a7f7e64132da9287fea7da3c0`. PR1 remains the route, CTA, source-evidence, and asset-classification authority; PR2 remains the public-shell, semantic-token, and navigation authority.

## Goal and acceptance boundary

Rebuild the homepage and verified institutional family as one photographic, question-led editorial experience without changing any business or content authority. Scope is exactly:

- `/`;
- `/about`, `/about/chairman`, and `/about/committees`;
- `/about/history` and `/about/history/[slug]`;
- `/programs/asa`, `/programs/cpai`, `/programs/hkict`, and `/programs/tct`.

PR3 is accepted when:

1. The homepage leads with one photographic, question-led `h1`, using the current Hong Kong/GBA/global proposition and current own-origin `/images/projects-hero.jpg`.
2. Its primary actions go to `/events` and `/membership`, with a non-blocking discover cue to page content.
3. Event, news, and showcase highlights come only from their current public repositories. Reads are bounded in the database, selection is deterministic, and each domain fails independently to a localized empty/unavailable state.
4. Homepage statistics are removed. No substitute metric, partner wall, testimonial, award, person, or availability claim is manufactured.
5. Programme presentation uses the current four typed route records and separate verified ASA, CPAI, HKICT, and TCT contracts. History uses only `kind: "milestone"` typed records; the existing featured-detail rule remains.
6. About, Chairman, Committees, History, and programme pages adopt a common PR3 editorial language while retaining current translations and claims.
7. Every route preserves metadata, organization structured data where already present, locale fallback, legacy redirects, the PR2 shell, exactly one visible `h1`, and exactly one public `main#main-content`.
8. No donor runtime, donor asset, donor event, donor person, donor partner, donor statistic, or donor programme claim enters the application.
9. No schema, migration, seed, authentication, payment, provider, admin, portal, API, deployment, or production mutation is included.

This is one independently previewable PR. Events, News, Showcase, Launch Pad, Membership, Contact, Join, portal, and admin redesigns remain later slices.

## Source authority and donor boundary

The user-authorized design donor is `https://github.com/YNWAforever/wisetech` pinned at commit `f91ecc5fa29c2b9d416ed8315f23e9492baf993d`, tree `d13a99e6c47f2b3ea279c5d02da5cf15008807b7`. It is evidence for composition, hierarchy, spacing, and editorial interaction only. All 99 donor assets remain unreviewed, retired, and non-publishable. Donor static records and visual copy do not establish current facts.

Authorities, in descending order, are:

1. current hkwtia routes, metadata helpers, structured-data builders, legacy redirects, and PR2 shell;
2. current English and Traditional Chinese message bundles and safe `page_copy` override path;
3. current public repositories for events, news, and showcase;
4. current typed milestone/programme records and associated tracked own-origin archive images;
5. donor presentation patterns, never donor runtime, assets, or claims.

`/images/projects-hero.jpg` and `/images/about-hero.jpg` are the only root hero photographs available to PR3. History/programme images render only when referenced by their typed records. No remote image host, copied donor file, or unassociated archive file is added.

## Options considered

**Restyle current pages and keep Home static.** Rejected: it would not meet the repository-backed feature requirement and would retain statistics without an evidence model.

**Load complete event, news, and showcase lists in the page and slice them.** Rejected: rendering one item would conceal unbounded database reads, and a broad catch would couple unrelated failures.

**Add bounded options to canonical public reads and compose them through a small fail-closed loader.** Selected: repositories retain publication/sort authority; the loader owns only cross-domain availability and cannot query tables or invent fallback data.

Changing `PageHero` globally was also rejected. Later routes still consume its current defaults and are not reviewed in PR3. Focused PR3 components move only in-scope routes.

## Architecture and data flow

### Bounded repository reads

Existing public APIs gain backward-compatible optional bounds:

- `eventsRepository.listFeaturedPublic(anonymous, {asOf, limit})` returns upcoming records with `published === true`, `memberOnly === false`, and `startsAt >= asOf`, ordered `startsAt ASC, slug ASC`.
- `listPublishedNews(asOf, {limit})` retains `kind = news`, publication/archive predicates, and `publishedAt DESC, slug ASC`, adding SQL `LIMIT` when supplied.
- `showcaseRepository.listPublished(filters, {limit})` retains published-only filtering and `premium DESC, category ASC, nameEn ASC, slug ASC`, applying the bound in its database store and again after pure sorting so injected stores cannot violate the returned bound.

`limit` is a positive integer capped at 12. Home requests exactly one item per dynamic domain. Existing listing pages omit the option and retain current behaviour. Tests assert the SQL limit for database adapters and deterministic limits for in-memory sources.

### Homepage aggregation

`lib/home/home-highlights.ts` exports:

```ts
export type HomeSlot<T> =
  | Readonly<{status: "available"; item: T}>
  | Readonly<{status: "empty"}>
  | Readonly<{status: "unavailable"}>;

export type HomeHighlights = Readonly<{
  event: HomeSlot<LocalizedEvent>;
  news: HomeSlot<PublishedNewsSummary>;
  showcase: HomeSlot<PublicListing>;
}>;

export function loadHomeHighlights(input: Readonly<{
  locale: AppLocale;
  asOf?: Date;
  readers?: HomeHighlightReaders;
}>): Promise<HomeHighlights>;
```

Default readers call only the three canonical APIs. The loader starts all reads together with `Promise.allSettled`. A fulfilled empty list becomes `empty`; a rejected read becomes `unavailable`; only the first bounded item becomes `available`. It does not log raw database errors, retry, query a second domain, fall back to build logs, or insert static data. Injected `asOf` makes event/news choice deterministic in tests.

Home becomes `force-dynamic`. Metadata stays with `buildPageMetadata`; existing organization JSON-LD stays with `buildOrganizationData()`. A database-free build remains valid because lazy read failures settle inside the loader.

## Component design

### `EditorialHero`

A Home-only Server Component. It renders the own-origin image through `next/image` with `priority`, responsive `sizes`, and a contrast overlay; one question-led `h1`; proposition; two real localized anchors; and a discover anchor targeting `#home-discover`. It is a section, not a `main`, and has no client state or scripted animation.

### `HomeHighlightCard`

Renders one serializable view model or localized state. It uses `h3` because the containing section owns `h2`. Available cards show only repository-derived title, summary/date/category/logo plus canonical link. Empty/unavailable states show no fake record and link safely to the list route. Showcase logos come only from curated media through `toPublicListing`.

### `InstitutionalPageIntro`, `StorySection`, and `MediaGallery`

PR3-only Server Components:

- `InstitutionalPageIntro`: eyebrow, one `h1`, lead, optional current own-origin image; no `PageHero` changes.
- `StorySection`: one `h2`, optional intro, content slot, and plain/warm presentation with no domain policy.
- `MediaGallery`: already-localized `{src, alt}` records, intrinsic dimensions, responsive sizes, below-fold lazy loading, stable source keys; no remote URL or record discovery.

`ProgramDetail` composes the new intro. `ProgramEditions`, `ProgramCredential`, and history detail compose the shared story/gallery primitives where useful. Domain decisions stay intact: CPAI is a credential, TCT has no winner category, and ASA/HKICT absence variants remain explicit.

### Page compositions

- **Home:** editorial hero; three live highlight cards; existing three association roles; four programme routes from `content/programs`; no `Stats`.
- **About:** current founding year, legal form, mission, and roles in an editorial sequence ending at `/about/history`.
- **Chairman:** current unattributed message only. No portrait, person name, biography, or expanded signature.
- **Committees:** current three descriptions only. No roster, chair, tenure, or governance statistic.
- **History:** `milestonesOnly(milestones)`, newest year first. Only featured records link to details; non-featured bodies stay inline. Detail routes retain three static params and safe 404 behaviour.
- **Programmes:** current four route records, translations, separate typed records, agency lookups, explicit absence variants, and record-linked galleries. No generic edition route/index.

## Localization, metadata, and legacy behaviour

New visible strings stay in existing allowlisted namespaces in `messages/en.json` and `messages/zh-HK.json`. Tree parity and visible-string audit remain blocking. Current fallback through `i18n/request.ts` and `page_copy` is untouched.

Every existing `generateMetadata` keeps its pathname/image inputs. No canonical path changes. `next.config.ts`, legacy redirects, sitemap, robots, and PR1 manifest are read-only. Home retains organization JSON-LD; no Person, partner, award, event, or programme schema is added.

## Accessibility and responsive behaviour

- Public layout remains the sole `main#main-content`; route components render sections/articles only.
- Every route has one visible `h1`; hierarchy is `h2` then item/card `h3`.
- CTA/discover anchors are at least 44 by 44 CSS pixels with visible focus.
- Hero text remains readable if the image fails and meets overlay contrast.
- Layouts fit 320, 375, 768, 1024, and 1440 CSS pixels without overflow; cards/galleries collapse; Chinese strings wrap.
- No meaning depends on hover, colour, motion, or image visibility.
- The fixed Concierge must not cover Home CTA controls at 375 pixels.

## Failure handling and invariants

- Each dynamic domain fails independently; one outage never suppresses another.
- Empty/unavailable are distinct internal states but expose no database/provider detail.
- Missing records never activate static placeholders.
- Invalid limits fail before a database read.
- Unknown, non-milestone, or non-featured history slugs remain 404s.
- Typed programme absence remains absence; presentation never turns it into a claim.
- Repository order is feature order; no random, view-count, or client-time selection.
- `PageHero` keeps its current API/defaults outside PR3.
- Donor imports, remote image hosts, schema, migrations, seeds, protected routes, auth, payments, providers, and production state remain excluded by a source guard.

## Test strategy

Implementation uses red-green slices:

1. Repository tests prove predicates, deterministic order, bounds, and pre-read limit validation.
2. Loader tests prove all-success, empty, and independent one/two/three-failure states with injected time/readers.
3. Component tests render both locales and prove headings, canonical CTAs, status rendering, image policy, and absence of statistics/static records.
4. Existing About, history, programme-schema/content/contradiction, metadata, redirect, locale, message, and landmark contracts stay blocking.
5. Playwright expands the route matrix to all PR3 routes/locales, asserts one `h1`/one `main`, checks overflow/44-pixel actions, and runs axe on representative Home, Chairman, History detail, and programme pages.
6. Screenshots at 375 and 1440 pixels are review evidence, not acceptance substitutes.

## Verification and external gates

Local command gate:

```powershell
npm.cmd test -- tests/unit/public-event-repository.test.ts tests/unit/public-posts-repository.test.ts tests/unit/m5-repository.test.ts tests/unit/home-highlights.test.ts tests/unit/homepage.test.tsx tests/unit/institutional-pages.test.tsx tests/unit/history-page.test.tsx tests/unit/history-detail.test.ts tests/unit/program-content.test.ts tests/unit/program-contradicted-claims.test.ts
npm.cmd run audit:strings
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:e2e -- tests/e2e/wisetech-pr3-public-pages.spec.ts tests/e2e/accessibility.spec.ts tests/e2e/public-route-matrix.spec.ts
npm.cmd audit --omit=dev --audit-level=high
git diff --check 4d28a87eca70466a7f7e64132da9287fea7da3c0...HEAD
```

E2E evidence must state its actual base URL and database availability. A local fail-closed run proves graceful degradation, not live record correctness. Isolated-Neon Preview, screenshot review, Lighthouse, GitHub Actions, Vercel, content-owner review, asset-rights review, and production approval are separate external gates. PR3 neither seeds nor exercises production.

## Pull-request boundary

PR3 contains only its planning documents, approved PR3 components, current route compositions, bounded public-read extensions, Home loader, bilingual message additions, and focused tests. It remains stacked on PR2 until PR2 merges. It does not modify global `PageHero`, manifests, redirects, schema, migrations, seeds, auth, payments, APIs, protected layouts, provider configuration, or external state.
