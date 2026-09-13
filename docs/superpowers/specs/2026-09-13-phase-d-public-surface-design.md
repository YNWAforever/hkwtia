# Phase D, public surface — discoverability and a rehearsed cutover

**Date:** 2026-09-13
**Programme:** `docs/superpowers/specs/2026-09-08-wtia-two-sided-platform-programme.md` (D-1, D-5)
**Status:** approved for planning · **Owner:** Willy (product)
**Predecessor:** `docs/superpowers/specs/2026-09-12-production-activation-design.md`

---

## 1. Why this slice, and why now

Phases A–C are merged and promoted. Their proof is not: the four acceptance walks in
`docs/integration/2026-09-12-production-activation-checklist.md` are all still `pending`, and
Phase C's go-live table is nine rows of `blocked` and `pending` with nothing done. Each of those
needs a real magic-link sign-in or a Meta approval, and neither is a coding task.

Building more behind authentication would stack a fourth phase on flows that have never run in
production. This slice deliberately takes the opposite half of Phase D: **the public surface**,
which is genuinely exercised — anonymous visitors reach it, it renders, and the four walks do not
gate it.

It is also the half with the clearest external deadline pressure. `hkwtia.org` is a live WordPress
site carrying twenty-five years of citations, and it is being replaced by this application. Getting
the replacement's discoverability right *before* the cutover is worth more than getting it right
after.

## 2. Scope

**In:**

1. Structured data: `Article` on news, `Person` on the chairman page, `EventSeries` on programme
   pages, `BreadcrumbList` across the public surface.
2. Per-entity `og:image` via `next/og`, with three renderers chosen by what the entity can supply.
3. Publish all 51 history milestones — route and sitemap changed in lockstep.
4. Cutover **preparation**: host correctness, redirect verification against the live WordPress
   site, and a rehearsed runbook with rollback.

**Out, with reasons:**

| Item | Why not |
|---|---|
| Weekly scheduled LHCI | Deferred by the owner. `lighthouserc.js` already exists, so this stays cheap to add later. |
| GSC cross-reference | Needs Google Search Console access. The `hkwtia.org` property currently sits on the WordPress site's Site Kit, and no export is available to this work. |
| The DNS move itself | The owner's action. This phase prepares and proves; it does not flip. |
| Anything behind authentication | Belongs to the unproven half. See §1. |

## 3. Three corrections to the programme spec

Each was found by checking the code and the live site, not by reading the spec.

### 3.1 "Every history milestone in the sitemap" is a route change, not a sitemap change

`content/milestones.ts` holds **51** records of `kind: 'milestone'`. Six are `featured`.
`app/sitemap.ts` filters with `featuredOnly(milestonesOnly(milestones))` — and so does
`generateStaticParams` in `app/[locale]/(public)/about/history/[slug]/page.tsx`.

The two are currently consistent *by coincidence of both saying `featuredOnly`*. Nothing enforces
it. Adding the remaining 45 to the sitemap alone would publish 45 URLs that 404.

### 3.2 "NEXT_PUBLIC_SITE_URL flip" understates D-5 — but the hard part is already built

`hkwtia.org` is a live WordPress 7.1 site behind Cloudflare with Google Site Kit installed. Its
sitemaps carry 61 posts, 22 pages and **454 events** — well over 500 indexed URLs against this
application's 56.

A naive flip would have been destructive. It is not one, because the migration already exists:
`content/legacy-urls.json` classifies **576** entries, `next.config.ts` covers them with pattern
rules for the bulk shapes plus literals derived from the same fixture, and
`tests/unit/redirects.test.ts` resolves every one the way Next.js actually processes a request,
pins each permanent, forbids self-redirects, and stops the `/events/` wildcard shadowing the real
route.

Verified during this design: all six legacy destinations that point at `/about/history/<slug>`
resolve to milestones that actually have pages. There is no latent 404 there.

So this phase **verifies and rehearses** the cutover rather than building it.

### 3.3 The og:image is not one image

| Entity | What it can supply | Consequence |
|---|---|---|
| `events` | `heroMediaId` — **nullable** | A real photograph, sometimes. |
| `companies`, `showcaseListings` | `logoReference` / `logoMediaId` | A **logo**, not a photograph. |
| `posts` (news) | *no image column at all* | Never an image. 100% fallback — on precisely the pages `Article` JSON-LD targets. |

A single photo-backed renderer would crop and darken member logos under a scrim — mangling the mark
of the very members the directory depends on — and would never fire for news.

## 4. Design

### 4.1 og:image — one route, three pure renderers

`app/api/og/route.tsx` accepts `?kind=&id=` and dispatches to renderers in `lib/og/`:

| Renderer | Used for | Treatment |
|---|---|---|
| `photo` | events holding a hero image | The image behind a blue scrim, title and type overlaid bottom-left. |
| `logo` | members, showcase listings | The mark **contained on a light ground, undarkened**. Their brand shown properly. |
| `editorial` | news, programmes, milestones, everything else | Type-led on brand blue: eyebrow, sand rule, serif title, wordmark. No image needed. |

