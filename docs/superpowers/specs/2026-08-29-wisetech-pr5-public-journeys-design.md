# WiseTech PR5 Public Journeys Design

**Status:** authoritative implementation design
**Date:** 2026-08-29
**Base:** PR4 head `07cbcf79ab0b5ee3676cc61c38e30437e8c8f184`
**Target branch:** `codex/wisetech-pr5-public-journeys`

## Outcome

PR5 applies the reconciled WiseTech Site v13 presentation patterns to the current public Events, News, Showcase, Launch Pad, Membership, Contact, announcement, and homepage-partner journeys. It is a public read-model and presentation cutover over existing hkwtia authorities, plus the smallest additive Event media relation needed by that presentation.

The current Next.js App Router, `next-intl`, repositories under `lib/db/repos`, Server Actions, Neon Auth, Stripe services, own-origin media delivery, and Concierge runtime remain authoritative. The donor is evidence only: `https://github.com/YNWAforever/wisetech` is frozen locally at commit `f91ecc5fa29c2b9d416ed8315f23e9492baf993d`, tree `d13a99e6c47f2b3ea279c5d02da5cf15008807b7`. No donor runtime, data, asset, logo, form, router, authentication, or provider configuration enters PR5.

## Evidence and context

This design is constrained by:

- `docs/integration/wisetech-authoritative-source-reconciliation.md` and `config/wisetech-authoritative-source-inventory.ts`, which classify the donor as presentation/source evidence and mark all donor assets and 79 historical partner logos non-publishable;
- `docs/integration/wisetech-route-parity.md`, which maps donor journeys onto current canonical routes and durable owners;
- `docs/integration/wisetech-content-mapping.md` and `docs/integration/wisetech-component-inventory.md`, which prohibit a second editable truth, donor runtime, unverified relationship claims, and a general inquiry workflow;
- `docs/superpowers/specs/2026-08-28-wisetech-pr4-cms-data-design.md` and `docs/integration/wisetech-pr4-migration-and-import.md`, which establish PR4's announcement, partner, landing-partner, private-media, and localized-news authorities without making a public cutover; and
- `docs/integration/wisetech-delivery-gates.md`, which fixes PR5 between the PR4 data/CMS foundation and PR6 Join/portal/admin alignment.

The current route and repository audit confirms the concrete owners named below. Where a current API must change, PR5 extends that owner rather than placing data access in a page or Client Component.

## Scope

PR5 includes:

- activating the existing announcement projection in the public layout;
- a rights-gated homepage partner wall;
- public Events filtering, Event hero media, detail context, and explicit registration outcomes;
- locale-aware News projections and rendering with no Chinese-body fallback;
- presentation and regression work over the existing Showcase filters, views, and introduction lead;
- the atomic Launch Pad cutover from static partner config to the published repository projection;
- a server-only, reconciled public membership catalog consumed by the marketing page; and
- Contact route cards plus a presentation-only launcher for the existing Concierge dialog.

## Non-goals and prohibited work

PR5 does not:

- import or copy donor events, news, partners, logos, testimonials, metrics, membership rows, forms, assets, router, authentication, Workers/D1 runtime, or content;
- rewrite Neon Auth, Join, onboarding, checkout, Stripe webhooks, or payment state;
- create an inquiry table, inquiry form, inquiry Server Action, second directory, second lead flow, second assistant runtime, or browser-side database client;
- create registration-window, event-format, or CTA-state columns;
- infer membership, sponsorship, endorsement, relationship, rights, translation approval, or publication from donor evidence;
- execute a migration, seed/import rows, inspect or configure providers, deploy, merge, or mutate Preview/Production; or
- make PR6 or PR7 behavior appear complete.

## Ownership and flow map

```text
site_announcements -> announcementsRepository.getActive(asOf) -> PublicLayout -> AnnouncementBar
partners + active media -> partnersRepository.listPublished(locale, {limit: 12}) -> HomePage partner wall

events + optional active media -> eventsRepository public projections -> /events + /events/[slug]
event detail -> existing registration Server Action -> eventsRepository.register -> event_registrations

posts(kind=news) -> locale-aware publicPostsRepository -> /news + /news/[slug] + home news slot
posts(kind=buildlog) -> unchanged build-log readers -> /news/[slug] and AI-Ops evidence

showcase_listings + media -> showcaseRepository -> /showcase + /showcase/[slug]
showcase detail -> existing requestIntroAction -> existing leads owner

cohorts -> cohortRepository -> Launch Pad calendar/application
landing_partners -> landingPartnersRepository.listPublished({limit: 100}) -> Launch Pad partner map
query string -> existing deterministic funding parser/rules -> Launch Pad results

membership_plans -> repository-only read -> server-only catalog adapter
PLAN_CODES + PLAN_CATALOG + server env price IDs -> reconciled marketing projection -> /membership

Contact route card -> existing durable route
Contact Concierge launcher -> same-window open contract -> existing ConciergeWidget -> /api/ai/concierge
```

