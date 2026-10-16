# WP-3 Homepage: Decisions and Closures — Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to turn this design
> into a task-by-task implementation plan before executing. This document does not replace the
> master programme spec — it records what this brainstorming session resolved on top of it.

**Status:** Design approved via `/superpowers:brainstorming`, 2026-09-03.

**Goal:** WP-3 rebuilds `/` (and `/zh`) as the donor's 13-section homepage over real read models,
per `docs/superpowers/plans/2026-09-01-wisetech-design-fidelity.md` §5 "WP-3 · Homepage: the 13
sections over real read models". That table — the component list, data owner per section, empty
behaviour, RED tests and exit criteria — is the primary specification for WP-3 and is not
duplicated here. This document is the addendum: two decisions this session made, the errata items
the WP-2 review already assigned to WP-3, and one risk to carry into implementation deliberately
rather than discover at the end.

**Architecture:** No change to the master spec's file plan. `app/[locale]/(public)/page.tsx`
becomes a thin composition of thirteen Server Components under `components/home/`, each reading
its own model with `.catch(() => [])` or `Promise.allSettled` per the master table, so one failing
read degrades that section only.

**Tech stack:** Next.js Server Components, the existing `eventsRepository` / `showcaseRepository` /
`cohortRepository` / `partnersRepository` / `content/programs/*` read models — all already present
in the repository — plus Lighthouse CI (`lighthouserc.js`, `npm run test:lighthouse`), which is
already wired up and just needs `/` added as a target.

---

## 1. Phone number (closes errata E-20)

**Decision:** `+852 2989 9164` is confirmed by the product owner. `config/site.ts`'s `siteContact`
gets a `phone: '+852 2989 9164'` field.

**Why this was open:** WP-2 left it unset because `hkwtia.org` answered every automated check with
a bot challenge that must not be bypassed, and neither message bundle carried a number — an
unverifiable fact was omitted rather than repeated. The owner's confirmation here is exactly the
condition `config/site.ts`'s comment names as the unblock: *"set it here once the association
confirms it and the footer renders the tel: line on its own."*

**What changes:**
- `config/site.ts`: add `phone: '+852 2989 9164'` to `siteContact`.
- `components/layout/site-footer.tsx`: already reads `siteConfig.contact.phone` conditionally
  (`components/layout/site-footer.tsx`, the `<address>` block) — no code change there, it starts
  rendering the `tel:` line as soon as the field is set.
- `app/[locale]/(public)/contact/page.tsx:55`: currently hard-codes
  `<a href="tel:+85229899164">+852 2989 9164</a>`. Change it to read from `siteConfig.contact.phone`
  so the two surfaces can never disagree again — a config change, not a copy change.
- `tests/unit/contact-concierge-launcher.test.tsx` (or wherever the current pin lives): update to
  assert the phone comes from `siteConfig.contact.phone` rather than a literal, so a future edit to
  the config is what changes the page, not a hand edit in two places.

## 2. Hero scrim (closes errata E-47, feeds E-64)

**Decision:** adopt the donor's full-width top-spanning scrim on the homepage hero, in place of
today's `EditorialHero` left-to-right fade. Confirmed via the visual companion (mockup
`hero-scrim.html`, option "B — donor: scrim band spans the top").

**Why this was open:** the current scrim fades from opaque on the left to transparent on the right,
so the header's language switcher and "Join WiseTech" button — both anchored at the right edge —
sit over the photo's brightest, least-controlled region. Errata E-47 records the donor's own fix:
a scrim band spans the entire header strip, so every control gets a consistent dark background
regardless of what photo sits underneath. Errata E-64 found the practical cost of leaving this
open: with the current scrim, the header's `:focus-visible` outline can measure as low as roughly
**1.4:1** against a bright flare in the photo, well under WCAG 1.4.11's 3:1 floor for a non-text
indicator — and that a colour change alone cannot fix it, because a photograph, not the palette,
bounds the ratio.

**What changes:**
- The homepage hero component (`components/home/hero.tsx` per the master table) renders the
  donor's top-scrim treatment behind the header, not `EditorialHero`'s current left-to-right
  gradient. The photo itself stays `public/images/projects-hero.jpg` — the existing placeholder —
  until WP-5 supplies an approved archive photograph; nothing about this decision is coupled to
  which photo is live.
- This section's work is the scrim mechanics (the gradient band, its height, its opacity curve
  matching the donor), not new asset sourcing.

## 3. Errata items this work package must close

The WP-2 whole-branch review assigned several owner actions explicitly to WP-3. Fold each into
WP-3's task plan as an explicit exit criterion, not an afterthought:

