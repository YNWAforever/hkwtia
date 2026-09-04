# WP-4 · Inner-Page Patterns Over Real Journeys — Design

Fifth work package of the WiseTech design-fidelity programme (`docs/superpowers/plans/2026-09-01-wisetech-design-fidelity.md` §5 WP-4). WP-1 (tokens), WP-2 (public shell), and WP-3 (homepage) are merged to `main`. This spec covers all of WP-4 in one pass, comprehensively, per the owner's explicit choice not to decompose it further — every remaining public page, not a subset.

**Scope.** Ten page-groups, roughly twenty routes: `/events` + `/events/[slug]`; `/showcase` + `/showcase/[slug]`; `/membership`; `/about` + `/about/history` + `/about/history/[slug]` + `/about/chairman` + `/about/committees`; `/programs/{asa,tct,hkict,cpai}`; `/launchpad`; `/news` + `/news/[slug]`; `/contact`; `/ai-transparency` + `/ai-ops` + `/privacy`; `not-found.tsx`. Every one of these already reads real data (a repository or a typed content record) or real static copy — WP-4 is a presentation-layer pass over working pages, the same posture WP-2 and WP-3 took, not greenfield page-building. `PageHero` (`components/wt/page-hero.tsx`, built in WP-1) already supports everything needed — image, breadcrumb, actions, `page`/`inner` variants — for every page in this spec except the small number of genuinely new pieces called out below (the `EventCard`/calendar view, the prepared-email form, the launchpad route-board).

**Out of scope**, confirmed against the master plan and current code:
- `/about/leadership`, `/about/governance` — the master plan itself says these "remain merges (redirects in WP-7)"; WP-4 does not touch them.
- `/search`, `/accessibility`, `/terms`, and the retired `/portal/{introductions,programmes,councils,gba,preferences}` routes — WP-7's table keeps these retired; not WP-4's concern.
- `/programmes` (the un-retired index page) — WP-7's job. Its own `content/programs/index.ts` already exists today as a minimal 4-field record (`id`/`namespace`/`image`) consumed by four `/programs/*` pages and several tests; WP-7 will need to either extend this file or introduce a differently-scoped one rather than assume it's greenfield. Noted here for the record since this spec's research surfaced it; not a WP-4 deliverable.
- Content/asset migration (partner records, archive photography) — WP-5's job, after WP-4. Every page in this spec renders its `HonestEmpty`/degraded state wherever WP-5's data hasn't landed yet, the same pattern WP-3 established for the homepage.

## 1. Decisions

Eight decisions were needed beyond what the master plan already specifies, resolved during brainstorming:

1. **`/about/history/[slug]` is in scope.** Not named in the master plan's WP-4 bullet, but it shares every component with `/about/history` (`InstitutionalPageIntro`, `StorySection`, `MediaGallery`) and would be a visually orphaned page if excluded. Gets the identical RichPage treatment as its list page.

2. **`/news` gets no filter-chip taxonomy.** The donor's `InsightsPage` pattern implies category chips, but `posts` (`lib/db/schema-core.ts:73`) has only a `kind` column (`postKindEnum`: `"news" | "buildlog" | "page"`), no `tags` column, and the public repository only ever surfaces `news` and `buildlog`. Building chips for a taxonomy the data doesn't support would be the same dishonesty-in-the-empty-state problem D-8 and `HonestEmpty` exist to prevent everywhere else in this programme. Instead: a `status-label` per card distinguishes News from Build Log within one grid.

3. **`/ai-ops` gets a real page-level `PageHero`.** Today its header is built inline inside `AiOpsDashboard` (`components/marketing/aiops/dashboard.tsx`), the only page in WP-4's scope with no hero component at all, page-level or otherwise. Extracted so every WP-4 page shares one hero contract; `AiOpsDashboardLabels` loses its header-related fields, `AiOpsDashboard` starts one level lower (metrics only).