Only server code loads repositories. Public pages receive display-safe projections. A database/CMS read error is never permission to activate static or donor content.

## Public shell and homepage

### Announcement cutover

`app/[locale]/(public)/layout.tsx` replaces the hard-coded `announcement={null}` with a guarded call to `announcementsRepository.getActive(new Date())`. The repository remains the sole owner of publication, archive, time-window, and deterministic priority selection: unarchived; published no later than the injected time; `startsAt <= asOf < endsAt`; priority descending; start descending; id ascending; one row.

The selected persisted row is localized through the established safe projection before it reaches `AnnouncementBar`. A repository error, invalid projection, or no active row yields `null`. The layout still renders the rest of the public shell; it never exposes lifecycle fields and never falls back to a hard-coded announcement.

### Homepage partner wall

`app/[locale]/(public)/page.tsx` obtains at most 12 records through `partnersRepository.listPublished(locale, {limit: 12})`. That existing projection remains responsible for publication, archive, relationship dates, relationship confirmation, logo-rights confirmation, active media, bilingual alt text, locale-specific name, deterministic order, and safe HTTPS website values.

The wall renders only those projected records. It uses the projected localized alt text and, when present, a safe website link with normal external-link protections. Zero rows, invalid projection, or a read failure hides the entire wall without shifting an error into unrelated homepage highlights. No donor logo directory or static fallback is permitted.

Uploaded logos whose source is exactly `/api/media/<uuid>` render with image optimization bypassed so every request reaches the revocation and integrity route. Other approved own-origin registry images continue through the existing image policy.

## Events

### Additive Event hero relation

PR5 adds nullable `events.hero_media_id` in `lib/db/schema-core.ts`, referencing `media.id` with `ON DELETE SET NULL`, plus an index. The generated artifacts are:

- `drizzle/0023_wisetech_event_hero.sql`;
- `drizzle/meta/0023_snapshot.json`; and
- the matching journal index/tag in `drizzle/meta/_journal.json`.

There is no data backfill. Existing Events remain valid with a null hero.

The event create/update input accepts `heroMediaId` as an empty value or UUID; an empty form value normalizes to `null`. The mutation locks and validates the selected media row in the same transaction as the Event write. A missing or archived media row produces a field-level validation failure. Admin Event create/edit pages obtain options only from `mediaRepository.listActiveForAdmin(actor)` and do not accept a URL as a substitute.

Public Event list/detail reads left-join a display-safe media projection. A hero/card is returned only when the referenced media row remains unarchived; a stale, deleted, or archived join behaves as no image. The media archive transaction extends its current Showcase/general-Partner reference count with Event `hero_media_id` references and rejects archive with `MEDIA_IN_USE` while any such reference exists.

### Public status parser and read model

`/events` preserves one query parameter:

- `status=open` is the default;
- `status=past` selects completed Events; and
- a missing, unknown, empty, or multi-valued `status` deterministically becomes `open`.

For every Event, the boundary is `endsAt ?? startsAt`. At injected `asOf`, `open` means boundary greater than or equal to `asOf`; `past` means boundary before `asOf`. Open Events sort by boundary ascending then slug/id ascending; past Events sort by boundary descending then slug/id ascending. Public queries still require `published = true` and `member_only = false`. Member-only Events do not appear in list results, detail lookup, metadata, static parameters, homepage highlights, or structured data.

The parser is pure and the repository applies the same status/boundary semantics in SQL and injected test sources. Page links and the current `LocaleSwitcher` preserve the selected query because locale replacement retains pathname, serialized query, and hash.

### Event detail and registration

The public detail presents the localized title/description, hero when available, Hong Kong date/time, venue, and honest capacity context. It offers the established registration journey only when the public Event is not past. It does not manufacture remaining-capacity numbers unless the existing repository projection supplies them.