Rejected alternatives: a route per entity type (five near-duplicate files that drift), and one
renderer with conditionals (a single function doing three jobs — the shape that grows untestable).

The route stays thin. Renderer choice and props come from a pure `resolveOgRenderer(entity)`, which
is where the logic — and the tests — live.

### 4.2 Structured data

`lib/structured-data.ts` already exports builders for `Organization`, `WebSite`, `FAQPage`, `Event`,
member `Organization` and `BreadcrumbList`; `components/seo/structured-data.tsx` renders them behind
a `schema-dts` union. This extends that pattern: three new builders (`buildArticleData`,
`buildPersonData`, `buildEventSeriesData`) and a widened union.

**Breadcrumbs split by what each page knows.** There are 22 public routes plus five dynamic
patterns, and a breadcrumb exists on exactly one page today. Hand-adding `<StructuredData>` to
~26 pages is the change that half-lands and then drifts.

- **Static routes** — one breadcrumb rendered in the `(public)` layout, derived from the pathname
  against a `route → labelKey` map. One place, cannot drift.
- **Dynamic routes** — page-level, because the trail needs the entity's own title, which the layout
  cannot reach. Already the pattern on `members/[slug]`.

A discovery test asserts every `publicRoutes` member has a label. This is deliberate: the
`/admin/page-copy` `MISSING_MESSAGE` outage fixed earlier the same day was exactly this shape — a
list the compiler checked paired with labels nothing checked.

### 4.3 Milestones

Change `featuredOnly(milestonesOnly(…))` to `milestonesOnly(…)` in **both** `generateStaticParams`
and `app/sitemap.ts`, and add a test asserting the two use the same filter. 6 → 51 pages per locale.

Recorded: `featured` may have been a deliberate editorial choice, and the 45 go live with Chinese
that `content/milestones.ts` describes as drafted, with proper nouns flagged for WTIA to confirm.
The owner chose to publish all 51 with that understood.

### 4.4 Cutover preparation

Two gaps `tests/unit/redirects.test.ts` cannot close, both runnable **today against the current
production host**, since redirect rules are host-independent and do not need DNS to move:

- **Replay** — request all 576 legacy paths against production, assert each reaches a 200 after
  redirects. Report anything that 404s, loops, or chains more than once. The existing test proves
  `/event/foo/` *resolves to* `/events`; it does not prove `/events` answers.
- **Drift** — re-read the live WordPress sitemaps and diff against the fixture. Pattern-matched
  shapes are drift-proof by construction; the ~26 literal entries are not, so a page published
  since capture surfaces as a named gap rather than a silent 404.

The runbook covers the Vercel env change, the Cloudflare DNS move, and GSC property and sitemap
resubmission. The `hkwtia.vercel.app` → 308 rule is **conditional on the new host**, so it cannot
fire before DNS moves and take the site down.

Rollback: DNS back to WordPress, revert the env var. Nothing in this phase modifies the WordPress
site, which stays serveable throughout.

## 5. Testing

| Piece | Approach |
|---|---|
| Structured data builders | Pure functions, unit tested on shape. |
| Breadcrumb coverage | Discovery test: every `publicRoutes` member has a label. |
| Milestone lockstep | Test asserting route and sitemap share one filter. |
| `resolveOgRenderer` | Pure, fully unit tested — renderer choice and props per entity. |
| `/api/og` route | One smoke test per kind: content-type and non-trivial byte length. |
| Replay, drift | Scripts against a live host. **Not** in the unit suite — network calls make suites flaky. |

`next/og` emits PNG bytes. Asserting on pixels is brittle theatre, so the logic moves to where it
can be tested honestly and the image itself gets a smoke test.

## 6. Risks

| Risk | Mitigation |
|---|---|
| `next/og` needs font files bundled; the site's serif is a CSS variable, not a confirmed file | Verify loadability in the first task, not the last. Falls back to a system serif if not. |
| 90 new static pages lengthen the build (45 milestones x 2 locales; 6 already exist) | Measure before and after; the build currently compiles in ~15-18s. |
| 45 milestones ship with drafted Chinese | Owner-accepted (§4.3). Recorded here so WTIA can review. |
| Replay makes 576 requests at production | Paced, read-only, and the endpoint set is already public. |
| Fixture drift found late | The drift check runs first, so a gap becomes a task rather than a cutover surprise. |

## 7. Definition of done

1. `Article`, `Person`, `EventSeries` and `BreadcrumbList` render on every page that should carry
   them, with the coverage test passing.
2. `/api/og` returns a correct image for each entity kind, with member logos undarkened and
   contained.
3. All 51 milestones have pages and sitemap entries, route and sitemap pinned to one filter.
4. Replay reports 576/576 legacy paths reaching a 200; drift reports zero unclassified live URLs,
   or names each gap.
5. A runbook exists that the owner can execute, with rollback, and a stated go/no-go.

Not in scope and not claimed: the DNS move, any change to the WordPress site, and any of the four
acceptance walks.
