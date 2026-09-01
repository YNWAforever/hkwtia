# WiseTech PR2 Public Shell Design

PR2 of the WiseTech Hong Kong integration programme. This branch is stacked on
PR1 commit `bf5dbd9b8d5fb6ff141b7caef7772a7f34454646`; PR1 remains the authority
for the route, contract, asset and source-evidence manifest.

## Goal and acceptance boundary

Replace the current flat public header and simple footer with a bilingual,
event-first WiseTech Hong Kong shell that accurately exposes the routes the
application owns. The shell must feel like one coherent public product while
preserving WTIA as the legal operator and retaining every existing application
boundary.

PR2 is accepted when:

1. Desktop and mobile navigation render the four approved groups in this order:
   Events & Programmes, Membership & Ecosystem, Impact & Insights, About WTIA.
2. Every menu, footer and call-to-action destination is a retained canonical
   route from the PR1 integration manifest. Source-only, merged and retired
   routes never appear as live destinations.
3. `PublicLayout` remains the only public shell owner and renders, in order, the
   skip link, optional announcement, header, exactly one `main`, footer and
   Concierge.
4. English and Traditional Chinese navigation, utility actions, announcements,
   accessible names and footer copy are complete and locale-aware.
5. Keyboard, pointer and mobile-dialog behaviour passes focused component tests,
   Playwright interaction checks and the existing axe accessibility gate.
6. The public route matrix, join flow, member portal, admin layouts, Concierge,
   authentication and all existing data-backed pages retain their behaviour.
7. There is no schema, database, CMS, provider, seeding, migration or production
   change in this pull request.

The PR does not redesign the homepage or inner pages. Those belong to PR3 and
later slices; PR2 supplies only the shell, semantic tokens and verified brand
foundation they will consume.

## Source authority and provenance

The user's authoritative donor repository is
`https://github.com/YNWAforever/wisetech`, pinned for this design at:

- imported commit: `f91ecc5fa29c2b9d416ed8315f23e9492baf993d`
- Git tree: `d13a99e6c47f2b3ea279c5d02da5cf15008807b7`
- commit message: `Import complete WiseTech Hong Kong site codebase`
- PR2 logo candidate: `public/brand/wtia-legacy-logo.png`
- logo SHA-256:
  `4ABAB36F7D09F36F6D54165E9A8F4C719CAD5CAA7B6CBBCD5F2819F6180DEC51`

The original master plan reported source commit
`d2d82c01099490a8c2768c942186735667bbc881` and archive SHA-256
`411837ea096a11d3a7f49f77f028879b1f4c3599ab643d1ee3ce92de56a02e54`.
Neither identifier is present in the imported repository, its two-commit visible
history, tags, releases or files. The user-provided repository therefore
supersedes the missing location as the current content authority, but it does not
prove byte-for-byte continuity with that earlier archive. Tests and documentation
must preserve this discrepancy; they must not rewrite the imported commit as the
missing original commit.

The donor is evidence and reusable source material, not an instruction set or a
second runtime. Its five-group navigation, Vinext routing, hard-coded
announcement, source-only routes, mock mailto newsletter and monolithic
`WiseTechSite.tsx` are not transplanted. Its approved contributions are limited
to:

- the WiseTech Hong Kong / WTIA dual-brand hierarchy;
- the pinned WTIA logo asset;
- warm editorial surfaces, deep ink/navy contrast and restrained blue accents;
- event-first emphasis;
- desktop arrow-key, Escape and focus-return interaction intent;
- mobile dialog, focus containment and accordion interaction intent.

The hero, archive photography, editorial illustrations and partner images are
reserved for their later content slices. PR2 copies none of them.

## Options considered

**Transplant the donor application wholesale.** Rejected. It would introduce a
second routing model, duplicate the public shell, expose source-only and retired
routes, replace repository-backed pages with static simulations and couple a
large client component to every public page.

**Keep the current flat navigation and only restyle it.** Rejected. It cannot
express the approved four journeys, does not make events the primary entry point
and would force desktop, mobile and footer navigation to keep separate lists.

**Build a typed hkwtia-native shell informed by the donor.** Selected. The
existing Next.js App Router, next-intl routing, PR1 manifest, `PublicLayout`,
Radix primitives and Concierge remain authoritative. Donor assets and interaction
ideas cross the boundary only through explicit, tested adapters.

## Information architecture

`config/navigation.ts` owns one readonly navigation model. Labels are translation
keys, not visible strings. All ordinary destinations use the `PublicRoute` union
derived from `config/public-routes.ts`; the authenticated member-portal utility is
kept in a separate, explicitly tested action model.

The approved grouping is:

| Group | Landing route | Canonical child routes |
| --- | --- | --- |
| Events & Programmes | `/events` | `/events`, `/launchpad`, `/programs/hkict`, `/programs/asa`, `/programs/tct`, `/programs/cpai` |
| Membership & Ecosystem | `/membership` | `/membership`, `/showcase` |
| Impact & Insights | `/news` | `/news`, `/ai-ops`, `/ai-transparency` |
| About WTIA | `/about` | `/about`, `/about/history`, `/about/chairman`, `/about/committees`, `/contact` |