The registration Server Action reuses `eventsRepository.register` and resolves the current actor on the server. Its public action state explicitly distinguishes:

- `registered`;
- `waitlist`;
- `already_registered`;
- `already_waitlisted`;
- `unauthenticated`;
- `ineligible` for no eligible membership;
- `closed`; and
- `error` for an unexpected sanitized failure.

The UI maps each state to localized text and never reports a waitlist result as registration success. Unauthenticated and ineligible states may link only to already-valid sign-in or membership destinations; PR5 does not invent a return URL or alter authentication.

`eventsRepository.register` enforces closure inside the existing transaction after locking the Event row. The locked projection includes `startsAt` and `endsAt`; the same `endsAt ?? startsAt` boundary is closed only when it is before the transaction's injected clock. Publication, membership eligibility, capacity, registration rows, and Event dates remain the only state owners. Duplicate registration handling and capacity/waitlist selection stay under the same row lock.

## News

Build-log readers and storage remain unchanged: `listPublishedBuildLogs` and `getPublishedBuildLogBySlug` continue selecting `body_mdx` and `kind = 'buildlog'` for AI-Ops and the shared `/news/[slug]` namespace.

The News-only repository methods become locale-aware. They accept the requested `AppLocale` and return one normalized localized title/body rather than both bodies:

- English News selects `title_en` and `body_mdx`;
- Traditional Chinese News selects `title_zh` and `body_mdx_zh_hk`; and
- the Chinese list/detail query excludes a row when `body_mdx_zh_hk` is null or blank under ECMAScript `String.prototype.trim()` semantics.

There is no English-body fallback on `/zh/news` or `/zh/news/[slug]`. An affected Chinese detail is a 404 even when the English detail is public. Publication (`published_at <= asOf`), archive, kind, slug uniqueness, deterministic ordering, and limits remain unchanged.

The homepage News highlight, News index card, detail metadata, and safe structured-content renderer consume this locale-aware projection. News detail no longer routes a News body through a Build Log-shaped type merely because the URL namespace is shared; the resolver first preserves the separate News and Build Log contracts, then renders the correct safe component. Neither path enables executable MDX.

New/edited News publication remains governed by the PR4 CMS requirement that both bodies exist. Legacy News without approved Chinese text stays visible in English and hidden in Chinese until separately supplied and approved. PR5 imports or backfills no content and never treats English/Chinese string equality as translation approval.

## Showcase

`showcase_listings`, curated `media`, filters, view recording, and `leads` remain the only owners. `/showcase` keeps the existing query-driven filter parser and `ShowcaseFilters`; locale switching must retain all search parameters exactly. Repository failures degrade to the existing localized empty state and never activate static cards.

`/showcase/[slug]` keeps `showcaseRepository.getPublishedBySlug`, `ShowcaseViewBeacon`, the safe public projection, structured data, and `requestIntroAction`. The existing introduction form's deterministic validation, rate limiting, and idempotency remain intact.

PR5 may restyle the index/detail and add localized explanatory copy. It may also add a direct CTA to the existing portal listing destination for the authorized owner. It must not infer membership from donor logos, expose private listing/media fields, build a second directory, or create another introduction/lead endpoint.

## Launch Pad

The page switches atomically from `config/landing-partners.ts` / `config/landing-partners.json` to `landingPartnersRepository.listPublished({limit: 100})`, then deletes both static authority files in that same change. No intermediate state may retain an import or fallback to either file.

The repository projection remains the owner of signed MOU + published + non-archived filtering and omits contact, notes, and negotiation state. A database error or zero projected rows renders the existing localized partner empty state. It never resurrects the static JSON or donor partner data.

`scripts/audit-synthetic-content.ts` is updated because `landing_partners` becomes public data. The reversible `--hide` phase adds an exact parameterized statement setting `published_at = NULL` for the marked M6 partner IDs. Its documentation and `tests/unit/audit-synthetic-content.test.ts` must describe/assert this behavior; the default mode remains read-only, and PR5 does not run `--hide` or mutate a database.

`cohortRepository`, `cohorts`, `cohort_applications`, `applyToCohortAction`, the open-cohort form gate, `parseFundingAnswers`, and `getFundingResults` remain unchanged owners. Funding remains deterministic and query-driven. No fictional cohort or landing partner is seeded or exposed.