4. **`not-found.tsx` moves under `(public)/`.** Today `app/[locale]/not-found.tsx` is wrapped only by the bare `app/[locale]/layout.tsx` — no `SiteHeader`, `SiteFooter`, `ConciergeWidget`, or even the `wisetech.css`/`wisetech-shell.css` imports, all of which are mounted exclusively by `app/[locale]/(public)/layout.tsx`. The current 404 page therefore renders with zero site chrome. Moving it to `app/[locale]/(public)/not-found.tsx` (Next.js route groups support their own `not-found.tsx`) lets it inherit the shell naturally. The root-level file stays in place as a bare fallback for routes that don't resolve to a locale at all — it is not deleted, just no longer the one real users hit from inside the public site.

5. **The concierge launcher gets wrapped in `.concierge`.** Errata E-44 undersold this: the donor's `.concierge` wrapper rules (`app/styles/wisetech.css:286,291,419,445,449,860` — the fixed offset, the three `.site-root:has(.event-action-bar) .concierge` lifts, and the narrow-viewport hide) are completely inert today, because no element anywhere carries the `.concierge` class — `ConciergeWidget`'s trigger (`components/ai/concierge-widget.tsx:542-547`) is a bare button positioned by its own Tailwind utilities. This is greenfield, not "half-done." Wrapping the trigger in a `.concierge` div activates six already-written, already-correct donor rules rather than inventing bespoke Tailwind offset classes keyed off page state.

6. **The breadcrumb is promoted to a landmark now.** Errata E-11 deferred this to WP-4 without mandating it. `components/wt/page-hero.tsx`'s breadcrumb is still a bare `div.breadcrumb`; no existing test depends on that (`tests/unit/public-landmark-contract.test.ts` only polices `<main>` ownership, not breadcrumbs). Since WP-4 touches the breadcrumb on nearly every page in scope, this is the natural point to fix it once at the shared-primitive level (`<nav aria-label="Breadcrumb">`, new message key for the label) rather than defer a third time.

7. **The events calendar view is built for real, scoped modestly.** No `EventCard`, no calendar/list-view-switch logic exists anywhere in the codebase today — a bigger lift than the master plan's one-line mention implies. Built as a genuine toggle (not a stub), but scoped to a list-grouped-by-date view over the same result set, not an interactive month-grid or date-picker widget.

8. **`/contact`'s six enquiry-route cards** are `/events`, `/membership`, `/showcase`, `/launchpad`, `/about`, `/news` — the existing four plus `/about` (partnership-style enquiries) and `/news` (media enquiries), rounding out from today's four to the donor's six.

## 2. Group A — Events & Conversion

### `/events`

Current: `app/[locale]/(public)/events/page.tsx`, single file, old `components/marketing/page-hero.tsx`, real data via `eventsRepository.listPublic(anonymous, {status, asOf, locale})` degrading to `EmptyState`. Two-link nav (`Open`/`Past`) plus a plain two-column `glass-card` grid.

Target:
- `PageHero` (`variant="inner"`, community photo, breadcrumb `Home / Events`).
- `.event-quick-tabs`: two `aria-pressed` toggle buttons, Open Now / Past Events, driving the existing `status` query param — no new state, the same server-read-per-navigation pattern the homepage's `OpenNow` section already uses.
- `.activity-type-strip`: three static links — `/events?status=open`, `/launchpad`, `/showcase`. Explicitly not the donor's `/activities/*` routes, which don't exist here.
- `.event-results-head`: a `role="status"` live-region count ("N events found") above the results, updating with the query.
- `.event-view-switch`: cards ↔ list-by-date, `?view=calendar` in the URL via `router.replace` (client island, matches the pattern `MarketProducts`/`OpenNow` established for reading query state). The calendar view groups the identical result set under day headers rather than rendering per-status cards in a row — same data, same repository call, different layout component.
- New `EventCard` component (donor `.event-library` card grammar: status pill, `<time>`, venue, format badge, CTA) replacing the current `glass-card` articles.
- Recommendations row → `/launchpad`, `/showcase`, `/membership`; interest band; closing band "Host or partner" → `/contact`.

### `/events/[slug]`