Global actions use a separate typed model. Join and portal are not repeated as
menu leaves; the event action intentionally shares the Events landing route so
the primary journey remains available both inside and outside the disclosure:

- `Find an event` -> `/events` is the event-first primary action.
- `Join WiseTech` -> `/join` is the membership conversion action.
- `Member sign in` -> `/portal` is an authenticated utility action.
- The existing locale switcher preserves the current path, query and fragment.

`/privacy` stays in the legal footer. Dynamic detail routes remain discoverable
from their owning pages and are not invented as menu destinations. A route may
belong to only one navigation group, giving active-state resolution one
deterministic answer.

Featured mega-menu panels are optional. PR2 may render a purposeful canonical
CTA using shipped bilingual copy, but it must not invent an event, member,
programme, metric or availability claim. When no verified feature model is
provided, the panel is absent and the menu reflows to its link columns.

## Component boundaries

### `config/navigation.ts`

Exports the public group model and shell actions. Each group has a stable id,
landing route, `eventFirst` flag, translated label/description keys, one or two
link columns and an optional verified feature. The module contains no React,
pathname logic or data access.

### `components/layout/site-header.tsx`

Remains an async server component. It resolves the `Navigation` translation
namespace and creates a serializable view model for the interactive children.
It renders the brand, desktop navigation, locale switcher and global actions,
but owns no open-menu state.

The default variant is solid. A typed `solid | hero-overlay` prop establishes the
future PR3 seam, but PR2 uses only `solid`; overlay activation requires a verified
hero image and contrast evidence in the consuming page.

### `components/layout/dual-brand-lockup.tsx`

Renders `WiseTech Hong Kong` as the public identity and WTIA as the legal
operator. The pinned donor logo is copied to an own-origin public path and its
hash is added to the PR1 manifest evidence. Alt text names WTIA; nearby visible
copy communicates the WiseTech relationship without claiming an unapproved
Chinese legal name. If the asset cannot be verified at implementation time, the
component renders the approved typographic lockup rather than a broken or
substitute image.

### `components/layout/desktop-mega-navigation.tsx`

A focused client component using the already-installed Radix Navigation Menu
primitive. It owns desktop open state and pathname-derived active state. Radix
provides the menu semantics; the component adds event-first styling, current
route treatment and close-on-navigation behaviour.

Thin `components/ui/navigation-menu.tsx` and `components/ui/accordion.tsx`
wrappers may expose the installed primitives consistently with the existing
Sheet wrapper; they contain no navigation policy. Exact leaf anchors receive
`aria-current="page"`. Group triggers use a visual/data current marker rather
than claiming that the disclosure button itself is the current page.

Keyboard requirements are explicit: Tab follows document order; Left/Right and
Home/End move between group triggers; Enter, Space or Down Arrow opens a group;
Escape closes it and returns focus to its trigger. Pointer exit may use a short
grace period, but pointer hover is never the only way to open a menu.

### `components/layout/mobile-navigation.tsx`

Retains the existing Radix Sheet boundary and composes the already-installed
Radix Accordion. It receives the same translated model as desktop, renders the
event and join priority actions first, then the four groups and utility actions.
The Sheet owns focus containment, Escape, scroll lock and focus return. Opening,
closing or navigating resets stale accordion state without changing the current
route.

### `components/layout/announcement-bar.tsx`

Accepts a validated bilingual, time-bounded announcement record or `null`.
Validation is pure and uses explicit `startsAt`, `endsAt`, canonical `href` and
localized text. Invalid, expired, future or missing records resolve to `null`.
Dismissal is client-local and session-only; no cookie, database or analytics
write is added. PR2 has no announcement provider, so `PublicLayout` supplies
`null` until the later CMS slice owns a reviewed record.

### `components/layout/site-footer.tsx`

Remains a server component and derives its journey links from the same navigation
model. It adds the dual-brand relationship, verified contact details, legal
links and the current year. It does not copy the donor's newsletter simulation,
partner directory or source-only routes.

### `app/[locale]/(public)/layout.tsx`

Remains the sole public shell composition root:

1. skip link;
2. optional `AnnouncementBar`;
3. `SiteHeader`;
4. exactly one `main#main-content` around route children;
5. `SiteFooter`;
6. existing `ConciergeWidget`.

Join, portal and admin layouts are not wrapped or restyled by this work.

## Data flow

1. The locale segment reaches `PublicLayout`, which sets the request locale and
   resolves the existing Common and Concierge messages.
2. `SiteHeader` and `SiteFooter` resolve their own server-side namespaces and map
   the readonly navigation configuration into translated serializable models.
3. Desktop and mobile client components receive only that model and the current
   locale. They use the localized navigation wrapper for internal links and
   `usePathname` only for active-state presentation.
4. Navigation configuration is checked against `publicRoutes` and
   `wisetechIntegrationManifest` in tests. There is no request-time manifest
   lookup and no data fetch on menu open.