## Membership

### Repository and adapter

Add a read-only `membership_plans` repository under `lib/db/repos`; pages and adapters do not import Drizzle schema/database objects directly. A server-only public catalog adapter reconciles persisted rows against `PLAN_CODES` and `PLAN_CATALOG` from `lib/membership/plans.ts`.

For each canonical code, the adapter requires exactly one row whose code, active flag, audience, billing behavior, and seat allowance agree with the canonical definition. Unknown codes, duplicates, inactive rows, malformed price values, and any mismatch are not advertised. Output order is always `PLAN_CODES` order, independent of database order.

Numeric prices come only from persisted `annual_price_hkd` and `monthly_price_hkd`; localized message files contain no authoritative numeric price. The adapter formats available numeric values with `Intl.NumberFormat(locale, {style: 'currency', currency: 'HKD'})`. Free (`community`) and review (`patron`) tiers may use localized semantic labels instead of a fabricated numeric price.

For `startup` and `corporate`, public availability additionally requires the corresponding non-empty server environment value, `STRIPE_STARTUP_PRICE_ID` or `STRIPE_CORPORATE_PRICE_ID`. If persisted `stripe_price_reference` is non-null, it must exactly equal that configured identifier. The adapter never reads, returns, exposes, or logs the Stripe secret key or webhook secret; price identifiers remain server-side eligibility inputs and are not included in the public view model.

The view model makes CTA ownership explicit:

- available free and checkout plans link to `/join?plan=<code>`;
- available review plans link to `/contact`;
- unavailable or mismatched plans are omitted when other valid plans exist; and
- if none are advertisable, the page renders one honest localized unavailable state rather than hard-coded tiers or prices.

`app/[locale]/(public)/membership/page.tsx` and `TierComparison` consume only this adapter. PR5 does not change `/join`, onboarding, membership creation, `checkout-service.ts`, or webhook behavior. PR6 must make those flows consume the same authority before claiming end-to-end catalog convergence.

## Contact and Concierge

Contact retains the verified `mailto:contact@hkwtia.org`, `tel:+85229899164`, and localized physical address. Its redesign adds localized route cards for Events (`/events`), Membership (`/membership`), Showcase (`/showcase`), and Launch Pad (`/launchpad`) so every public intent reaches an existing durable owner.

There is no general inquiry form, persistence schema, or action. Contact may include a small Client Component button that opens the already-mounted `ConciergeWidget` through one shared same-window event/contract. The launcher does not fetch, post, mount another widget, or create an API. `ConciergeWidget` listens while mounted, opens its existing controlled Radix dialog, and removes the listener on cleanup.

The shared contract uses a code-owned event name and carries no user data. The launcher is a native button with localized accessible name. Opening through this path follows the same `onOpenAutoFocus` behavior as the floating trigger, focusing the existing message field; Escape, close-button behavior, focus containment, focus restoration, Turnstile, rate limits, streaming cancellation, feedback, escalation, and `/api/ai/concierge` guardrails remain unchanged.

## Failure, empty, and loading behavior

All public repository cutovers fail closed:

| Surface | Zero rows | Read/projection failure | Loading/navigation |
|---|---|---|---|
| Announcement | no bar | no bar | shell remains usable |
| Homepage partner wall | section hidden | section hidden | existing homepage content remains stable |
| Events | localized empty state for selected status | localized unavailable/empty-safe state; no static Events | status controls remain operable |
| News | localized empty state | localized empty/unavailable state; no cross-locale body | metadata/detail 404 remains deterministic |
| Showcase | existing localized empty state | existing empty-safe behavior | query state is preserved |
| Launch Pad partners | existing localized partner empty state | same empty state; no static fallback | cohorts/funding remain independent |
| Membership | one localized unavailable state | same unavailable state; no hard-coded catalog | no disabled link masquerades as available |
| Contact/Concierge | route cards/channels remain | existing Concierge error/escalation behavior | button/dialog expose pending and focus state |

Page-level loading UI, if added, contains neutral localized skeleton/status content only. It must not imply availability, price, relationship, registration capacity, publication, or successful submission before server data resolves.

## Security, privacy, accessibility, and localization