Current: `app/[locale]/(public)/events/[slug]/page.tsx` + `components/marketing/event-detail.tsx` + `components/portal/event-registration-form.tsx`, all wired to `eventsRepository.getPublicBySlug`, `notFound()` on miss, `StructuredData`/`buildEventData` JSON-LD already correct. No hero component at all today, old or new.

Target: donor `.event-detail-hero` over the event's own-origin hero media (PR5 `0023`), `.event-detail-facts` (date/venue/format/capacity), `.event-detail-layout` main/aside split, `.event-action-bar` wrapping the *existing* `EventRegistrationForm` for `open` events (no change to its logic, only its container) or a "Past event" state otherwise. This is the route the concierge/`.concierge`-wrapper fix (Decision 5) is actually needed for, since it's the only page that renders an `.event-action-bar`.

## 3. Group B — Showcase & Membership

### `/showcase`

Current: old page-hero, `showcaseRepository.listPublished(filters)` degrading to `[]` → `EmptyState`, existing `ShowcaseFilters` + `ShowcaseCard` grid, an owner-CTA banner to `/portal/company/listing`.

Target:
- `PageHero` (membership/ecosystem visual).
- `.directory-prompts`: 6 buttons submitting `?q=<preset>` through the existing filter form — preset values only, no new state.
- `.directory-search`: existing `ShowcaseFilters`, restyled, same `GET` semantics, plus the **E-29 fix**: `id="q"` on the search input (currently `name="q"` with no `id` — `/showcase#q` cannot deep-link to a `name`-only field) so the homepage's Market Products panel (and anything else) can jump straight to search.
- `.solution-needs`: 12 use-case chips → `?useCase=<slug>`, additive alongside `q`.
- Results grid: existing `ShowcaseCard`, restyled; `HonestEmpty` at zero results.
- `.solution-verification`: a static badge-definitions block under a `status-label` reading "Proposed badge definitions — not currently awarded" (donor copy, verbatim, both locales).
- `.solution-pathways`: buyer → `/contact`; provider → `/portal/company/listing` (auth), with public fallback copy for anonymous visitors.
- Interest band → `/events`.

### `/showcase/[slug]`

No logic change. Donor's `PendingRecordPage` pattern is explicitly not used — real records exist. `ShowcaseDetail` + `RequestIntroForm` + `ShowcaseViewBeacon` restyled to the inner-page grammar only.

### `/membership`

Current: old page-hero, `membershipPlansRepository.list()` → `buildPublicMembershipCatalog`, degrading to a plain unavailable-text fallback. `TierComparison`/FAQ only — no `.plan-grid`, no SME card, no `.pricing-note`, no `.membership-dimensions`, no `.first-90`.

Confirmed: `PLAN_CODES` (`lib/membership/plans.ts:6`) is exactly `["community", "startup", "corporate", "patron"]` — matches the donor's four anchor ids one-to-one, no mismatch to design around.

Target:
- `PageHero`.
- `.plan-grid`: 4 cards over `buildPublicMembershipCatalog`, `id` anchors `community`/`startup`/`corporate`/`patron`, "Discuss this pathway" → `/join?plan=<code>`.
- SME pathway card (D-7) — a 5th, visually distinct card matching the homepage Pathways section's own SME framing, not a 5th tier.
- `.pricing-note`: real prices when `publicPriceIds()` resolve; the donor's "confirm with the membership team" copy otherwise (the fallback branch already exists in spirit today via `t("unavailable")`, just needs the donor's specific wording).
- `.membership-dimensions`: 12 tiles, per-tier text from a new `Membership.dimensions.*` namespace.
- `.first-90` steps (a donor marker class, no functional behavior of its own).
- Actions → `/join`, `mailto:`.

## 4. Group C — Institutional

`/about`, `/about/history`, `/about/history/[slug]`, `/about/chairman`, `/about/committees` all currently share `InstitutionalPageIntro` + `StorySection`, none with a page-level hero. One consistent "RichPage" treatment across all five, grounded in real donor classes: `.rich-page-hero`, `.rich-compass`/`.rich-compass-grid` (a 3-column quick-link/stat grid), `.rich-items`/`.rich-items-cards` (2-or-3-column card grid), `.manifesto` (full-bleed ink mission-statement block), `.proof-strip`/`.proof-inner` (the stats-strip already used on the homepage).