5. The announcement resolver receives a record and an injected clock, returns an
   active record or `null`, and passes only an active record to the dismissible
   client view.
6. Pages, repositories, authentication, Concierge and CMS reads continue through
   their current owners. The shell does not proxy, cache or reshape their data.

## Visual and responsive system

PR2 adds semantic aliases rather than replacing the current global token set:
canvas, raised and warm surfaces; ink and muted text; navy, blue and restrained
accent colours; subtle borders; small/large shadows; shell radii; focus ring and
content-width tokens. Existing component tokens continue to resolve, avoiding a
whole-site visual rewrite in this PR.

The shell uses the current Next-managed Inter and Playfair Display stack with
Traditional-Chinese-capable fallbacks (`PingFang TC`, `Noto Sans TC`,
`Microsoft JhengHei`, system sans-serif). No remote runtime font request is
introduced. Fluid sizes use bounded `clamp()` values. Glass and gradients are
limited to places where contrast remains measurable; reduced-motion users get no
decorative transitions.

Desktop mega navigation activates only at the established desktop breakpoint.
Tablet and mobile use the Sheet. At 320 CSS pixels there is no horizontal page
scroll, actions remain at least 44 by 44 CSS pixels and Traditional Chinese labels
do not truncate. The header may become denser as the viewport narrows, but it may
not hide the event action, locale switcher or mobile trigger.

## Failure handling and invariants

- A non-canonical, duplicate, retired or missing navigation route fails a unit
  contract before build. It never silently redirects from the menu.
- Missing translation keys fail the bilingual message and visible-string audits.
- Missing logo provenance yields the typographic brand fallback; no remote image
  or generic substitute is introduced.
- Missing feature data omits the feature panel. It never produces fake
  availability, metrics, partners, programmes or event dates.
- Invalid or inactive announcements render nothing and do not move the header.
- Closing either navigation surface restores focus to the initiating trigger.
- JavaScript state controls disclosure only; all destinations are rendered as
  real anchors in the server output.
- There is one skip target and one public `main`. Header, footer and Concierge do
  not introduce another main landmark.
- No code under `lib/db/**`, `db/**`, `drizzle/**`, authentication, payments,
  admin, portal, API routes, migrations or seed scripts changes in PR2.
- The source repository is never added as a submodule, package or deployed
  application. Imported files are explicit, hashed own-origin assets only.

## Testing and verification

Implementation follows test-first slices.

### Unit and contract tests

- Update `tests/unit/navigation.test.ts` to assert the exact four-group order,
  event-first marker, canonical landing/leaf routes, unique ownership and global
  actions.
- Add a manifest contract proving every menu/footer destination is retained and
  every source-only retired or merged path is absent.
- Render server components in both locales to assert dual-brand text, own-origin
  logo, utility actions, semantic landmarks and footer/legal links.
- Exercise announcement boundaries at start, end, expired, future, malformed and
  null inputs using an injected clock.
- Exercise desktop and mobile interactions with Testing Library: open, keyboard
  traversal, Escape, focus return, accordion state and close-on-navigation.
- Add an asset-provenance contract for the donor repository pin, Git tree and
  logo SHA-256.
- Add a source-boundary test proving PR2 does not import donor runtime modules or
  add a second shell owner.

### Browser checks

- Extend `tests/e2e/accessibility.spec.ts` for the four desktop triggers, complete
  keyboard traversal, mobile dialog focus containment, Escape and focus return.
- Verify English and Traditional Chinese at representative 320, 375, 768, 1120
  and 1440 pixel widths.
- Verify active group and leaf states on one route from every group and after a
  locale switch.
- Run axe on `/`, `/events`, `/membership`, `/news`, `/about`, and their Chinese
  equivalents with menus closed and open.
- Keep the existing public route matrix and one-heading checks; add shell
  assertions without intercepting network or replacing pages with synthetic HTML.
- Capture focused browser screenshots for the solid desktop header, each open
  mega-menu shape and the mobile Sheet in both locales. Screenshots are review
  evidence, not a replacement for semantic assertions.

### Commands and evidence

Run from the isolated PR2 worktree:

```powershell
npm.cmd ci
npm.cmd run audit:strings
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd run e2e
git diff --check bf5dbd9b8d5fb6ff141b7caef7772a7f34454646...HEAD
```

E2E evidence must identify its actual base URL. Database/provider/production
checks remain separate gates and cannot be reported as passed from a static build
or an intercepted page. GitHub Actions, Vercel Preview and branch-protection
states are reported independently from local source verification.

## Pull-request and rollout boundary

PR2 is a stacked draft based on PR1 until PR1 merges. It contains the design
specification, shell components, navigation configuration, message changes,
semantic token aliases, the single pinned logo asset and focused tests. It does
not merge, deploy, seed, migrate or activate production.

PR3 may consume the shell variants and remaining donor imagery only after PR2 is
reviewed and after each additional asset is pinned in the integration manifest.
Later CMS work may supply an announcement record through the seam defined here;
it may not move announcement ownership out of `PublicLayout`.