- Every database read stays under `lib/db/repos`; every mutation remains actor-authorized and server-side.
- Public projections omit audit, negotiation, storage, identity, Stripe, and provider fields.
- All CTA destinations use current canonical routes and `localizedPath`/locale-aware navigation. No unsafe return URL is synthesized.
- All images are approved own-origin registry media. `/api/media/<uuid>` bypasses optimization; no remote donor host is allowlisted.
- Partner website URLs remain the PR4 validated HTTPS projection and are never fetched server-side for display.
- English and Traditional Chinese are first-class. Metadata, cards, body content, state labels, alt text, prices, and dates use the requested locale. Chinese News never receives English body fallback.
- The current `LocaleSwitcher` contract remains authoritative: preserve pathname, query, and hash; `zh-HK` maps to `/zh`, never `/zh-HK`.
- New controls are keyboard reachable, have visible focus, meet the existing 44px target convention, and expose labels/status via semantic HTML. Images have curated localized alt text; decorative images use empty alt.
- Event and membership availability is conveyed in text, not color alone. Empty/error states use appropriate live regions only when state changes client-side.
- Concierge retains Radix dialog semantics, focus containment/restoration, Escape close, and existing privacy/abuse controls.

## Migration and rollback

PR5's only schema change is additive migration `0023_wisetech_event_hero.sql` with its generated snapshot and journal entry. It is committed but not executed. No row backfill, content import, or seed accompanies it.

Forward isolated verification must prove the column is nullable, the FK targets `media(id)` with `ON DELETE SET NULL`, the index exists, and no public Event projection returns archived media. The shared media-reference verification expands from Showcase/general Partners to Events.

Application rollback reverts PR5 behavior while retaining the additive column and any valid references. The preceding application ignores `hero_media_id`; no destructive schema downgrade or data deletion is part of rollback. Reverting the Launch Pad cutover may restore the prior application version and its tracked config only as part of the full PR revert; runtime code must never combine repository data with static fallback. Announcement, partner-wall, News-locale, and membership-catalog cutovers each fail closed during normal operation.

## Test-first acceptance

Every new parser, adapter, projection, and action-state transition begins with a focused failing Vitest contract, records the expected RED reason, then passes the same focused command after the minimal implementation. Tests use injected clocks/readers and do not require credentials.

Required focused coverage:

- schema/migration/snapshot/journal assertions for nullable `events.hero_media_id`, FK target/action, and index;
- Event form empty/UUID parsing, active-media options, missing/archived rejection in-transaction, public active hero projection, `/api/media/<uuid>` optimizer bypass, Event-aware media archive lock, status parser fallback, exact boundary and sort order, member-only exclusion, closed enforcement under row lock, and every public registration action outcome;
- locale-aware News list/detail SQL and projections, null/ECMAScript-blank Chinese exclusion, Chinese 404/metadata/renderer behavior, homepage News localization, and unchanged Build Log queries/body/rendering;
- public-layout announcement active/null/read-error cases and homepage partner active/rights/date/locale/link/empty/error cases;
- Launch Pad repository-only rendering, `limit: 100`, private-field omission, zero/error empty state, deletion assertions for both static files, and synthetic-audit `published_at = NULL` hide coverage;
- membership canonical order, exact/duplicate/unknown/inactive/malformed/mismatch cases, persisted price formatting, absent/mismatched Stripe price IDs, free/review CTA behavior, secret omission, and page unavailable/empty states;
- Contact channels and route cards, absence of inquiry form/action/schema, Concierge same-window open event, focus entry/restoration, Escape/close behavior, and no second API/runtime;
- Showcase query/locale preservation, public projection, view recording, direct existing portal CTA authorization, and deterministic lead validation/rate-limit/idempotency regression; and
- locale switcher path/query/hash regression across Event and Showcase filters.

Focused suites are followed by:

```text
npm.cmd run audit:strings
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd audit --omit=dev --audit-level=high
```

The PR records exact commands, exit codes, timestamps, and totals. It also runs a string/content audit for donor/demo/static fallback, inquiry-schema/action, remote-image, English-Chinese body fallback, hard-coded membership price, and obsolete landing-partner config references. Drizzle schema/migration checks must be credential-free.

Credential-free Playwright covers public navigation, query/locale retention, empty/failure-safe rendering, keyboard/focus behavior, and private-media URL output without performing database mutations. Test execution must not convert missing isolated infrastructure into a pass.

## PR boundaries

### PR5 owns

The public read/presentation cutovers in this document, the Event hero relation and archive lock, the membership marketing adapter, and regression protection for the retained durable journeys.