- **E-13 (extend `heroVariantByRoute`):** the homepage rebuild does not itself add a new route to
  the variant map — `/` already resolves to `overlay` — but if any WP-3 section introduces a
  second in-page photo hero (it does not, per the master table), the same static-rendering check
  from E-13 applies before adding it: rebuild, then confirm `.next/prerender-manifest.json` still
  shows the twelve page-copy patterns static and only `/ai-ops` on ISR. Recorded here so a future
  reader does not have to rediscover the check.
- **E-52 (re-measure the discover-anchor ratio):** `tests/e2e/wisetech-pr3-public-pages.spec.ts`'s
  viewport-ratio thresholds around `#home-discover` were measured against the *old* 4-section
  homepage. WP-3 rewrites everything below the hero, so the section's height and the anchor's
  scroll target both change. Re-measure at 375, 768, 1024 and 1440 px on the rebuilt page and reset
  the constant — do not nudge the old number.
- **E-64 (re-measure focus-indicator contrast):** once the scrim from §2 ships, re-measure the
  header's focus ring against the real rendered hero at 1440, 1360, 1120 and 820 px, the way the
  WP-2 review measured the pre-scrim numbers. Record the new ratios in the errata, including
  against any bright region the photo still has — a scrim reduces the problem, it does not
  guarantee every pixel clears 3:1, and E-64 already documents why that guarantee is not available
  from a colour choice alone.
- **E-68 (structured data reads the right authority):** `StructuredData`'s `buildOrganizationData()`
  extension (`alternateName`, `telephone`, `address`, the `WebSite` node) reads `email`, `phone`
  and `addressLines` from `config/site.ts`'s `siteContact` — the English machine-readable record —
  never from the message bundle. `Footer.addressLines` stays the footer's own authority for what a
  reader sees; the two are deliberately different lists (English is three lines, Chinese is two,
  in Chinese address order) and structured data is English-only by the schema.org convention this
  page already follows.

## 4. Performance risk (Lighthouse ≥ 90, CLS < 0.05)

The homepage stays `export const dynamic = 'force-dynamic'` — it is not a candidate for static
rendering, since several sections read live, per-request data (open events, showcase counts, open
cohorts, partner counts). The master spec's exit bar is Lighthouse performance ≥ 90 on `/` with the
hero image as LCP, and CLS < 0.05.

**Approach, in order:**
1. Every read in the master table already specifies `Promise.allSettled` or `.catch(() => [])`
   per section — keep every section's read independent so one slow model cannot block the others,
   and so `Promise.all` at the page level (already the pattern in the current `page.tsx`) fans out
   in parallel rather than in sequence.
2. The hero image keeps explicit `width`/`height` (or a fixed aspect-ratio box) and
   `fetchPriority="high"`, exactly as the master table specifies — this is what keeps CLS bounded
   regardless of section content below it.
3. Bound every list read to what the section renders (`limit` values already appear in the master
   table for every section) — never fetch more than is displayed.
4. Add `/` to `lighthouserc.js` and run `npm run test:lighthouse` before declaring the section work
   done, not only at the very end — catching a regression after section 6 is cheaper than after
   section 13.
5. If the plain approach does not clear 90 once all thirteen sections are wired, the next lever is
   caching the slower, less-personalized reads (for example `partnersRepository.listPublished`,
   which does not vary per request) — not adding client-side fetching, which would trade LCP for a
   loading spinner the design does not have. Revisit this step only if step 4 shows a real deficit;
   do not pre-optimize before measuring.

## 5. Self-review

- **Placeholder scan:** no TBDs — the phone number, the scrim, and every errata closure above have
  a stated concrete change. The one deliberately open item (whether the caching lever in §4 step 5
  is needed) is conditioned on a measurement, not left vague — the condition is "Lighthouse < 90
  after step 4," which is testable.
- **Internal consistency:** the phone decision does not touch the footer's rendering logic (it
  already branches on `phone` being set) — only the config value and the contact page's hard-coded
  literal move. The scrim decision does not touch which photo is used, so it cannot conflict with
  WP-5's later asset swap.
- **Scope check:** this is an addendum to one existing, already-detailed work-package
  specification, not a new subsystem — no decomposition needed. It does not touch WP-4's inner
  pages, WP-5's content migration, or WP-6's join/portal/admin work.
- **Ambiguity check:** "adopt the donor's scrim" is pinned to a specific rejected alternative (keep
  today's left-to-right fade) and a specific accepted one (the mockup's option B), so a future
  reader cannot read it two ways.

## Out of scope for WP-3 (unchanged from the master spec)

- The real archive photograph for the hero (WP-5).
- Any inner page other than `/` (WP-4).
- Partner/photo content migration (WP-5).
- Join/Portal/Admin chrome (WP-6).