- `PageHero` (`variant="page"`, breadcrumb; `/about` gets the institutional photo, sub-pages a plain text hero).
- `.rich-compass`: a 3-column grid of page-specific quick links/stats — e.g. `/about`'s compass links to History/Chairman/Committees; `/about/history`'s surfaces founding year/milestone count/latest edition. Restraint applies here the same way `HonestEmpty` applies elsewhere: don't manufacture a 3-item compass grid on `/about/chairman` or `/about/committees` if there's nothing meaningful to link or count for that page — a lighter shell with no compass section is correct there, not a gap.
- Existing `StorySection` content restyled into `.rich-items-cards` where it's already card-shaped, left as prose where it isn't.
- `.manifesto`: the mission-statement block, used once on `/about` for the association's existing static mission copy — re-homed, not rewritten.
- `/about/history` keeps `MilestoneTimeline` as its centerpiece inside the RichPage shell, not replaced.
- `/about/history/[slug]` (Decision 1) gets the identical hero/compass treatment as its list page; `MediaGallery` untouched.
- A related-routes footer row on every page in this group, linking the other three About sub-pages.

### `/programs/{asa,tct,hkict,cpai}`

Current: all four use `ProgramDetail` (`InstitutionalPageIntro` + `StorySection`) over real, typed, Zod-validated content (`content/programs/*.ts`) — not stubs. `asa`/`tct`/`hkict` use `ProgramEditions`; `cpai` uniquely uses `ProgramCredential` (a credential has no editions to show — the spec states this explicitly so the plan doesn't try to force `ProgramEditions` onto `cpai`).

Target: donor `ProgrammeRecordPage` header (programme-type eyebrow, audience, one key fact, source-link action) via `PageHero`, `ProgramEditions`/`ProgramCredential` kept exactly as each programme already uses it, below the header. "Ask the programme team" → `mailto:` (D-6) on all four.

## 5. Group D — Launchpad, News, Contact, and the Rest

### `/launchpad`

Current: old page-hero, real multi-source data (`cohortRepository.listPublicCohorts`, `landingPartnersRepository.listPublished`, both degrading to `[]`), a fully working `CohortCalendar` → `LandingPartnerMap` → `FundingWizard`/`FundingResults` → conditional `CohortApplicationForm` stack.

Target: prepend a donor `GbaPage` opening above the existing, untouched stack:
- `PageHero`.
- `.gba-route-board` + `.route-map`: the same 3-node HK/GZ/SZ route visualization already built for the homepage's GBA Gateway section — reused, not rebuilt.
- `.service-grid`: 4 descriptive cards — Market entry / Soft landing / Buyer matching / Delegations — explicitly descriptive, no CTAs to features that don't exist.
- Everything below (calendar, partner map, funding wizard, application form) restyled to sit inside the new shell, logic untouched.

### `/news`, `/news/[slug]`

Current: list page has old page-hero; detail page has neither, renders `NewsDetail`/`BuildLogDetail` directly. Data via `lib/db/repos/public-posts.ts`, degrading to `[]`. No filter UI today.

Target (per Decision 2, no filter chips): `PageHero` on the list page, a `status-label` per card distinguishing News from Build Log within one grid (no separate sections), a static "research quality" block, a subscribe band (D-6, reusing the newsletter mailto pattern WP-2 already built for the footer). Detail page restyled in place, `NewsDetail`/`BuildLogDetail` logic untouched.

### `/contact`

Current: old page-hero, `siteConfig.contact.phone` read correctly (guarded), but `contact@hkwtia.org` hardcoded inline rather than reading `siteConfig.contact.email`. Four route cards (`/events`/`/membership`/`/showcase`/`/launchpad`); a `mailto:` link, not a form; no `?topic=` handling.

Target:
- `PageHero`.
- Channels `<address>` block: fix the email to read `siteConfig.contact.email` (matching how phone is already handled, closing the one inconsistency found).
- `.inner-card-grid` of 6 route cards (Decision 8): `/events`, `/membership`, `/showcase`, `/launchpad`, `/about`, `/news`.
- A prepared-email form: a small client component accepting a `topic` (from `?topic=portal|membership|events|programmes|partnership|privacy|media` or a select), composing a `mailto:` link with a prefilled subject/body per topic. No persistence, no server action — matches the master plan's own instruction and the newsletter's established mailto pattern.
- `ContactConciergeLauncher` CTA banner, unchanged.

### `/ai-transparency`, `/privacy`

`PageHero` (governance visual) + existing `PolicySections`. No logic changes; the most straightforward pages in this spec.

### `/ai-ops`

Per Decision 3: extract `AiOpsDashboard`'s inline header into a page-level `PageHero` call. `AiOpsDashboardLabels` loses its header fields; `AiOpsDashboard` starts one level lower (metrics content only, real data via `aiOpsPublicRepository.readLatestTwelveMonths()` + `publicPostsRepository.listPublishedBuildLogs()`, both already correctly degrading). Metric cards adopt `.impact-metrics` styling, reusing the exact classes the homepage's Impact Evidence section already uses.

### `not-found.tsx`

Per Decision 4: move to `app/[locale]/(public)/not-found.tsx`, inheriting the shell automatically. Content: donor `InnerHero` ("Go to the homepage" / "Find an event"). Root-level `app/[locale]/not-found.tsx` stays as a bare fallback for routes that don't resolve to a locale at all.

## 6. Cross-Cutting Changes

These touch the shared primitives, not any single page, so they land once and every page above inherits them:

- **`components/wt/page-hero.tsx`**: breadcrumb becomes `<nav aria-label="Breadcrumb">` (Decision 6), new message key for the label.
- **`components/ai/concierge-widget.tsx`**: trigger wrapped in a `.concierge` div (Decision 5), activating the donor's existing offset/hide rules — relevant wherever `.event-action-bar` renders, i.e. `/events/[slug]`.

## 7. Testing

One rendered test per page under `tests/unit/wt-pages/*.test.tsx` (per the master plan), asserting hero presence, section order, and empty-state behavior where a page reads real data. `tests/e2e/public-route-matrix.spec.ts` and `tests/e2e/wisetech-pr5-public-journeys.spec.ts` selectors updated for the new markup. `event-public-*`, `m5-*`, `membership-*` suites — which pin the underlying business contracts these pages read from — stay green throughout; none of their logic changes. Bilingual parity via `tests/unit/messages.test.ts` plus a manual `/zh` walk of every page in this spec, the same gate WP-3 used for the homepage.

## 8. Self-Review

**Placeholder scan.** No TBDs; every page has a stated target. The two items flagged as "not WP-4's job" (the `/about/leadership`/`/about/governance` merges, and `content/programs/index.ts`'s WP-7 collision) are explicitly named as out of scope rather than left silent.

**Internal consistency.** The `PageHero` contract (image/breadcrumb/actions/variant) used throughout Groups A-D matches its actual current implementation (`components/wt/page-hero.tsx`), verified by reading the file rather than assumed. The `cpai`/`ProgramCredential` vs. `asa,tct,hkict`/`ProgramEditions` split is stated explicitly in §4 specifically to prevent the plan from later trying to force one shape onto the other.

**Scope check.** This is comprehensive by the owner's explicit choice, not a single-implementation-plan-sized unit — the eventual implementation plan will need many tasks (WP-3's homepage alone, a fifth of this scope, took 16). That tradeoff was surfaced and accepted before this spec was written, not discovered here.

**Ambiguity check.** Every "restyle in place, no logic change" instruction above is paired with the specific existing component it applies to, so "restyle" can't be misread as "rebuild." The one place restraint matters and could otherwise be missed — Group C's compass grids on thin-content pages — is called out explicitly rather than left to be inferred.