### PR6 owns

Join, checkout, onboarding, portal, and admin visual alignment; making Join/Checkout consume the same reconciled membership catalog; and full authenticated journey regression. PR5 does not pre-empt these owners.

### PR7 owns

Only explicitly approved isolated content migration/import, rights and relationship approval, translations, SEO/redirect release validation, provider-backed evidence, Preview/UAT, and production release evidence. Donor evidence alone never passes a PR7 content gate.

## External gates and exit condition

The following remain explicitly outside local PR5 completion and `NOT PASSED` until separately evidenced:

- execution of migrations against an isolated database and verification of migration/rollback behavior;
- authenticated Event registration, cohort application, and Showcase introduction UAT with test identities;
- R2 upload/delivery/revocation verification and bucket-jurisdiction confirmation;
- approved News translations and content-owner review;
- partner relationship, logo-rights, bilingual alt-text, and publication approval;
- accessibility review and Lighthouse against an isolated Preview;
- independent Preview/UAT ownership and rollback rehearsal;
- GitHub required-check configuration; and
- explicit production approval, deployment, and post-release observation.

PR5 is ready for review when the additive artifacts and all scoped public journeys exist, focused and repository-wide credential-free checks pass or are honestly reported, no prohibited fallback/import/runtime appears, and every unavailable external gate remains named rather than implied. There are no unresolved local architecture choices in this design; external content, provider, migration, UAT, and production approvals remain fail-closed gates.



## Independent-review contract corrections

The following corrections are binding where they narrow the preceding implementation design.

### News locales and sitemap

News has locale bodies: English selects `title_en` and `body_mdx`; Traditional Chinese selects the schema-confirmed `posts.title_zh` and `body_mdx_zh_hk`. Chinese News is eligible only when its Chinese body is non-null and nonblank under ECMAScript trim semantics. It never falls back to an English body. Build Logs remain an unchanged single-body operational-evidence exception: they continue to use `body_mdx` and are not made translation-eligible News.

`app/sitemap.ts` independently reads English and Chinese News. Each locale read fails to that locale's empty result only: a failed Chinese read cannot remove successful English URLs, and vice versa. It emits a News URL only for its successful locale-specific result and emits an alternate only when the same News slug is present in both successful, translation-eligible locale reads. Build Logs continue to emit in both locales with their mutual alternates as the explicit single-body exception. Sitemap coverage proves both one-locale failure cases, untranslated-Chinese omission, alternate suppression when either News locale is unavailable, and the Build Log two-locale/alternate regression.

### Registration contract

The only successful registration dispositions are `registered`, `waitlist`, `already_registered`, and `already_waitlisted`. Under the Event row lock, the repository checks in this order: event existence plus publication (`EVENT_NOT_FOUND`), closure (`EVENT_REGISTRATION_CLOSED` when `endsAt ?? startsAt` is before the injected clock), eligible membership (`MEMBERSHIP_INACTIVE`), duplicate registration, then capacity and the write. The only recognized repository errors are `EVENT_NOT_FOUND`, `EVENT_REGISTRATION_CLOSED`, and `MEMBERSHIP_INACTIVE`; actor resolution yields `UNAUTHORIZED` before this repository transition. The Server Action maps only those four recognized errors/success contracts; every unknown thrown value becomes a generic sanitized error without exposing the value.

### Membership price validity

Only persisted Postgres `integer` values from `annual_price_hkd` and `monthly_price_hkd` are considered. A numeric persisted value is valid only when it is an integer in `0..2147483647`. Community annual and monthly values must each be null or zero. Startup and corporate require a positive annual value; a monthly value, if present, must be positive. They also require the exact nonempty configured price ID for their code; a non-null persisted `stripe_price_reference` must equal that exact ID. Patron may persist null or a nonnegative value but is never advertised as a price and always has the contact CTA. Invalid rows are omitted. The public display derives an annual/monthly cadence only from the available valid persisted values; it never invents a cadence or localized price.

### Acceptance

Membership tests cover the Postgres-int range, each plan-specific annual/monthly rule, exact price-ID and persisted-reference equality, patron non-advertisement/contact CTA, omitted invalid rows, and cadence derivation. The credential-free browser command is exactly:

```text
npm.cmd run test:e2e -- tests/e2e/wisetech-pr5-public-journeys.spec.ts
```
