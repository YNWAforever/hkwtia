# WiseTech Hong Kong × hkwtia — Design-Fidelity & Function-Completion Programme

**Claude Code execution spec · v1 · 2026-09-01 · verified against both live repositories**

| | |
|---|---|
| Target repository (system of record) | `github.com/YNWAforever/hkwtia` — `main` at `ff07693` (Merge PR #32, 2026-09-02 HKT) |
| Design donor (presentation evidence only) | `github.com/YNWAforever/wisetech` — `f91ecc5` (tree `d13a99e6`, 138 files), live at `https://wisetech-hong-kong.laichiwillyjp.chatgpt.site/` |
| Production | `https://hkwtia.vercel.app` (cut over 2026-09-02 with delivery gates 2–4 bypassed — see §1.3) |
| Suggested path for this file | `docs/superpowers/plans/2026-09-01-wisetech-design-fidelity.md` (plus the pointer block in §0.4 appended to `CLAUDE.md`) |
| Language of the deliverable | English source, `en` + `zh-HK` bundles in parity |
| Overview picture | `wisetech-hkwtia-overview.png` / `.svg` (delivered with this file; suggested home `docs/integration/`) |

---

## 0. How Claude Code must use this file

### 0.1 Read order (do not skip)

1. `CLAUDE.md` — the eight hard boundaries. They are enforced by lint and tests; several have caused production incidents.
2. `AGENTS.md` — conventions, test-first rule (write the test, run it, **read the failure**), changelog.
3. This file, end to end, before touching code.
4. `config/wisetech-integration-manifest.ts` and `docs/integration/wisetech-route-parity.md` — the route/CTA/asset dispositions (`retain` / `merge` / `redirect` / `retire`). They are law until amended through WP-7.
5. `docs/superpowers/specs/2026-08-29-wisetech-pr6-join-portal-admin-design.md` and its plan — the approved scope for WP-6; do not re-derive it.
6. The donor, for **presentation evidence only**: `app/WiseTechSite.tsx` (1072 lines, 33 functions), `app/ExpansionPages.tsx` (1222, 18), `app/FullInnerPages.tsx` (533, 16), `app/globals.css` (1162 lines, 250 semantic classes, tokens in `:root`), `app/megaNav.ts`, `app/visualData.ts`, `app/partnerData.ts`, `app/sitemap.ts`. Read the donor from a sibling checkout (`../wisetech`); **never** add it as a dependency, submodule, import, or copied runtime file.

### 0.2 Session bootstrap

```sh
git switch -c feat/wisetech-design-fidelity origin/main   # one branch per work package is also fine: feat/wt-wp1-tokens …
npm ci
npm run typecheck && npm run lint && npm run audit:strings && npm test   # must be green before the first edit
git clone --depth 1 https://github.com/YNWAforever/wisetech.git ../wisetech   # donor, read-only
```

Public pages run with only `NEXT_PUBLIC_SITE_URL`; DB-backed sections degrade to empty states without `DATABASE_URL` (CLAUDE.md convention: `.catch(() => [])`). Never point a seed or destructive test at production; use the sentinel-guarded isolated database (`drizzle/0024_acceptance_sentinel.sql`, `tests/unit/seed-guard-boundary.test.ts`).

### 0.3 Operating rules for this programme

- **Design is the authority for presentation. hkwtia is the authority for routes, data, auth, billing, AI, i18n, and authorization.** When they conflict, the hkwtia authority wins and the design is adapted — never the reverse.
- **Donor code is evidence, never runtime.** `tests/unit/wisetech-shell-boundary.test.ts` fails on any `WiseTechSite|FullInnerPages|ExpansionPages|YNWAforever/wisetech` reference in shell files. Port patterns by re-implementing them as Server Components over hkwtia view models.
- **Honest states are a feature, not a gap.** The design's "No activities are currently open", "No public case study is available yet", "Current status: unconfirmed" patterns are correct behaviour when the repository returns nothing. Keep them. Never fabricate events, members, solutions, metrics, or partner relationships to make a section look full.
- **Every visible string lives in `messages/en.json` and `messages/zh-HK.json`** (`npm run audit:strings` fails otherwise). Add keys under the existing namespace of the page (`Home`, `Events`, `Showcase`, `Membership`, `Navigation`, `Footer`, `Concierge`, …). Staff-editable marketing copy additionally goes through the page-copy allowlist (`lib/i18n/page-copy-catalog.ts`, M7.2) — add a leaf there when staff must be able to edit it.
- **Locale links:** `Link` from `@/i18n/navigation` or `localizedPath` from `@/lib/urls`. `zh-HK` is served at `/zh`; hand-built `` `/${locale}/…` `` is pinned out by `tests/unit/locale-href-boundary.test.ts`.
- **Assets are own-origin only** (CSP `img-src 'self' data:`). Donor images are `retire` in `config/wisetech-authoritative-source-inventory.ts` (rights unreviewed). They enter production only via WP-5 (media registry + staff confirmation), never by copying files into `public/`.
- **Server Components by default;** `'use client'` only for the header/menu state, event view toggles, the industry selector, forms, and the Concierge (the donor is `"use client"` throughout — do not inherit that).
- **Test first.** Each WP lists its RED tests. Run the focused test, then `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run audit:strings` before hand-off. Commit with conventional prefixes, one WP (or WP sub-slice) per PR.
- **Stop and ask** when a step needs: a schema migration not listed here, a change to `next.config.ts` CSP, a change to auth/billing/webhook code, a production deployment, or a manifest amendment beyond those pre-approved in WP-7.

### 0.4 Pointer block to append to `CLAUDE.md`

```md
## Active programme: WiseTech design fidelity (2026-09)
Execution spec: docs/superpowers/plans/2026-09-01-wisetech-design-fidelity.md. Work packages WP-0…WP-8 in order;
design = presentation authority, hkwtia = data/route/auth authority; donor repo is read-only evidence (../wisetech).
```

---

## 1. Situation — what exists, what is missing (verified 2026-09-01)

### 1.1 What the previous integration PRs already delivered in hkwtia

| PR (branch `codex/wisetech-hkwtia-integration`, merged as #20) | Delivered | Evidence |
|---|---|---|
| PR1 Phase 0 | Integration manifest (133 entries: 116 routes, 5 CTAs, 3 forms, 1 locale, 8 assets), protected-route inventory (26 admin pages, 19 API handlers), route-parity validator, delivery gates, CI `quality` job | `config/wisetech-*.ts`, `tests/unit/wisetech-route-parity.test.ts`, `docs/integration/*` |
| PR2 Public shell | Dual-brand lockup, announcement seam, 4-group desktop mega navigation, grouped mobile navigation, locale switcher, shell tokens `--shell-*` | `components/layout/*`, `config/navigation.ts`, `tests/unit/public-shell*.test.*` |
| PR3 Institutional pages | Question-led homepage (hero + 3 highlight slots + partner wall + feature grid + programme grid), About/History/Programmes story primitives | `app/[locale]/(public)/page.tsx`, `components/marketing/{editorial-hero,institutional-page-intro,story-section,…}.tsx` |
| PR4 CMS data | Announcements CMS, Partners CMS (categories `supporting/media/regional/programme/sponsor`, relationship + logo-rights confirmation gates), secure media upload, localized news | `drizzle/0019–0022`, `lib/db/repos/{announcements,partners,media,posts}.ts`, `/admin/{announcements,partners,media,news}` |
| PR5 Public journeys | Event hero media, public event journeys (`?status=open\|past`), localized news projections, partner wall, membership catalog, showcase presentation refresh, contact→Concierge | `drizzle/0023`, `lib/events/public.ts`, `lib/membership/public-catalog.ts`, `tests/e2e/wisetech-pr5-public-journeys.spec.ts` |
| PR6 Join/Portal/Admin | **Design and plan only — no implementation commits** | `docs/superpowers/{specs,plans}/2026-08-29-wisetech-pr6-*.md` |
| PR7 Content migration / SEO / release evidence | **Not started** | — |
| Post-cutover (Sept 1–2) | CI on `release`, unsubscribe-secret sunset fix, main↔release reconciliation, acceptance sentinel table (`0024`), production cutover | `docs/integration/main-release-cutover-evidence.md` |

### 1.2 The gap the user is asking to close

The prior PRs achieved **semantic** parity (routes, CMS authorities, journeys) but not **visual/content** parity. Measured on 2026-09-01:

| Dimension | Design (donor + live site) | hkwtia production | Gap |
|---|---|---|---|
| Home H1 | "How can Hong Kong lead the AI+ era?" | "Where can Hong Kong innovation go next?" | copy |
| Home sections | 13 (Hero, Open Now, Pathways, Events journey, Directory + Marketplace, Outcomes, AI+ Ecosystem, Programmes, GBA Gateway, Impact evidence, Archive, Partner network 79 logos, Membership/Partnership) | 3–4 (hero, highlights, partner wall, features/programmes) | 9–10 sections |
| Header | transparent over hero → fixed solid on scroll; 5 task-led mega-menu groups with heading, two columns and a feature aside; search; "Member sign in"; "Join WiseTech" | solid two-row header; 4 groups; no search; no feature aside | presentation + IA decision (D-3) |
| Typography | Display serif stack `"Iowan Old Style","Palatino Linotype",Palatino,Georgia`; sans `"Avenir Next",Avenir,"Helvetica Neue"`; hero `clamp(60px,7.7vw,128px)`, `line-height .9`, `letter-spacing -0.045em` | next/font `Playfair Display` + `Inter`, Tailwind scale | tokens (D-2) |
| Colour | `--ink #0f4c81`, `--ink-soft #1a4f82`, `--cyan #1a80b6`, `--paper #f6f6f6`, `--amber #f2d58f`, focus `#ff5c4d` | `--shell-navy 218 48% 18%`, `--shell-blue 210 100% 38%`, `--primary 210 100% 38%` | tokens |
| Layout | `.shell` = `min(1440px, 100% − 80px)`; `.section` = `clamp(92px, 10vw, 160px)`; breakpoints 1320 / 1120 / 820 / 520 | `container` 1400px / `max-w-shell 88rem`; Tailwind breakpoints | grid |
| Inner-page hero | photo + caption figure, "W+" art, eyebrow, H1, lead, breadcrumb, primary/secondary actions | `PageHero` (muted tint, no photo figure/caption/breadcrumb) | component |
| Events | quick tabs (Open Now / This Month / Upcoming / Member Only / Past), activity-type strip, filter panel, cards ↔ calendar toggle, result count, honest empty | list by `?status` only | presentation over real data (D-5) |
| Showcase | search prompts, 12 "business need" chips, badge-definition section (explicitly "proposed, not awarded"), buyer/provider pathways | filter form + cards | presentation |
| Membership | 5 pathway cards, 12-dimension comparison, "first 90 days", pricing note | tier comparison over 4 canonical plans | presentation + plan mapping (D-7) |
| Partners | 79 historical logos in 3 tabs, `/partners` page with per-record relationship status | partner wall (published partners only, currently 0–12); `/partners` retired | content migration (WP-5) + un-retire (WP-7) |
| Concierge | "W+ Ask WiseTech" pill, prompt list, transparency link | `ConciergeWidget` pill "問 WTIA / Ask WTIA" | presentation only |
| Join / Portal / Admin | design shows a portal *preview* only | real auth, Stripe, seats, CMS — but `/member-login`, portal sign-out, checkout hand-off and locale-correct billing return are missing | **functions** (WP-6 = PR6) |

### 1.3 Release posture you inherit

`docs/integration/wisetech-delivery-gates.md`: GitHub branch protection, isolated test infrastructure, Preview/UAT and production approval are all `NOT PASSED`; production is live anyway (owner-directed). `LEGACY_UNSUBSCRIBE_SECRET_SUNSET = "2026-09-06"` will start failing `tests/unit/unsubscribe-secret-rotation.test.ts` on that date (CLAUDE.md "Known deadline"). This programme does **not** change that posture; it records evidence per WP so the gates can be closed by the owner (WP-8).

---

## 2. Non-negotiables (in addition to `CLAUDE.md` §Hard boundaries)

1. `lib/db/repos/` is the only database access; repositories take an `Actor` and authorize themselves; `"use server"` modules never export actor-taking functions (`tests/unit/server-action-actor-boundary.test.ts`).
2. Public pages import `@/lib/auth/authorize` (pure) — never `@/lib/auth/actor` — unless they genuinely read a session (`/join`, `/launchpad`, portal).
3. Feature-scoped env only: `databaseEnv()`, `authEnv()`, `billingEnv()`, `aiEnv()`, `publicEnv()` from `lib/config/env.ts`.
4. No new schema in WP-1…WP-4. The only schema-adjacent work is WP-5 (uses existing `partners` + `media` tables) and none in WP-6 (PR6 explicitly prohibits migrations).
5. `config/wisetech-integration-manifest.ts` dispositions stand. Pre-approved amendments are enumerated in WP-7 only; each requires updating `tests/unit/wisetech-route-parity.test.ts` fixtures and `docs/integration/wisetech-route-parity.md` in the same commit.
6. The three real forms stay where their data owner is: event registration (`/events/[slug]`, `lib/events/registration-action.ts`), cohort application (`/launchpad`), showcase introduction (`/showcase/[slug]`, `lib/showcase/lead-request-action.ts`). Every donor "prepare and email" form (challenge, introduction, host, partner, contact, newsletter) that has no persisted owner stays a **prepared `mailto:` / Concierge hand-off**, exactly as the design does, until a schema is approved (D-6).
7. Do not reintroduce Tailwind v4 (`@import "tailwindcss"` in the donor CSS). hkwtia is Tailwind v3 with `tailwind.config.ts`.
8. Keep `tests/unit/public-shell-tokens.test.ts` satisfied: the `--shell-*` variables and the `"PingFang TC"`, `"Noto Sans TC"`, `"Microsoft JhengHei"` fallbacks and `prefers-reduced-motion: reduce` block must remain in `app/globals.css`. Retune their values; do not remove them.
9. Accessibility floor is the donor's, which is high: skip link, one `main#main-content`, `aria-expanded/controls/haspopup` on menu triggers, roving arrow-key focus across triggers, `Escape` returns focus, focus trap in the mobile dialog, `aria-live` on results, `:focus-visible` 3px outline. `tests/e2e/accessibility.spec.ts` (axe) must stay green.

---

## 3. Decisions (defaults Claude Code proceeds with unless the owner overrides in writing)

| ID | Decision | Default | Alternative / when to escalate |
|---|---|---|---|
| D-1 | Direction | Port the design **into hkwtia**; `wisetech` stays a frozen donor and is archived after WP-8 | — |
| D-2 | Fonts | Adopt the design's stacks verbatim (`--display` serif, `--sans`) + zh fallbacks; remove `Playfair_Display`/`Inter` from `app/[locale]/layout.tsx` | Self-host a Palatino-class face (TeX Gyre Pagella, GUST licence) via `next/font/local` if the owner wants OS-independent rendering |
| D-3 | Navigation IA | Keep the 4 canonical groups in `config/navigation.ts` (boundary test forbids donor-only groups/paths) but port the design's mega-menu **presentation**: "Explore <group>" heading, "View overview" link, two titled columns, feature aside with status label + CTA, event-first accent | Move to the design's 5 task-led groups only after WP-7 un-retires `/partners` and `/programmes` and the owner approves editing `tests/unit/wisetech-shell-boundary.test.ts` |
| D-4 | AI+ industry pathways | Render the 6-industry selector; "Enter this ecosystem" links to `/showcase?category=<industry>` (real filter, `lib/showcase/contracts.ts`), education → `/events`, responsible-AI → `/ai-transparency` (manifest merges) | Dedicated `/ai-plus/*` pages need a content authority that does not exist — escalate |
| D-5 | Event filters | Implement what the data supports: quick tabs **Open Now** / **Past Events** (`?status=open\|past`), cards ↔ calendar view, result count, honest empty. Do **not** render type/format/language/price filters over fields the `events` table lacks | Add taxonomy columns in a separate, owner-approved migration |
| D-6 | Newsletter / interest / challenge capture | Keep the design's prepared-email pattern (`mailto:contact@hkwtia.org?subject=…`) plus a Concierge launcher; link "Register interest" to `/events` or `/launchpad` per `cta-register-interest` | A persisted `inquiries` model is a separate product decision (not in scope) |
| D-7 | Membership pathways | Present the 4 canonical plans (`community`, `startup`, `corporate`, `patron`) in the design's card layout; render **SME** as an audience pathway card (→ `/events` AI clinics + `/membership#startup`) rather than a fifth plan; labels come from `lib/membership/public-catalog.ts` | If the Association approves an SME plan, add it via the plan seed, not the UI |
| D-8 | Impact metrics | Every number is computed from a repository or typed record at request time and rendered with definition + period + source; zero → hide the tile (design's own rule: "figures describe available records… not Association-wide totals") | Never hard-code `17 / 2 / 79` |
| D-9 | Archive photography | "From the WTIA archive" section is fed by typed history milestones with tracked own-origin images (`content/milestones.ts`, `public/images/history/`) — evidence-backed today. Donor `.webp` photos enter only through WP-5 rights review | — |
| D-10 | Brand line | Keep "WiseTech Hong Kong — the evolving AI+ industry platform of the Hong Kong Wireless Technology Industry Association" and the zh note "中文法定名稱待正式批准" exactly as the design states; do not invent a Chinese legal name | Owner supplies the approved name |

---
## 4. Design-system port contract

### 4.1 Token mapping (donor `app/globals.css :root` → hkwtia `app/globals.css`)

Add the design tokens as first-class variables **and** retune the existing `--shell-*` / shadcn HSL triplets to the same palette so Tailwind utilities, shadcn components, portal and admin inherit the look without a rewrite. HSL values below are exact conversions of the donor hex.

| Donor token | Value | New hkwtia variable | Retuned existing variable(s) |
|---|---|---|---|
| `--ink` | `#0f4c81` | `--wt-ink: #0f4c81` | `--shell-navy: 208 79% 28%`, `--shell-ink: 208 79% 28%`, `--foreground: 208 79% 28%` |
| `--ink-soft` | `#1a4f82` | `--wt-ink-soft` | `--primary: 209 67% 31%`, `--ring: 209 67% 31%`, `--shell-focus: 209 67% 31%` |
| `--paper` | `#f6f6f6` | `--wt-paper` | `--background: 0 0% 96%`, `--shell-canvas: 0 0% 96%` |
| `--paper-bright` | `#ffffff` | `--wt-paper-bright` | `--card`, `--popover`, `--shell-raised: 0 0% 100%` |
| `--stone` | `#e0dede` | `--wt-stone` | `--border: 0 3% 87%`, `--input`, `--shell-border` |
| `--steel` | `#646464` | `--wt-steel` | `--muted-foreground: 0 0% 39%`, `--shell-muted` |
| `--cyan` | `#1a80b6` | `--wt-cyan` | `--shell-blue: 201 75% 41%`, `--secondary` |
| `--jade` | `#5188bf` | `--wt-jade` | — (audience accent) |
| `--amber` | `#f2d58f` | `--wt-amber` | `--accent: 42 79% 75%`, `--shell-accent` |
| `--blue` | `#729bb5` | `--wt-blue` | — (audience accent) |
| `--violet` | `#457495` | `--wt-violet` | — (audience accent) |
| `--line` | `rgba(51,51,51,.16)` | `--wt-line` | — |
| `--line-light` | `rgba(255,255,255,.2)` | `--wt-line-light` | — |
| `--shadow` | `0 32px 90px rgba(15,76,129,.14)` | `--wt-shadow` | `--shell-shadow-lg` |
| focus ring | `#ff5c4d` 3px, offset 4px | `--wt-focus` | keep `:focus-visible` rule global |
| `--display` | `"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif` | `--font-serif` (replaces Playfair var) | `h1,h2 { font-family: var(--font-serif); font-weight: 500; letter-spacing: -0.045em }` |
| `--sans` | `"Avenir Next",Avenir,"Helvetica Neue",Helvetica,Arial,sans-serif` | `--font-sans` (replaces Inter var) | append `,"PingFang TC","Noto Sans TC","Microsoft JhengHei",system-ui` for zh |

Expose the new colours in `tailwind.config.ts` under `colors.wt.{ink,inkSoft,paper,paperBright,stone,steel,cyan,jade,amber,blue,violet}` so components can use `bg-wt-ink` / `text-wt-cyan` and keep the `shell.*` names for `tests/unit/public-shell-tokens.test.ts`.

### 4.2 Layout primitives (donor class → hkwtia component or utility)

| Donor pattern | Port as | Notes |
|---|---|---|
| `.shell` `width:min(1440px,calc(100% - 80px))` (48px @≤1120, 32px @≤820, 28px @≤520) | `components/wt/shell.tsx` + Tailwind `max-w-shell` retuned to `1440px` | replaces ad-hoc `container mx-auto px-6` on public pages |
| `.section` `padding-block:clamp(92px,10vw,160px)` (82px @≤520) | `components/wt/section.tsx` (`tone: "paper" \| "bright" \| "ink"`) | supersedes `components/marketing/section.tsx` for public pages |
| `.section-heading`, `.split-heading`, `.inner-section-heading` | `components/wt/section-heading.tsx` (`split`, `inverse`) | eyebrow + h2 + lead in a 2-column split at ≥820 |
| `.eyebrow` (11px / 800 / .2em / uppercase / `#646464`; `.light` = white 74%) | `components/wt/eyebrow.tsx` | |
| `.status-label` (10px / 800 / .16em) | `components/wt/status-label.tsx` | |
| `.button`, `.button-small`, `.button-dark`, `.button-light`, `.text-link`, `.light-link` (arrow `↗` with hover translate) | extend `components/ui/button.tsx` variants `wt`, `wt-dark`, `wt-light`, `wt-text`; add `components/wt/arrow.tsx` (`aria-hidden`) | min-height 50 / 42; radius 10px; 13px / 800 |
| `.card-index` (`01`…) | `components/wt/card-index.tsx` | |
| `.honest-empty`, `.inner-honest`, `.pulse-ring`, `.light-empty` | `components/wt/honest-empty.tsx` (`tone`, `title`, `copy`, `actions`) | replaces `components/marketing/empty-state.tsx` visually; keeps `role="status"` / `aria-live="polite"` |
| `.page-hero` (photo figure + caption, `.page-hero-art` "W+", eyebrow, h1, lead, breadcrumb) | `components/wt/page-hero.tsx` | supersedes `components/marketing/page-hero.tsx`; image must be own-origin (`institutional-page-intro.tsx` already validates this — reuse `decodeValidatedEditorialImageLayer`) |
| `.inner-page-hero` + `.inner-hero-actions` | same component, `variant="inner"` with `primary`/`secondary` actions | |
| `.inner-closing` / `ClosingBand` | `components/wt/closing-band.tsx` | ink background, title, copy, actions |
| `.event-interest` band | `components/wt/interest-band.tsx` | D-6 CTA |
| `.intro-process` (numbered steps) | `components/wt/step-grid.tsx` | |
| `.service-grid`, `.principle-grid`, `.badge-grid` | `components/wt/card-grid.tsx` | |
| `.page-updated` footer note | `components/wt/page-updated.tsx` | date comes from page-copy `updatedAt` or `git`-free constant per page, never `Date.now()` |
| Breakpoints 1320 / 1120 / 820 / 520 | add `screens: {wt-xl: "1320px", wt-lg: "1120px", wt-md: "820px", wt-sm: "520px"}` in `tailwind.config.ts` | use `max-width` media in the port CSS where the donor does |

Port the donor's CSS **selectively** into `app/styles/wisetech.css` (imported from `app/globals.css` after the Tailwind layers): keep the component rules for the patterns above, drop `@import "tailwindcss"`, drop anything that targets donor-only sections you are not porting, and prefix nothing — the donor's class names are already namespaced by intent (`.hero`, `.mega-menu-v2`, `.legacy-network`, …). Preflight conflicts to check: `img { display:block }`, `h1..h3 { margin-top:0 }`, `button { font: inherit }` — the donor sets all three; keep them.

### 4.3 Motion

Donor keyframes to port: `hero-breathe` (14s scale on the hero image), `node-pulse` (network nodes), `pulse-ring`. All must sit inside `@media (prefers-reduced-motion: no-preference)`; the existing `reduce` block already zeroes durations globally.

### 4.4 Section catalogue — donor component → hkwtia data owner (the core of WP-3/WP-4)

| Donor component (file) | hkwtia page | Data owner / read model | Links (canonical) |
|---|---|---|---|
| `Header`, `Brand` (`WiseTechSite.tsx`) | shell | `config/navigation.ts`, `Navigation` messages | `/events`, `/join`, `/portal` (→ `/member-login` after WP-6) |
| `Hero` | `/` | `Home` messages; hero image: own-origin tracked asset | `/events`, `/membership`, `/showcase` |
| `OpportunityBoard` "Open now" | `/` | `eventsRepository.listPublic(anonymous, {status:"open", asOf, locale, limit:3})` with `const anonymous = {kind:"anonymous", userId:null} as const` (the pattern in `lib/home/home-highlights.ts`) | `/events?status=open`; empty → interest band (D-6) + `/contact` |
| `AudienceSection` (5 pathway cards) | `/` | static (`Home.pathways.*`) | corporates→`/membership`, smes→`/events`, startups→`/showcase`, professionals→`/membership`, gba→`/launchpad` (manifest merges) |
| `EventsPreview` (Before/During/After + empty) | `/` | `eventsRepository.listFeaturedPublic(anonymous, {asOf, limit:2, locale})` | `/events` |
| `MarketProducts` (Directory + Marketplace panels) | `/` | `showcaseRepository.listPublished({}, {limit: 12})` length (bounded; no count helper exists) | `/showcase`, `/showcase?useCase=…` |
| `OutcomesSection` | `/` | none today → honest empty by design | `/contact` |
| `Ecosystem` (6 industries, client selector) | `/` | static list; links per D-4 | `/showcase?category=…`, `/events`, `/ai-transparency` |
| `ProgrammeShowcase` (4 cards) | `/`, `/programmes` (WP-7) | `content/programs/{tct,asa,hkict,cpai}.ts` typed records (edition counts, funders) | `/programs/{tct,asa,hkict,cpai}` |
| `GbaSection` | `/` | static + `cohortRepository` (`lib/db/repos/cohorts.ts`, `PUBLIC_COHORT_STATUSES`) open-cohort flag | `/launchpad` |
| `ImpactSection` (metrics with definitions) | `/` | computed per D-8: published past events count, published partners count by category, ASA edition regions from typed record | `/programs/asa`, `/partners` |
| `RealCommunity` (archive photo grid) | `/` | `lib/history/milestones.ts` `featuredOnly()` with `content/milestone-image-map.json` images (D-9) | `/about/history/[slug]` |
| `LegacyNetwork` (3 tabs, 12-logo preview, counts) | `/` | `partnersRepository.listPublished(locale, {limit:100})` grouped by `category` | `/partners` (WP-7) else `/about` |
| `ConversionPaths` | `/` | static | `/membership`, `/join`, `/contact` |
| `Footer` (brand, newsletter, 4 link columns, legal row) | shell | `Footer` messages; contact details from a new `siteConfig.contact` block in `config/site.ts` (`email`, `phone`, `addressLines` — verify the phone against hkwtia.org before publishing; today only the address exists, in `Footer.address` / `Contact.address`) | `/privacy`; `/terms`, `/accessibility` only after WP-7 review |
| `Concierge` "Ask WiseTech" | shell | existing `ConciergeWidget` — restyle only | `/ai-transparency` |
| `EventsLandingPage`, `EventCard`, `EventDetailPage` (`ExpansionPages.tsx`) | `/events`, `/events/[slug]` | `listPublicEvents`, `getPublicEventBySlug`, `localizeEvent`, registration action | D-5 |
| `DirectoryPage`, `SolutionsPage`, `PendingRecordPage` | `/showcase`, `/showcase/[slug]` | `lib/showcase/*`, `showcase-filters.tsx`, `request-intro-form.tsx` | prompts → `?q=`, needs → `?useCase=`, badges section labelled "proposed" |
| `MembershipPage`, `JoinPage` (design) | `/membership`, `/join` | `buildPublicMembershipCatalog` (4 plans), real join flow | D-7; the design's 6-step draft form is **not** ported — the real `/join` flow is authoritative |
| `ProgrammesPage`, `ProgrammeRecordPage`, `ProgrammeEditionPage` (`FullInnerPages.tsx`) | `/programs/*`, `/programmes` (WP-7) | typed programme records + `program-editions.tsx` | |
| `GbaPage` | `/launchpad` | cohorts, landing partners (`lib/db/repos/landing-partners.ts`) | |
| `PartnersPage` | `/partners` (WP-7) | `partnersRepository.listPublished` | per-record relationship status from `relationship_confirmed_at`, window dates |
| `InsightsPage`, `InsightCategoryPage` | `/news` | `listPublishedNews(locale)`; category chips only for categories that exist in `posts` | |
| `EnquiryPage` (challenge / introduction / host / contact) | `/contact` | `contact-concierge-launcher.tsx` + prepared `mailto:` (D-6); introduction → `/showcase/[slug]` lead form | |
| `PortalPage`, `PortalSubPage` (preview) | `/portal/*` | **do not port** — real portal exists; WP-6 aligns its chrome | |
| `StandardPage` (`why-wisetech`, `ai-transparency`, `ai-ops`, `about`, `partner-with-us`) | `/about`, `/ai-transparency`, `/ai-ops`, `/contact` | page-copy namespaces | |
| `SearchPage` | — | retired (no search authority); header search icon links to `/showcase` with focus on `q` until a search surface exists | |

---
## 5. Work packages

Order is mandatory: WP-0 → WP-1 → WP-2 → WP-3 → WP-4 → (WP-5 ∥ WP-6) → WP-7 → WP-8. Each WP ends with the full local gate (§7) and a PR whose description records the exact commands, exit codes and focused-test totals (the `docs/integration/wisetech-delivery-gates.md` checklist).

### WP-0 · Baseline, guardrails and evidence harness (½ day)

**Goal:** make visual drift measurable before changing pixels.

Files:
- `tests/e2e/wisetech-visual-baseline.spec.ts` (new): Playwright screenshots of `/`, `/events`, `/showcase`, `/membership`, `/about`, `/contact`, `/programs/asa`, `/news`, `/launchpad` at 1440×900, 1120×800, 820×1100, 390×844, both locales, `reducedMotion: "reduce"`, `toHaveScreenshot` with `maxDiffPixelRatio: 0.02`. Store baselines under `tests/e2e/__screenshots__/` (commit them; they are the "before").
- `docs/integration/wisetech-design-fidelity-checklist.md` (new): the §6 acceptance table as a living checklist; one row per design section/component with `not started / ported / verified` and the PR link.
- `docs/superpowers/plans/2026-09-01-wisetech-design-fidelity.md`: this file, committed as-is.
- `CLAUDE.md`: append §0.4.

RED tests: none (harness only). Exit: `npm run test:e2e -- tests/e2e/wisetech-visual-baseline.spec.ts` produces baselines; `npm test` unchanged.

### WP-1 · Design-system foundation (1–2 days)

**Goal:** the donor's tokens, type, spacing and primitives exist in hkwtia; nothing visible changes yet except fonts/colours drifting toward the design.

Files:
- `app/globals.css`: add the `--wt-*` variables and retune the existing triplets exactly as §4.1; replace `h1,h2,h3 { font-family: var(--font-serif) … }` with the donor rules (`h1,h2 { font-family: var(--font-serif); font-weight: 500; letter-spacing: -0.045em } h3 { letter-spacing: -0.025em }`); add `@import "./styles/wisetech.css";` after the Tailwind directives; keep the `.skip-link`, reduced-motion and zh fallback blocks.
- `app/styles/wisetech.css` (new): ported subset of donor `app/globals.css` (§4.2 list + `.announcement*`, `.site-header*`, `.header-inner`, `.brand*`, `.desktop-nav`, `.nav-button*`, `.header-actions`, `.search-link`, `.language-link`, `.signin-link`, `.mobile-*`, `.mega-menu-v2`, `.mega-menu-main`, `.mega-menu-heading`, `.mega-columns`, `.mega-column*`, `.mega-feature-v2`, `.hero*`, `.network-field`, all home-section rules, `.page-hero*`, `.inner-*`, `.honest-empty*`, `.pulse-ring`, `.event-*`, `.directory-*`, `.solution-*`, `.plan-grid`, `.membership-*`, `.first-90`, `.partner-*`, `.legacy-*`, `.archive-*`, `.impact-*`, `.gba-*`, `.conversion-*`, `.site-footer`, `.footer-*`, `.concierge*`, media queries at 1320/1120/820/520, keyframes). Remove `@import "tailwindcss"`. Keep the donor's selectors verbatim so the port can be diffed against the donor file.
- `app/[locale]/layout.tsx`: per D-2 remove `Inter`/`Playfair_Display` imports and the `className` variables; `<html lang={locale}>` keeps the `hreflang`-correct value (`zh-HK`), while the design's `zh-Hant-HK` is applied on the public wrapper `div` (`app/[locale]/(public)/layout.tsx`).
- `tailwind.config.ts`: `colors.wt.*`, `screens` (§4.2), `maxWidth.shell: "1440px"`, `fontFamily.serif/sans` → the new stacks.
- `components/wt/` (new directory, kebab-case files): `shell.tsx`, `section.tsx`, `section-heading.tsx`, `eyebrow.tsx`, `status-label.tsx`, `arrow.tsx`, `card-index.tsx`, `honest-empty.tsx`, `page-hero.tsx`, `closing-band.tsx`, `interest-band.tsx`, `step-grid.tsx`, `card-grid.tsx`, `page-updated.tsx`. All Server Components, all props typed `Readonly<…>`, no strings inside (labels come in as props).
- `components/ui/button.tsx`: add variants `wt`, `wtDark`, `wtLight`, `wtText` (class names `.button`, `.button-dark`, `.button-light`, `.text-link`).

RED tests (write first, watch fail):
- `tests/unit/wisetech-tokens.test.ts`: `app/globals.css` defines every `--wt-*` token with the exact donor value; `--shell-navy` equals `208 79% 28%`; `--font-serif` contains `"Palatino Linotype"`; `tailwind.config.ts` exposes `wt.ink`.
- `tests/unit/wisetech-css-port.test.ts`: `app/styles/wisetech.css` contains no `@import "tailwindcss"`, no `url(http`, no donor route strings (`/activities`, `/members`, `/solutions`), and every selector in a pinned list (`.shell`, `.section`, `.honest-empty`, `.mega-menu-v2`, `.page-hero`, `.legacy-network`, `.concierge`) exists.
- `tests/unit/wt-primitives.test.tsx`: each primitive renders its landmark/aria correctly (`HonestEmpty` has `role="status"`; `Arrow` is `aria-hidden`; `PageHero` throws on non-own-origin image).
- Update `tests/unit/public-shell-tokens.test.ts` only if a retuned value breaks its `toContain` assertions (it checks names, not values — it should pass untouched).

Exit: `npm run build` green; baseline screenshots differ only in colour/type (expected); update baselines at the end of WP-1 and commit.

### WP-2 · Public shell fidelity: announcement, header, mega menu, mobile menu, footer, concierge (2 days)

**Goal:** the shell is indistinguishable from the design at every breakpoint, over the canonical 4-group IA (D-3).

Files:
- `components/layout/announcement-bar.tsx`: donor `.announcement` (ink bar, amber dot, link with arrow, `×` dismiss, `aria-label` dismiss). Data stays `announcementsRepository.getActive`; dismissed state per session in `sessionStorage` (client island only for the button).
- `components/layout/site-header.tsx`: donor structure — `header.site-header` absolute over the hero, `.scrolled` fixed/solid at `scrollY > 56` (client island `components/layout/header-scroll-state.tsx`), `.no-announcement` modifier, `.header-inner` 3-column grid (`minmax(330px,1fr) auto minmax(290px,1fr)`), brand lockup with logo tile + "WiseTech Hong Kong" + descriptor small, `.desktop-nav` triggers with `⌄`, `.header-actions`: search (`/showcase` until WP-7 decides), language link, "Member sign in" (`/portal` → `/member-login` after WP-6), "Join WiseTech" small button, mobile trigger. Add prop `variant: "overlay" | "solid"`; home and pages with a photo hero use `overlay`.
- `components/layout/desktop-mega-navigation.tsx`: donor `.mega-menu-v2` layout — `mega-menu-main` (heading "Explore <group>" + "View overview ↗" to `landingHref`; `mega-columns` with `mega-column-title` per column) + `mega-feature-v2` aside (`status-label`, `mega-feature-title`, copy, CTA). Add `feature: {labelKey, titleKey, copyKey, ctaKey, href}` per group in `config/navigation.ts` (hrefs must be `PublicRoute` members). Keep the existing keyboard contract (`tests/unit/navigation.test.ts`, `tests/e2e/public-shell.spec.ts`) and the 180 ms hover-close timer, pointer-down outside close, `Escape` → focus trigger, ArrowLeft/Right/Home/End roving.
- `components/layout/mobile-navigation.tsx`: donor `.mobile-menu` dialog — top bar (brand + `×`), `.mobile-priority-actions` ("Find an Event", "Join WiseTech"), `.mobile-utilities` (search, sign in, language), eyebrow "Explore the ecosystem", `.mobile-accordions` (first 5 links per group, last styled `.mobile-view-all`), focus trap, `body` scroll lock, close after locale switch (existing fix `ccd747f` must survive).
- `components/layout/dual-brand-lockup.tsx`: donor `.brand` tile (108×48 white tile, `public/images/wtia-logo.png` sha pinned by `tests/unit/wisetech-asset-provenance.test.ts`) + copy; descriptor per D-10.
- `components/layout/site-footer.tsx`: donor `.site-footer` — `footer-top` (brand + description + small legal line; newsletter block per D-6 with `noValidate` form that opens a prepared `mailto:` and shows `role="status"` success/`role="alert"` error), `footer-links` 4 columns (Explore / Connect / Membership / Contact with `<address>` from `siteConfig.contact`, added in WP-3 — or add it here if WP-2 ships first), `footer-bottom` ("Technology + Wisdom. Hong Kong + The World." + Privacy / language link; Terms & Accessibility only after WP-7).
- `components/ai/concierge-widget.tsx`: restyle launcher to donor `.concierge-trigger` (`W+` badge + "Ask WiseTech"), panel header/prompt list/answer/transparency link classes; **no runtime change** (`tests/unit/concierge-widget.test.tsx`, `tests/e2e/concierge.spec.ts` must pass unchanged). Add per-section prompt suggestions as labels only (`Concierge.prompts.{home,membership,showcase,events}`), sent through the existing action.
- `app/[locale]/(public)/layout.tsx`: wrap in `div.site-root` with `lang` per §WP-1; pass `variant` to the header from a route-group segment config (`export const heroVariant` read via `lib/public-shell/hero-variant.ts` map keyed by pathname).
- `messages/{en,zh-HK}.json`: `Navigation.feature.*`, `Navigation.explore`, `Navigation.viewOverview`, `Navigation.search`, `Footer.newsletter.*`, `Footer.tagline`, `Concierge.prompts.*`. zh copy is taken from the donor verbatim (it is already Traditional Chinese, HK register).

RED tests: extend `tests/unit/public-shell.test.tsx` (feature aside renders per group; overlay variant sets `data-variant="overlay"`), `tests/unit/mobile-navigation.test.tsx` (priority actions, utilities, view-all class), `tests/unit/public-layout-announcement.test.tsx` (dismiss button `aria-label`), snapshot for footer columns; `tests/e2e/public-shell.spec.ts` gains a scrolled-header assertion. `tests/unit/wisetech-shell-boundary.test.ts` must remain green (no donor imports, no donor-only paths).

Exit: shell matches the donor at 1440/1120/820/520 (visual baseline updated); axe clean.

### WP-3 · Homepage: the 13 sections over real read models (3 days)

**Goal:** `/` and `/zh` render the design's home page in order, with every section either data-backed or in its honest empty state.

File plan (`app/[locale]/(public)/page.tsx` becomes a thin composition; each section is a Server Component in `components/home/`):

| # | Component (new file) | Read model | Empty behaviour |
|---|---|---|---|
| 1 | `components/home/hero.tsx` | `Home.hero.*` messages; image `public/images/projects-hero.jpg` until WP-5 swaps an approved archive photo; `fetchPriority="high"`, `.hero-scrim`, `.network-field` | n/a |
| 2 | `components/home/open-now.tsx` | `eventsRepository.listPublic(anonymous, {status:"open", asOf: new Date(), locale, limit: 3})` wrapped `.catch(() => [])` | `HonestEmpty` "No activities are currently open." + interest band (D-6) + "Submit a challenge" → `/contact` |
| 3 | `components/home/pathways.tsx` | static 5 cards, accents `cyan/jade/amber/blue/violet` | n/a |
| 4 | `components/home/events-journey.tsx` | `eventsRepository.listFeaturedPublic(anonymous, {asOf, limit: 2, locale})` | stage grid always; `.event-empty` with "View Open Now & Past Events" |
| 5 | `components/home/market-products.tsx` | `showcaseRepository.listPublished({}, {limit: 12})` length, bounded (no count helper exists; never print a total) | copy states "No live … records are shown yet" exactly as the donor when count is 0 |
| 6 | `components/home/outcomes.tsx` | none (D-8) | always the honest publishing-framework state |
| 7 | `components/home/ecosystem.tsx` (`'use client'` selector, list passed in) | static 6 industries, hrefs per D-4 | n/a |
| 8 | `components/home/programme-showcase.tsx` | `content/programs/index.ts` (name, type, edition count, latest edition year) | n/a (typed) |
| 9 | `components/home/gba-gateway.tsx` | `cohortRepository` open cohort exists (`PUBLIC_COHORT_STATUSES`)? → CTA label "View open cohort" else "Explore Launch Pad" | n/a |
| 10 | `components/home/impact-evidence.tsx` | `lib/home/impact-metrics.ts` (new): `{pastEvents, partnersByCategory, asaRegions?}` each `{value, definition, period, source}`; computed with `Promise.allSettled`, tiles with `value === 0` or failed reads are omitted | section hidden when no tile survives |
| 11 | `components/home/archive-stories.tsx` | `featuredOnly(milestones)` top 4 with images from `content/milestone-image-map.json` (D-9); link to official gallery `https://hkwtia.org/photo-gallery/` `rel="noreferrer"` | hidden when < 1 image |
| 12 | `components/home/legacy-network.tsx` (`'use client'` tabs, data passed in) | `partnersRepository.listPublished(locale, {limit: 100})` grouped `supporting / regional / media`; preview 12 per tab; counts padded `01`; note: "Inclusion does not imply a current relationship unless separately confirmed." | hidden when 0 published partners (do **not** render the donor's hard-coded 79) |
| 13 | `components/home/conversion-paths.tsx` | static | n/a |

Also:
- `lib/home/home-highlights.ts` stays for the `event/news/showcase` slots (reused inside #4/#5 where useful) — do not delete; `tests/unit/home-highlights*.test.ts` remain.
- Metadata: title `WiseTech Hong Kong` (absolute), description copied from the donor's `generateMetadata` (`../wisetech/app/[lang]/[[...slug]]/page.tsx`) into `Home.metaTitle` / `Home.metaDescription` and emitted through `buildPageMetadata` in `app/[locale]/(public)/page.tsx`; OG image own-origin (`public/images/og-wisetech.png` — generate a 1200×630 from the brand tile; never copy `og-wtia-blue.png`).
- `config/site.ts`: add `contact: {email: "contact@hkwtia.org", phone: "+852 2989 9164", addressLines: ["4/F, KOHO", "73–75 Hung To Road", "Kwun Tong, Hong Kong"]}` (phone as printed by the donor — verify against hkwtia.org before the PR); footer, contact page and structured data read from it.
- `StructuredData`: extend `buildOrganizationData()` with `alternateName: ["WiseTech Hong Kong","HKWTA","WTIA"]`, `telephone`, `address` (from `siteConfig.contact`) and a `WebSite` node with `inLanguage: ["en-HK","zh-Hant-HK"]`.

RED tests: `tests/unit/homepage.test.tsx` rewritten to assert the 13 section landmarks in order (`aria-labelledby` ids `hero-title`, `open-now-title`, …), empty states when readers reject, `legacy-network` hidden at 0 partners, impact tiles omitted at 0; `tests/unit/impact-metrics.test.ts` (definitions present, zero → omitted, rejected reader → omitted); `tests/unit/homepage-partner-wall-integration.test.tsx` migrated to the new component; `tests/e2e/wisetech-pr3-public-pages.spec.ts` updated for the new H1.

Exit: `/` matches the donor section-for-section at all breakpoints; Lighthouse (`npm run test:lighthouse`, target `/` added to `lighthouserc.js`) performance ≥ 90 with the hero image as LCP; CLS < 0.05 (hero has explicit `width/height`).

### WP-4 · Inner-page patterns over real journeys (3–4 days)

Apply `components/wt/page-hero.tsx` (photo figure + caption + breadcrumb + actions) and the donor section grammar to every public page. Per page:

- **`/events`** (`app/[locale]/(public)/events/page.tsx`): InnerHero (community visual); `.event-quick-tabs` = Open Now / Past Events only (D-5), `aria-pressed`; `.activity-type-strip` links → `/events?status=open`, `/launchpad`, `/showcase` (no donor `/activities/*`); `.event-results-head` count with `role="status"`; `.event-view-switch` cards ↔ calendar (client island, `?view=calendar` in URL via `router.replace`); `EventCard` (donor `.event-library` card: status pill, `<time>`, venue, format, CTA); recommendations row → `/launchpad`, `/showcase`, `/membership`; interest band; closing band "Host or partner" → `/contact`.
- **`/events/[slug]`**: donor `.event-detail-hero` (own-origin hero media from PR5 `0023`), `.event-detail-facts`, `.event-detail-layout` main/aside, `.event-action-bar` with the real registration form (`components/portal/event-registration-form.tsx` / public action) for `open` events and "Past event" state otherwise; JSON-LD `Event` via `StructuredData` (already in `event-detail-seo.test.ts`).
- **`/showcase`**: PageHero (membership visual); `.directory-prompts` (6 buttons submit `?q=`); `.directory-search` bound to existing `ShowcaseFilters` (restyled, same `GET` semantics); `.solution-needs` 12 chips → `?useCase=<slug>`; results grid of `showcase-card.tsx` restyled; `HonestEmpty` when 0; `.solution-verification` badge definitions rendered under a `status-label` "Proposed badge definitions — not currently awarded" (copy from donor, verbatim); `.solution-pathways` buyer → `/contact`, provider → `/portal/company/listing` (auth) with public fallback copy; interest band → `/events`.
- **`/showcase/[slug]`**: donor `PendingRecordPage` pattern is **not** used (real records exist); keep `showcase-detail.tsx` + `request-intro-form.tsx`, restyle to the inner-page grammar.
- **`/membership`**: PageHero; `.plan-grid` over `buildPublicMembershipCatalog` (4 cards, `id` anchors `community/startup/corporate/patron`; "Discuss this pathway" → `/join?plan=<code>` per `cta-join-wisetech`); SME pathway card (D-7); `.pricing-note` shows real prices from the catalog when `publicPriceIds()` resolve, else the donor's "confirm with the membership team" note; `.membership-dimensions` 12 tiles with per-tier text from `Membership.dimensions.*`; `.first-90` steps; actions → `/join`, `mailto:`.
- **`/about`, `/about/history`, `/about/chairman`, `/about/committees`**: `RichPage` grammar (compass nav, sections, proof story, related routes) over existing `institutional-page-intro`/`story-section`/`milestone-timeline`; `about/leadership` and `about/governance` remain merges (redirects in WP-7).
- **`/programs/{tct,asa,hkict,cpai}`**: donor `ProgrammeRecordPage` header (type, audience, fact, source link) + existing `program-editions.tsx`/`program-credential.tsx`; "Ask the programme team" → `mailto:` (D-6).
- **`/launchpad`**: donor `GbaPage` route-board + `.service-grid` (Market entry / Soft landing / Buyer matching / Delegations) as **descriptive** cards, followed by the real cohort calendar, funding wizard and application form.
- **`/news`, `/news/[slug]`**: donor `InsightsPage` filters as chips over categories that actually exist in `posts` (`kind`/tags — verify in `lib/db/repos/public-posts.ts` before rendering; render no chip for an empty category); research-quality section (static); subscribe band (D-6).
- **`/contact`**: donor `EnquiryPage` for `contact` — `.enquiry-routes` 6 cards, verified details block from `siteConfig.contact` + `Contact.*` messages, `contact-concierge-launcher.tsx`, prepared-email form with `topic` presets (`?topic=portal|membership|events|programmes|partnership|privacy|media`) — no persistence.
- **`/ai-transparency`, `/ai-ops`, `/privacy`**: PageHero (governance visual) + existing content; `/ai-ops` dashboard cards adopt `.impact-metrics` styling.
- **`not-found.tsx`**: donor `NotFoundPage` (InnerHero with "Go to the homepage" / "Find an event").

RED tests: one rendered test per page under `tests/unit/wt-pages/*.test.tsx` asserting hero, section order and empty states; update `tests/e2e/public-route-matrix.spec.ts` and `tests/e2e/wisetech-pr5-public-journeys.spec.ts` selectors; keep `event-public-*`, `m5-*`, `membership-*` suites green (they pin the business contracts).

### WP-5 · Content & asset migration through the CMS (2 days + staff review time)

**Goal:** the 79 partner records and the archive photography reach production **only** through the audited authorities with rights confirmation — never by copying files.

- `scripts/import-wisetech-partners.ts` (new). Follow the established seed shape (`scripts/seed-m5.ts`: `pg` `Pool` + `assertIsolatedSeedEnvironment` / `assertSeedSentinel` from `scripts/lib/acceptance-guard.ts`), extended with an explicit production switch: the script runs only when `WISETECH_PARTNER_IMPORT=true` **and** either the sentinel proves a disposable database or `WISETECH_IMPORT_ALLOW_PRODUCTION=true` is set by the owner together with `WISETECH_IMPORT_ACTOR_PROFILE_ID` (the staff profile the audit rows are attributed to). It reads `partnerData.ts` (58 supporting, 15 regional, 6 media) and `public/partners/**` from the donor checkout at `WISETECH_DONOR_DIR`; for each record it (1) uploads the PNG bytes through `createR2Storage()` (`lib/media/r2-storage.ts`) using the same key/content-type validation as `lib/media/image-upload.ts`, (2) inserts the `media` row (`alt_en = "<name> logo"`, `alt_zh = "<name> 標誌"`) and the `partners` row (`name_en`, `name_zh_hk` = English name unless a Chinese name is supplied in a sidecar CSV, `category`, `display_order` = donor order, `featured = false`, `logo_media_id`) in **one transaction**, `published_at` and both `*_confirmed_at` columns **NULL**, and (3) writes the `audit_events` row exactly as `lib/db/repos/partners.ts` does for `partner.created`. Idempotent on `(category, name_en)`: a second run inserts 0 rows. Prints counts only; never prints URLs or secrets.
- Staff runbook `docs/integration/wisetech-partner-import-runbook.md`: for each partner, confirm relationship window and logo rights in `/admin/partners/[id]`, then publish. Publication is refused by the repo until both confirmations exist — that is the design's "current status: unconfirmed" made enforceable.
- Archive photography: the six donor `.webp` files stay `retire` until the owner records rights; when approved, upload via `/admin/media` (alt EN/ZH required) and reference them from `Home.hero` / history milestones via page-copy leaves — no file copies into `public/`.
- Page copy: add allowlisted leaves in `lib/i18n/page-copy-catalog.ts` for the marketing strings staff will edit (hero question, pathways, impact source note, footer tagline) and seed the shipped copy so a build without `DATABASE_URL` still serves it (M7.2 fail-soft).
- Update `config/wisetech-authoritative-source-inventory.ts` asset rows from `retire` → `merge` **only** after the owner confirms rights for that asset (each flip in its own commit with the confirmation reference in the message); `tests/unit/wisetech-asset-provenance.test.ts` pins the hashes.

RED tests: `tests/unit/wisetech-partner-import.test.ts` (guard refuses without flags; idempotent second run creates 0 rows; created rows are unpublished and unconfirmed; category mapping exact; alt text non-blank in both languages).

### WP-6 · Join, Portal and Admin alignment + the missing functions (= PR6, 4–5 days)

Execute `docs/superpowers/plans/2026-08-29-wisetech-pr6-join-portal-admin.md` as written, on top of WP-1 tokens. It is presentation + regression **plus** these real functional fixes its design identified — they are the "functions" part of the user's request:

1. `/[locale]/member-login` page + action backed by the existing rate-limited Neon magic-link path (no new identity store).
2. A working Portal sign-out control (`authClient.signOut()` exists; no operable control does).
3. One typed authority for safe Portal continuation paths (replace the "any path beginning with `/portal`" acceptance).
4. Complete onboarding hand-off: `CompleteApplicationResult` already carries the paid membership id + checkout command; both form actions discard it — route profile → company → checkout → review/complete.
5. Completion page reads a **webhook-authoritative** state (today it accepts only `pending_payment`, so the same membership 404s after activation).
6. Locale-correct Billing Portal return URL (currently hard-coded to the English route).
7. Internal application-shell primitives (`components/app-shell/*`) with Join / Portal / Admin variants using the WP-1 tokens; **no** public mega menu, announcement bar or footer inside transactional/authenticated layouts (PR6 non-goal).

Boundaries: no migrations, no auth/provider/Stripe configuration changes, no seeds. RED tests are enumerated in the PR6 plan; add `tests/e2e/member-login.spec.ts` (credential-free contract) and extend `portal-dashboard.spec.ts` with sign-out.

### WP-7 · Route, redirect, SEO and manifest amendments (1–2 days)

Pre-approved manifest amendments (each = code + `config/wisetech-integration-manifest.ts` + `docs/integration/wisetech-route-parity.md` + validator fixtures in one commit):

| Change | Why it is now safe | Files |
|---|---|---|
| Un-retire `/partners` → `retain` | PR4 created the verified partner authority the retire rationale said was missing | `app/[locale]/(public)/partners/page.tsx` (donor `PartnersPage`: source note, category nav with counts, record cards with relationship/status `<dl>`, "Represent one of these organisations?" → `/contact`), `config/public-routes.ts` (+`/partners`), `app/sitemap.ts`, `config/navigation.ts` (Connect column) |
| Un-retire `/programmes` → `retain` as a **typed index** | Four typed records exist; an index that lists all four privileges none | `app/[locale]/(public)/programmes/page.tsx` over `content/programs/index.ts` (donor `ProgrammesPage` groupings + `ProgrammeShowcase`); `/programmes/{tct,asa,hkict,cpai,launchpad}` become real redirects |
| Implement the 51 `merge` sitemap routes (plus the `merge` dispatcher patterns) as **real `next.config.ts` redirects** (`permanent: false`) to their canonical destinations (Appendix A; note `docs/integration/wisetech-route-parity.md` says "merge 45" — the inventory file is the authority, fix the doc in the same commit) | Old design links / the chatgpt.site sitemap resolve on the production domain instead of 404 | `next.config.ts` (`wisetechDesignRedirects` array generated from the manifest at build time via `config/wisetech-redirects.ts`), `tests/unit/redirects.test.ts`, `tests/unit/wisetech-route-parity.test.ts` |
| Keep `/search`, `/accessibility`, `/terms`, `/portal/{introductions,programmes,councils,gba,preferences}` retired | No authority or reviewed content | — (owner may supply reviewed Terms/Accessibility copy later → page-copy namespaces) |

SEO: `app/sitemap.ts` emits `alternates.languages` (`en`, `zh-Hant`) per route; `buildPageMetadata` titles follow the donor `pageTitles` map (`<Page> | WiseTech Hong Kong`); `robots` `noindex` for portal/join/unsubscribe; `hreflang` verified by `tests/unit/seo-routes.test.ts`; `/robots.txt` unchanged.

### WP-8 · Verification, evidence and gate closure (1 day + owner actions)

- Full suite: `npm run audit:strings && npm test && npm run lint && npm run typecheck && npm run build && npm audit --omit=dev --audit-level=high`.
- Browser: `npm run test:e2e` (public matrix, shell, accessibility/axe, concierge, PR3/PR5 journeys, visual baseline), `npm run test:lighthouse` against an **isolated Preview** URL; record scores.
- Bilingual parity: `tests/unit/messages.test.ts` (key parity) + manual `/zh` walk of all 13 home sections and every WP-4 page.
- Update `docs/integration/wisetech-design-fidelity-checklist.md` to all-`verified`, add a `docs/integration/wisetech-design-fidelity-evidence.md` with screenshots (before/after per breakpoint) and the command log.
- Owner-only actions (record, do not perform): enable `quality` as a required check on `main` and `release`; create the isolated Neon branch + test identities (gate 2); assign a UAT owner (gate 3); production approval (gate 4); resolve the 2026-09-06 unsubscribe sunset (remove the `cronSecret` fallback from `lib/api/unsubscribe-route.ts` and `app/[locale]/(public)/unsubscribe/page.tsx`, delete the constant and `tests/unit/unsubscribe-secret-rotation.test.ts` — CLAUDE.md "Known deadline").
- Archive the donor: add a `README` note in `YNWAforever/wisetech` pointing at hkwtia and this spec; keep the repo read-only.

---
## 6. Acceptance criteria (definition of "perfectly integrated")

A WP is done only when every applicable row is `verified` in `docs/integration/wisetech-design-fidelity-checklist.md` with a PR link.

| Area | Criterion | How it is checked |
|---|---|---|
| Tokens | Every `--wt-*` token equals the donor value; `--shell-*` retuned per §4.1; no Playfair/Inter font requests in the network log | `tests/unit/wisetech-tokens.test.ts`; Playwright `page.on("request")` filter on `fonts.gstatic.com` = 0 |
| Typography | `h1` on `/` computes to the serif stack at `clamp(60px,7.7vw,128px)`, `line-height: 0.9`; eyebrows 11px/800/0.2em uppercase | e2e computed-style assertions in `wisetech-visual-baseline.spec.ts` |
| Layout | `.shell` width and `.section` padding match the donor at 1440/1120/820/520; no horizontal scroll at 390px | e2e `document.documentElement.scrollWidth <= innerWidth` |
| Home | 13 sections present in donor order with the donor ids; each data-backed section renders real rows when the isolated DB has them and the honest empty state when it does not; no hard-coded numbers | `tests/unit/homepage.test.tsx`, `impact-metrics.test.ts`; grep guard: `tests/unit/wisetech-no-fabricated-metrics.test.ts` rejects the literals `17`, `79`, `58`, `15` inside `components/home/impact-evidence.tsx` and `legacy-network.tsx` |
| Shell | Overlay header over photo heroes, solid on scroll; mega menu with feature aside; mobile dialog with priority actions; footer 4 columns; concierge `W+` pill | `public-shell.test.tsx`, `public-shell.spec.ts`, screenshots |
| Inner pages | Every public route uses `components/wt/page-hero.tsx` with own-origin figure + caption + breadcrumb; every page has exactly one `main#main-content` and a skip link | `tests/unit/public-landmark-contract.test.ts`, `wt-pages/*.test.tsx` |
| Journeys | Event registration, cohort application and showcase introduction still submit through their existing Server Actions; `/join` → checkout → completion works end-to-end with the webhook-authoritative completion state; `/member-login` and portal sign-out exist | existing `event-*`, `m5-*`, `m6-*`, `join-*`, `checkout-*` suites + PR6 e2e |
| i18n | `messages/en.json` and `messages/zh-HK.json` in key parity; `/zh` renders every new section; no `/zh-HK/` href anywhere; `audit:strings` clean | `messages.test.ts`, `locale-href-boundary.test.ts`, `npm run audit:strings` |
| Content | Partner records imported unpublished with logos + bilingual alt; published only after both confirmations; the home wall and `/partners` show only published rows | `wisetech-partner-import.test.ts`, `partner-*` suites |
| Routes/SEO | All 51 `merge` donor sitemap routes redirect; `/partners` and `/programmes` are real pages; sitemap has `hreflang` pairs; portal/join `noindex` | `redirects.test.ts`, `wisetech-route-parity.test.ts`, `sitemap.test.ts`, `page-indexability.test.ts` |
| Accessibility | axe: 0 serious/critical on the public matrix; keyboard: mega menu roving focus, `Escape`, mobile focus trap; reduced motion honoured | `tests/e2e/accessibility.spec.ts`, `public-shell.spec.ts` |
| Performance | Lighthouse on `/`, `/membership`, `/events` (Preview): Performance ≥ 90, Accessibility ≥ 95, SEO ≥ 95; LCP < 2.5 s; CLS < 0.05 | `npm run test:lighthouse` (`lighthouserc.js` targets extended) |
| Security | CSP unchanged (`img-src 'self' data:`); no donor runtime; no new env access outside `lib/config/env.ts`; `npm audit --omit=dev --audit-level=high` clean | `ci-security-contract.test.ts`, `endpoint-hardening.test.ts`, `wisetech-shell-boundary.test.ts` |
| Evidence | PR descriptions carry commands, exit codes, focused-test totals; `docs/integration/wisetech-design-fidelity-evidence.md` has before/after screenshots per breakpoint and locale | review |

## 7. Verification commands (run in this order before every hand-off)

```sh
npm run audit:strings
npm test -- tests/unit/wisetech-tokens.test.ts tests/unit/wisetech-css-port.test.ts tests/unit/homepage.test.tsx   # focused first
npm test
npm run lint
npm run typecheck
npm run build
npm audit --omit=dev --audit-level=high
npm run test:e2e -- tests/e2e/public-shell.spec.ts tests/e2e/accessibility.spec.ts tests/e2e/public-route-matrix.spec.ts tests/e2e/wisetech-visual-baseline.spec.ts
PLAYWRIGHT_BASE_URL=<isolated-preview> npm run test:e2e          # release evidence only
LHCI_BASE_URL=<isolated-preview> npm run test:lighthouse         # release evidence only
```

Windows note (the repo's own docs use it): substitute `npm.cmd` for `npm`.

## 8. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Tailwind v3 preflight vs donor base rules produce subtle spacing drift | High | Port the donor's base rules after the Tailwind layers; visual baseline per breakpoint; fix at the `wisetech.css` level, not per component |
| Font-stack fidelity differs by OS (Iowan vs Palatino Linotype vs Georgia) | Medium | Accepted by D-2; offer TeX Gyre Pagella self-hosting as the alternative |
| Retuning `--primary`/`--foreground` changes portal/admin contrast | Medium | Run axe on `/portal` and `/admin` (credential-gated e2e) in WP-6; keep shadcn `destructive` untouched |
| Partner import treated as publication | Low (repo refuses) | Import creates unpublished, unconfirmed rows; publication needs both confirmations (`lib/db/repos/partners.ts` `publicationError()`) |
| Metrics or logos copied as literals | Medium | `wisetech-no-fabricated-metrics.test.ts`; code review rule: numbers come from read models |
| Donor-only routes leak into nav/footer | Medium | `wisetech-shell-boundary.test.ts` + route-parity validator; `PublicRoute` union type on every `href` |
| Header overlay hides content on pages without a photo hero | Medium | `variant="solid"` default; `overlay` opt-in per page via `lib/public-shell/hero-variant.ts` |
| `2026-09-06` unsubscribe sunset fails CI mid-programme | Certain if ignored | Owner action in WP-8; if the date passes first, do the removal as a separate `fix:` PR before continuing |
| Production drift while the programme runs (direct deploys from `release`) | Medium | Rebase each WP on `origin/main`; never target `release` directly; evidence per PR |

## Appendix A — Donor route → canonical hkwtia destination (from `config/wisetech-authoritative-source-inventory.ts`, 67 sitemap routes)

| Donor route (`/en/...`, `/zh/...`) | Disposition | Canonical hkwtia destination |
|---|---|---|
| `/` | retain | `/` |
| `/why-wisetech` | merge | `/about` |
| `/ai-plus` | merge | `/ai-transparency` |
| `/ai-plus/commerce-professional-services` | merge | `/showcase` |
| `/ai-plus/manufacturing-robotics` | merge | `/showcase` |
| `/ai-plus/health-life-sciences` | merge | `/showcase` |
| `/ai-plus/retail-creative-industries` | merge | `/showcase` |
| `/ai-plus/education-future-of-work` | merge | `/events` |
| `/ai-plus/responsible-ai-data-cybersecurity` | merge | `/ai-transparency` |
| `/for-corporates` | merge | `/membership` |
| `/for-smes` | merge | `/events` |
| `/for-startups` | merge | `/showcase` |
| `/for-professionals` | merge | `/membership` |
| `/for-gba-global` | merge | `/launchpad` |
| `/members` | redirect | `/showcase` |
| `/solutions` | merge | `/showcase` |
| `/events` | retain | `/events` |
| `/events/asia-smart-innovation-awards-summit-2025` | merge | `/events/[slug]` |
| `/events/smart-innovation-meets-genai` | merge | `/events/[slug]` |
| `/activities` | merge | `/events` |
| `/activities/ai-clinics` | merge | `/events` |
| `/activities/buyer-days` | merge | `/events` |
| `/activities/industry-councils` | merge | `/events` |
| `/activities/training` | merge | `/events` |
| `/activities/gba-delegations` | merge | `/launchpad` |
| `/activities/community` | merge | `/events` |
| `/activities/mentoring-volunteering` | merge | `/contact` |
| `/host-an-activity` | merge | `/contact` |
| `/programmes` | retire | — |
| `/programmes/tech-connect` | merge | `/programs/tct` |
| `/programmes/asia-smart-innovation-awards` | merge | `/programs/asa` |
| `/programmes/asia-smart-innovation-awards/2025` | merge | `/programs/asa` |
| `/programmes/hkict-startup-award` | merge | `/programs/hkict` |
| `/programmes/cpai` | merge | `/programs/cpai` |
| `/programmes/launchpad` | merge | `/launchpad` |
| `/gba` | merge | `/launchpad` |
| `/gba/market-entry` | merge | `/launchpad` |
| `/gba/delegations` | merge | `/launchpad` |
| `/gba/soft-landing` | merge | `/contact` |
| `/gba/partner-network` | merge | `/contact` |
| `/gba/gone-global` | merge | `/showcase` |
| `/membership` | retain | `/membership` |
| `/join` | retain | `/join` |
| `/partner-with-us` | merge | `/contact` |
| `/partners` | retire | — |
| `/insights` | merge | `/news` |
| `/insights/case-studies` | merge | `/showcase` |
| `/insights/guides` | merge | `/news` |
| `/insights/industry-perspectives` | merge | `/news` |
| `/insights/responsible-ai` | merge | `/ai-transparency` |
| `/insights/gba-intelligence` | merge | `/launchpad` |
| `/insights/event-replays` | merge | `/events` |
| `/about` | retain | `/about` |
| `/about/history` | retain | `/about/history` |
| `/about/leadership` | merge | `/about/chairman` |
| `/about/committees` | retain | `/about/committees` |
| `/about/governance` | merge | `/about/committees` |
| `/responsible-ai` | merge | `/ai-transparency` |
| `/verification` | merge | `/showcase` |
| `/submit-challenge` | merge | `/contact` |
| `/request-introduction` | merge | `/showcase/[slug]` |
| `/contact` | retain | `/contact` |
| `/accessibility` | retire | — |
| `/privacy` | retain | `/privacy` |
| `/terms` | retire | — |
| `/ai-transparency` | retain | `/ai-transparency` |
| `/ai-ops` | retain | `/ai-ops` |

Dispatcher-only (non-sitemap) donor behaviours:

| Donor pattern | Disposition | Canonical |
|---|---|---|
| `/search` | retire | — |
| `/join/success` | merge | `/join/complete` |
| `/events/[slug]` | merge | `/events/[slug]` |
| `/members/[slug]` | merge | `/showcase/[slug]` |
| `/solutions/[slug]` | merge | `/showcase/[slug]` |
| `/insights/[slug]` | merge | `/news/[slug]` |
| `/ai-plus/[slug]` | retire | — |
| `/programmes/[slug]` | retire | — |
| `/programmes/[slug]/[edition]` | retire | — |
| `/programmes/hkict` | merge | `/programs/hkict` |
| `/programmes/asa` | merge | `/programs/asa` |
| `/programmes/tct` | merge | `/programs/tct` |
| `/portal/profile` | merge | `/portal/profile` |
| `/portal/company` | merge | `/portal/company` |
| `/portal/seats` | merge | `/portal/company/seats` |
| `/portal/directory` | merge | `/portal/directory` |
| `/portal/introductions` | retire | — |
| `/portal/solution` | merge | `/portal/company/listing` |
| `/portal/events` | merge | `/portal/events` |
| `/portal/programmes` | retire | — |
| `/portal/councils` | retire | — |
| `/portal/gba` | retire | — |
| `/portal/documents` | merge | `/portal/documents` |
| `/portal/billing` | merge | `/portal/billing` |
| `/portal/preferences` | retire | — |
| `/404` | retire | — |
| `/*` | retire | — |

Locale mapping: donor `/en/*` → hkwtia unprefixed; donor `/zh/*` → hkwtia `/zh/*` (`next-intl` `localePrefix: {mode: "as-needed", prefixes: {"zh-HK": "/zh"}}`). WP-7 turns every `merge` row above into a real redirect and flips `/partners` and `/programmes` from `retire` to `retain`.

## Appendix B — Message keys to add (namespace → keys; zh-HK copy taken verbatim from the donor)

- `Home`: `hero.{eyebrow,question,summary,findEvent,join,explore,note,discover}`, `openNow.{eyebrow,title,intro,emptyLabel,emptyTitle,emptyCopy,updates,challenge}`, `pathways.{eyebrow,title,intro}`, `pathways.{corporates,smes,startups,professionals,gba}.{title,copy,benefits,cta}`, `journey.{eyebrow,title,intro,before,during,after,emptyTitle,viewAll}`, `market.{eyebrow,title,directory.*,marketplace.*}`, `outcomes.{eyebrow,title,intro,framework,emptyTitle,emptyCopy,cta}`, `ecosystem.{eyebrow,title,intro,selected,enter,items.*}`, `programmes.{eyebrow,title,intro,view,viewAll}`, `gba.{eyebrow,title,copy,explore,cohort}`, `impact.{eyebrow,title,intro,source,metrics.{pastEvents,partners,asaRegions}.{label,definition}}`, `archive.{eyebrow,title,intro,gallery,highlight}`, `network.{eyebrow,title,note,viewAll,tabs.{supporting,regional,media},showing}`, `conversion.{eyebrow,title,intro,membership.*,partnership.*}`.
- `Navigation`: `explore`, `viewOverview`, `search`, `feature.{eventsProgrammes,membershipEcosystem,impactInsights,aboutWtia}.{label,title,copy,cta}`, `mobile.{priority,utilities,exploreEcosystem}`.
- `Footer`: `tagline`, `legalLine`, `newsletter.{eyebrow,title,placeholder,submit,success,error}`, `columns.{explore,connect,membership,contact}`.
- `Events`: `quickTabs.{open,past}`, `views.{cards,calendar}`, `results.count`, `strip.*`, `empty.{open,filtered}.*`, `host.*`, `interest.*`.
- `Showcase`: `prompts.*`, `needs.*`, `badges.{eyebrow,title,intro,items.*}`, `pathways.{buyer,provider}.*`.
- `Membership`: `pathways.sme.*`, `dimensions.*`, `first90.*`, `pricingNote.*`.
- `Contact`: `routes.*`, `topics.*`, `prepared.*`.
- `Partners` (new namespace, WP-7): `hero.*`, `sourceNote.*`, `categories.*`, `record.{status,relationship,activity,unconfirmed}`, `update.*`.
- `Programmes` (new namespace, WP-7): `hero.*`, `groupings.*`, `open.*`, `history.*`.
- `Concierge`: `prompts.{home,membership,showcase,events}.{0,1}`, `launcher` → "Ask WiseTech / 問 WiseTech".
- `MemberLogin` (WP-6): per the PR6 plan.

## Appendix C — Kick-off prompt for Claude Code (paste as the first message)

```text
Read CLAUDE.md, AGENTS.md, then docs/superpowers/plans/2026-09-01-wisetech-design-fidelity.md in full.
The donor design is checked out read-only at ../wisetech (commit f91ecc5). Start WP-0, then WP-1.
Work test-first: write each RED test listed in the WP, run it, read the failure, then implement.
Do not touch auth, billing, webhooks, CSP, or schema. Stop and ask before any manifest amendment
outside WP-7, any migration, or any production action. At the end of each WP run the §7 commands
and open one PR with the command log, exit codes and focused-test totals in the description.
```

---

## Appendix D — Errata and implementation notes (verified 2026-09-02 against `main` `ff07693`)

The body of this file is the v1 spec exactly as delivered on 2026-09-01. WP-0 committed it unchanged, apart from one Markdown escape in the §1.1 table (`open\|past`, so that row renders), and records here the facts that differed when the spec was checked against the repository before the first edit. Where this appendix and the body disagree, later work packages follow the appendix. Rows E-13 onward were added by WP-2 on branch `feat/wt-wp2-shell` and verified between 2026-09-02 and 2026-09-03 against the commits each row names: E-13 to E-29 are the deviations the WP-2 plan anticipated, and E-30 to E-59 the facts that surfaced while executing it.

| # | Spec location | Spec says | Verified state | Action for later WPs |
|---|---|---|---|---|
| E-1 | §0.1 (6), §0.2 | Clone the donor from GitHub into `../wisetech` | Donor commit `f91ecc5` (tree `d13a99e6`, 138 files, 79 partner records, line counts 1072 / 1222 / 533 / 1162 as stated) is already in this repository's object store on branch `codex/wisetech-pr6-publication`, checked out under `.worktrees/wisetech-pr6-wisetech-publication`. | Produce the read-only sibling without a network clone: `git archive f91ecc5 \| tar -x -C ../wisetech`. §0.1's rule stands: never import, copy or merge that tree into `main`. |
| E-2 | §1.3, WP-8, §8 | `LEGACY_UNSUBSCRIBE_SECRET_SUNSET = "2026-09-06"` | The constant has been `"2026-09-10"` on `main` since `323d02d`, the reconcile commit that carried Phase A of `docs/superpowers/plans/2026-09-01-unsubscribe-secret-sunset.md` over from `release`. `CLAUDE.md` was corrected in WP-0. | Read every `2026-09-06` in this file as `2026-09-10`. Phase B (removing the `cronSecret` fallback) must not run before that date. |
| E-3 | §4.4, WP-4 | `listPublicEvents`, `getPublicEventBySlug`, `localizeEvent` in `lib/events/public.ts` | Those three are exported from `lib/db/repos/events.ts`. `lib/events/public.ts` exports `parsePublicEventStatus`, `eventBoundary` and the `PublicEventProjection` type. | Import the readers from the repository module; leave the page-level helpers where they are. |
| E-4 | §4.4, WP-4 | `components/showcase/*`, `components/programs/*`, `components/contact/*`, `app/[locale]/(public)/not-found.tsx` | `showcase-filters`, `request-intro-form`, `showcase-card`, `showcase-detail`, `program-editions`, `program-credential` and `contact-concierge-launcher` all live in `components/marketing/`. The not-found page is `app/[locale]/not-found.tsx`. | Restyle in place; do not move files to match the spec's paths. |
| E-5 | Appendix A note | `docs/integration/wisetech-route-parity.md` says "merge 45" | Confirmed from the manifest module: 133 entries (route 116, CTA 5, form 3, locale 1, asset 8); sitemap dispositions `retain` 11, `redirect` 1, `merge` 51, `retire` 4. The doc's line 158 is the stale figure. | Correct the doc in the WP-7 commit that adds the redirects, as the body already instructs. |
| E-6 | WP-0 | Baselines "under `tests/e2e/__screenshots__/`" | Playwright places snapshots by `snapshotPathTemplate`, which WP-0 sets to `{testDir}/__screenshots__/{arg}-{platform}{-projectName}{ext}`. `.github/workflows/ci.yml` runs no Playwright job and rendering differs across operating systems, so the platform and project are part of each file name and the spec skips on any platform without committed baselines (CI included) unless `WISETECH_VISUAL_BASELINE=1` is set. The Next dev indicator is hidden before capture because it is not part of the design and changes state while `next dev` compiles. The spec also skips whenever `PLAYWRIGHT_BASE_URL` is set, because the baselines are empty-database renders of the managed dev server and a Preview or production target has nothing valid to compare against; the platform probe accepts a baseline from any Playwright project, so adding a second browser project fails loudly on missing baselines instead of skipping. | Capture and compare on the same platform. Regenerate only at the end of a WP, as WP-1 instructs, prefer `--update-snapshots=changed` so untouched routes produce no new blobs, and commit the new baselines in that WP's PR. Visual baselines are a local drift check, not release evidence: WP-8's Preview run skips them by design. |
| E-7 | §0.2 | "Public pages run with only `NEXT_PUBLIC_SITE_URL`" | True. The managed Playwright server additionally maps `DATABASE_URL` to `DATABASE_URL_TEST` (`tests/fixtures/m2-runtime-env.ts`), so a worktree without `.env.local` renders every data-backed section in its honest empty state. | The "before" baselines are the empty-state renders. That is deliberate: drift then measures presentation, not data. |
| E-8 | §0.2 | `npm run typecheck && npm run lint && … must be green before the first edit` | True for committed `main`. The primary (non-worktree) checkout carries untracked scratch directories at the repo root that `tsc` and `eslint .` walk, so the gate is red there for environmental reasons only. | Run every WP from a clean `.worktrees/<branch>` checkout with `node_modules` junctioned from the primary checkout (the repository's existing convention; `--webpack` exists for it). |
| E-9 | WP-1 | `@import "./styles/wisetech.css"` in `app/globals.css` after the Tailwind directives | css-loader emits an imported stylesheet ahead of the importing file's own rules (`next/dist/build/webpack/loaders/css-loader/src/utils.js`, `runtime/api.js` `i()`), so that placement would put the donor rules before the Tailwind layers. The port is imported from `app/[locale]/(public)/layout.tsx` instead: Next emits nested-layout CSS after the root layout's, which keeps the after-Tailwind order (verified in the built segment manifest: public pages link the globals chunk then the port chunk; admin, join and error segments link globals only). Scoping to the public group also keeps the donor's element-level rules (body line-height, coral `:focus-visible`, `[id] { scroll-margin-top }`) and 20 KB gzip of CSS off admin, portal and join, which WP-1 must not change. | Keep the import in the public layout; never add an `@import` to `globals.css`. WP-6 decides whether the app shell adopts any donor rule, and records it here if so. |
| E-10 | §4.1, §4.3, WP-1 | Token table ends at `--sans`; keyframes `hero-breathe`, `node-pulse`, `pulse-ring` | The donor's later `:root` passes add `--accent-text`, `--reading-width`, `--heading-display`, `--heading-section` and `--heading-card`; they are ported as `--wt-*` with the same values, and the donor's two media-scoped `:root` heading overrides at 520px stay in the port under the prefixed names. Three donor-local custom properties (`--accent`, `--mobile-menu-pad`, `--event-photo`) are also prefixed: unprefixed, `--accent` would have resolved against shadcn's `--accent` triplet. `--accent-foreground` is retuned to the ink because the amber `--accent` at 1.4:1 against white is a latent shadcn hover trap. Tailwind `screens` use `{max: …}` because the donor breakpoints are max-width. The donor has no `pulse-ring` keyframe (the ring is static); its keyframes are `hero-breathe`, `node-pulse` and `mega-menu-in`. The donor never styles `.first-90` (a marker class only), and the whole `.join-` family is dropped because the design's join form is not ported. Two donor background images (`/archive/asia-smart-shanghai.webp`, `/editorial/events-community.webp`) are absent from `public/` and pinned as known debt by `tests/unit/wisetech-css-port.test.ts`. `text-rendering` and `-webkit-font-smoothing` from the donor's body rule live in `globals.css`. | Use the `--wt-*` names; set `--wt-event-photo` (not `--event-photo`) inline when WP-4 ports the event hero; supply the two photos through WP-5 rights review before any page uses `.gba-section` or `.event-detail-hero`; write `wt-md:` utilities as "at or below 820px". |
| E-11 | §4.2, WP-1 | Fourteen files under `components/wt/`; port script kept in the scratchpad | Sixteen: `action-link.tsx` renders the donor's `<a className="button …">label <Arrow /></a>` pattern shared by the hero, closing band, honest state and card grid, and `types.ts` holds the shared `WtAction`, `WtCard`, `WtServiceCard` and `WtStep` shapes. The API uses `variant` for "which donor block" everywhere and `tone` only on `Section`; link lists are always `readonly WtAction[]` (first rendered as the button, the rest as text links); `InterestBand.action` is the one open `ReactNode` slot (D-6 Concierge launcher). `Button` resolves `size` to `wt` automatically for the `wt*` variants because `.text-link` declares no padding. The primitives are styled only inside the public route group, where the port is imported (E-9); a member or admin page that used them would render unstyled. The generator is committed as `scripts/port-wisetech-css.mjs` with `npm run port:wisetech`, which reproduces `app/styles/wisetech.css` byte for byte from commit `f91ecc5` (or `WISETECH_DONOR_DIR`); `npm run port:wisetech && git diff --exit-code app/styles/wisetech.css` is the drift check. The breadcrumb stays the donor's `div.breadcrumb`; promoting it to a `nav` landmark needs a message key and a landmark-contract check, deferred to WP-4. | Use `ActionLink` for donor-styled links and `Button variant="wt…"` only for real buttons. Regenerate the port through the script, never by hand. Keep `components/wt` usage inside `(public)` until WP-6 records otherwise. |
| E-12 | §4.1 | `--cyan` maps to `--shell-blue: 201 75% 41%` and `--secondary` | The WP-1 axe run of the public matrix reported 16 colour-contrast violations: hkwtia's header triggers and eyebrow labels render `--shell-blue` as small text on white and near-white, where `201 75% 41%` (#1a80b6) is 4.36:1 and 4.0:1. The donor only uses its cyan on ink. `--shell-blue` and `--secondary` are therefore `201 75% 37%` (#1873a5, 5.2:1 on white, 4.7:1 on #f5f5f5); `--wt-cyan` keeps the donor hex for donor patterns. The other retuned triplets are integer-rounded HSL conversions, one channel unit off the donor hexes (for example `0 0% 96%` renders #f5f5f5 against `--wt-paper` #f6f6f6), so the two token families are not interchangeable. `--shell-warm` (38 43% 95%) was left as it was, so the footer and mega-menu aside keep a warm panel until WP-2 decides. | Do not restore 41%; if WP-2 needs the exact cyan as text, place it on ink or use it at 18px+ bold. Use the `--shell-*` HSL triplets when a Tailwind alpha modifier is needed: `colors.wt.*` are bare `var()` references and silently drop `/50`. |
| E-13 | WP-2, §8 risk row | The public layout passes `variant` from a pathname map | An App Router layout has no pathname, and the only server-side source — a path forwarded from `proxy.ts` and read with `headers()` — opts the whole `(public)` group out of static and ISR rendering, which `/ai-ops` (`revalidate = 300`) and twelve page-copy routes depend on. Applying the variant from an effect is worse than that: `solid` is `position: sticky` and in flow while `overlay` is `position: absolute` and out of it, so every load of `/` would shift its content up by the header's height after hydration, against §6's CLS < 0.05. The `<header>` is therefore a client component, `components/layout/header-shell.tsx`, which resolves `data-variant` through `lib/public-shell/hero-variant.ts` **during the server render** and owns the `.scrolled` listener. `usePathname` is safe in a statically rendered route: it is `useContext(PathnameContext)` (`next/dist/client/components/navigation.js:125`), the provider is rendered by AppRouter on the server (`app-router.js:435`), and the dynamic-params bail applies only to prerender-client and prerender-ppr with fallback params (`server/app-render/dynamic-rendering.js:524-583`) — `components/layout/desktop-mega-navigation.tsx:30` already calls it on every static public route. **Execution-time extension:** `components/ai/concierge-widget.tsx` is the third client component reading the route on every public page, and it imports `usePathname` from `next/navigation` rather than `@/i18n/navigation` — a deliberate narrow exception, because the untouched `tests/unit/concierge-widget.test.tsx` supplies no locale context and the raw pathname keeps the `/zh` prefix that `resolveConciergePromptSection` strips itself. `tests/unit/locale-href-boundary.test.ts` polices hrefs, not hook provenance, so the exception is recorded here rather than enforced. Checked on the built tree in Task 8: `.next/prerender-manifest.json` lists ISR for `/en/ai-ops` and `/zh-HK/ai-ops` only (300 s), and the twelve page-copy patterns stayed static | Extend `heroVariantByRoute` as WP-3 and WP-4 give pages their donor heroes. Do not introduce `headers()` in the public layout, and do not move the variant back into an effect. Any further client component that reads the route on a public page belongs in this row, with the same static-rendering check on the built manifest |
| E-14 | §2.9, WP-2 | Port the donor shell verbatim | The donor drops below hkwtia's 44 px tap floor at its smallest breakpoints: `.mobile-trigger` 42 px (≤520), `.search-link` 38 px, `.button-small` 42 px. **Execution-time extension:** three further floors, one of them at a breakpoint the plan did not predict. The sign-in floor is scoped to `@media (min-width: 1451px)`, not 1241: the port hides `.signin-link` in three bands — `app/styles/wisetech.css:1087` at ≤1240, `:288` at ≤1320 and `:833-839` at 1121–1450 — all specificity 0,1,0, so a floor starting at 1241 px would win over two of them and un-hide the link from 1241 px to 1450 px, including the 1440 px baseline viewport. `.language-link` needs `min-width: 44px` because the port's `.language-link { min-width: 32px }` (`:70`) is a plain declaration that lands after the Tailwind layers and beats the button's `min-w-11` at runtime. The brand anchor's floor comes from its 108 px logo tile, because the port's `.brand { min-width: 0 }` overrides `min-w-11` regardless of tailwind-merge. The newsletter submit button met 44 px only incidentally, through the port's `input { min-height: 60px }`, until the Task 6 fix round made it explicit | `app/styles/wisetech-shell.css` restores 44 px on all of them. Keep the floor over donor fidelity in every later WP, and never rely on a Tailwind utility for a floor the port also declares on the same element: the port is imported after the Tailwind layers and wins, so the floor belongs in the companion sheet, which is imported after the port |
| E-15 | WP-2 header bullet | Header actions: search, language, Member sign in, Join WiseTech, mobile trigger | hkwtia's second header row and its "Find an event" button are removed to match the donor's single `.header-inner`. The call to action survives on the event-first navigation trigger and in `.mobile-priority-actions` | `tests/unit/public-shell.test.tsx` asserts "Join WiseTech" in the header instead |
| E-16 | Errata E-11 | Use `ActionLink` for donor-styled links | The donor's header Join button carries no arrow, while `ActionLink` always appends one. The header uses a plain `Link` with `className="button button-small"` | One-off; every other donor-styled link keeps `ActionLink` |
| E-17 | WP-2 mega-menu bullet | Keep the 180 ms hover-close timer | No timer exists to keep: a repository-wide grep for `delayDuration`, `skipDelayDuration`, `180ms` and `180 ms` returns nothing, and every hover, roving-arrow, `ArrowDown`, `Escape` and outside-pointer behaviour is a Radix default already pinned by `tests/e2e/public-shell.spec.ts` | Do not add a timer; if hover intent ever needs tuning, change `delayDuration` on the Radix root and extend the e2e |
| E-18 | WP-2 Concierge bullet | Restyle the panel header, prompt list, answer and transparency-link classes | The donor panel is a popover anchored inside `.concierge` (`position: absolute; bottom: 66px`, `app/styles/wisetech.css:286`); hkwtia's is a Radix modal portalled to `<body>` whose geometry `tests/e2e/concierge.spec.ts` pins at 1280×900 and 375×812. `.concierge-panel` would move it to the document's bottom-right, and its ink background would need the transcript, composer, inputs and feedback control restyled for dark. WP-2 ships the `.concierge-trigger` launcher, the prompt list and the transparency link in hkwtia's own panel chrome. **Execution-time extension:** because the skin is deferred, `.concierge-trigger` is not a stable e2e handle either, and checklist row 2.7's "panel classes" wording is struck rather than marked done | WP-6 decides the panel skin with the app-shell chrome, and restores row 2.7's struck clause when it does |
| E-19 | WP-2 mobile bullet | First five links per group, last styled `.mobile-view-all` | hkwtia's groups carry no "View All" leaf, so the five leaves are followed by the group landing route as the view-all. The events group has six leaves, so `/programs/cpai` is reached from the desktop mega menu and the footer rather than the mobile accordion. **Execution-time extension:** the rendered list is therefore six links per group, not five — the five leaves plus the appended landing; `tests/unit/mobile-navigation.test.tsx` pins the count at 6 | Revisit if the mobile menu gains a per-group overflow |
| E-20 | §4.4 Footer row, WP-3 `config/site.ts` | `phone: "+852 2989 9164"` — verify against hkwtia.org before the PR | Not verifiable on 2026-09-02: hkwtia.org answers with a bot challenge, which must not be bypassed, and neither message bundle carries a phone number. `siteConfig.contact.phone` is optional and unset; the footer renders no `tel:` line. **Execution-time extension:** the number is not absent from the site. `app/[locale]/(public)/contact/page.tsx:55` still publishes `tel:+85229899164` as "+852 2989 9164", pinned by `tests/unit/contact-concierge-launcher.test.tsx:31`, so the two surfaces now disagree — the footer withholds a number the contact page prints | **Owner action:** confirm the number and set `siteConfig.contact.phone`, or remove it from the contact page; either way the page and its test change in one WP-3 commit, so the site never disagrees with itself. WP-3's structured data must treat `telephone` as optional |
| E-21 | Appendix B `Footer.columns` | `columns.{explore,connect,membership,contact}` | Three of the donor's five Connect links do have canonical destinations (`members`/`solutions` → `/showcase`, `gba` → `/launchpad`, `partner-with-us` → `/contact`; only `/partners` retires, per `config/wisetech-integration-manifest.ts`), so the column is not donor-only. It is unusable for a different reason: reusing it would either duplicate `/contact` across two columns, breaking the every-leaf-appears-once property, or leave hkwtia's five About leaves (`/about`, `/about/history`, `/about/chairman`, `/about/committees`, plus the contact leaf) with no column at all. The keys are therefore `Footer.columns.{explore,membership,about,contact}`, and all 16 navigation leaves appear exactly once. **Execution-time extension:** that property is pinned by `tests/unit/public-shell.test.tsx:119-130`, which requires every leaf href in the footer, and `:132-148`, whose 20-entry target set must equal the number of matching links — not by the `:88` the plan cited. The shipped rationale is the comment at `components/layout/site-footer.tsx:45-53`; the WP-2 task plan's Task 6 Step 6 code block still carries a superseded "entirely donor-only" version of it and is not the authority | WP-7 may reintroduce a Connect column when `/partners` is un-retired and the showcase/launchpad links have somewhere of their own to live |
| E-22 | §5 WP-2 footer bullet | `footer-bottom` = tagline + Privacy + language link | Two differences. The donor's footer language link drops the reader at the site root; hkwtia keeps the shared `LocaleSwitcher`, which preserves path, query and fragment and is pinned by `tests/e2e/public-shell.spec.ts`. And the donor's bottom row carries no copyright at all, while hkwtia's `Footer.copyright` is a real legal notice — it is kept as a `<small>` in the same row, and only the three keys the rewrite genuinely orphans (`Footer.journeys`, `Footer.connect`, `Footer.legal`) are deleted alongside `Footer.address` | Keep both |
| E-23 | WP-2 Concierge bullet | Prompts "sent through the existing action" | The donor sends immediately. hkwtia's `submit` is the only path that runs the contact-email and Turnstile gates, so a prompt fills the composer and focuses it; the send still goes through the existing action. **Execution-time extension:** the prompt section is resolved during render from `usePathname()`, not from a mount effect — the widget lives in the public layout, which outlives every soft navigation, so the effect left the section stale after the first in-app link. The chips disappear on the optimistic append inside `sendTurn`, before `fetch` resolves, where the donor renders them alongside the answer. The launcher's `hover:bg-primary/90` was dropped because the port declares no `.concierge-trigger:hover` and the pill is deliberately static | Revisit only with a test that proves both gates still run. `aria-controls` on the launcher dangles while the panel is closed (pre-existing; the portal is not `forceMount`) — a follow-up outside WP-2 |
| E-24 | WP-1 errata E-11, WP-2 | The port is the only donor stylesheet | `scripts/port-wisetech-css.mjs` reproduces `app/styles/wisetech.css` byte for byte, so shell rules hkwtia needs and the donor lacks live in a new hand-written `app/styles/wisetech-shell.css`, imported from the public layout immediately after the port. **Execution-time extension:** the companion carries structural rules as well as colour and sizing. `.footer-newsletter form[hidden] { display: none }` is load-bearing, because the port's author-origin `.footer-newsletter form { display: flex }` beats the UA sheet's `[hidden]` rule — and jsdom cannot detect its removal, since it applies no port CSS at all, so only a browser test would catch that regression. `.newsletter-error:empty { margin-top: 0 }` keeps a permanently mounted, empty live region from leaving a gap without taking it out of the accessibility tree. The switcher's `outline-offset: 2px` diverges from the port's global 4px deliberately, for the rounded button | Add shell overrides there, never to the generated file; `npm run port:wisetech && git diff --exit-code app/styles/wisetech.css` stays the drift check. Treat the companion's structural rules as load-bearing: they are invisible to the unit suite |
| E-25 | §4.2 breakpoints | Breakpoints 1320 / 1120 / 820 / 520 | The donor's final pass collapses the desktop navigation at `max-width: 1240px` (`app/styles/wisetech.css:1085-1089`), later and wider than its own 1120 px rule, so 1240 governs. Four e2e tests that used 1120 as a desktop width moved to 1360, and the width sweep's branch moved from 1024 to 1240. **Execution-time extension:** `/` is the only overlay route, so `header[data-variant="solid"]` matches nothing there; `tests/e2e/public-route-matrix.spec.ts` used it as a locator and had silently stopped running the sticky-header clearance assertion below it since Task 3. Locate `header.site-header` and assert the state under test (`.scrolled`) | Use 1360 for any new desktop-navigation browser test. The locator trap widens as WP-3 and WP-4 extend `heroVariantByRoute`: never key a locator on the variant a route happens to have |
| E-26 | WP-2 exit line, Appendix B | Baselines at 1440 / 1120 / 820 / 520; `Navigation.brand.operator`, `Footer.address` | The WP-0 harness captures 1440 / 1120 / 820 / 390, and 390 is inside the donor's ≤520 band. D-10 replaces `brand.operator` with `brand.descriptor` in both namespaces; `Footer.address` becomes the bilingual array `Footer.addressLines`; one `Navigation.search` string covers the donor's two ("Search WiseTech" as both the icon's label and the mobile link's text); `Navigation.logoAlt` keeps hkwtia's "WTIA" rather than the donor's sentence-long alt. **Execution-time extension:** the newsletter ships nine keys, not Appendix B's six — `Footer.newsletter.{emailLabel,mailSubject,mailBody}` join `{eyebrow,title,placeholder,submit,success,error}` | Later WPs read `Footer.addressLines` and `siteConfig.contact.addressLines`, never `Footer.address` |
| E-27 | WP-2 mega-menu bullet | Feature copy from the donor's closest group | The donor's `events-activities` feature title is "No activities are currently open." — its own honest empty state for a site with no event data. Printed as static navigation copy over hkwtia's real `events` table it would be a fabricated claim (§0.3), so the events feature copy is authored; the membership, insights and about features reuse the donor's text where it is true without data | Keep feature copy free of counts, dates and availability claims (D-8) |
| E-28 | Appendix B `Concierge` | `prompts.{home,membership,showcase,events}.{0,1}` | The keys ship as JSON arrays rather than objects with `"0"` and `"1"` members. `tests/unit/messages.test.ts:19` treats an array as a single leaf, so parity still holds, and `:10` skips arrays when collecting ICU entries, so the pairs are never handed to `createTranslator`. `next-intl`'s `t.raw` returns the array unchanged, which is what `localizeConciergePrompts` validates | Read prompt pairs through `t.raw`, never `t`; keep each pair at exactly two entries so the panel's layout is predictable |
| E-29 | §4.4 SearchPage row | Header search icon links to `/showcase` "with focus on `q`" | There is no fragment to target: `components/marketing/showcase-filters.tsx:13` renders the search input with `name="q"` and no `id`, so `/showcase#q` would resolve to nothing and the port's `[id] { scroll-margin-top }` rule would have no anchor. WP-2 links to `/showcase` plain | WP-4 owns `showcase-filters.tsx`; give the input an `id` and add the fragment there, in the same commit as the test that proves focus lands on it |
| E-30 | §2.9, WP-2 Task 3 (`4ade247`) | Port the donor brand lockup verbatim | The donor fades the brand descriptor: `.brand-copy small { opacity: .68 }` at 7 px (`app/styles/wisetech.css:60`), grown to 9 px at `:631` and `:758`. Against the ink the descriptor inherits, that fade computes to #5c85a9 on the solid and scrolled header white and #5a81a3 on the footer warm — 3.9:1 and 3.75:1 against the 4.5:1 AA threshold — and the lockup sits in both the header and the footer, so axe reported it on every public page (17 findings on `2f1473b`, reproduced with that commit's changes stashed at `2c48ada`). The companion sets `.brand-copy small { opacity: 1 }` and nothing else: the inherited ink is already 8.9:1 on the solid and scrolled header and 8.1:1 on the footer, and white on the overlay header and inside the mobile menu. Donor size and tracking are untouched, because axe scores contrast, not size | Restoring the fade re-breaks every public page. If a later WP wants the faded look back, it needs a colour with a measured ratio, not an opacity |
| E-31 | WP-2 Task 5 (`10ef644` → `b261edb`) | The mobile accordion trigger marks the current group | Tailwind emits the trigger's `data-[current=true]:text-shell-blue` as `.data-\[current\=true\]\:text-shell-blue[data-current="true"]`, specificity 0,2,0, which outranks the companion's white at 0,1,2. The current trigger therefore rendered `--shell-blue` #1874a5 at 2.17:1 on the panel's `#0a3d67`: a WCAG 1.4.3 failure on every route inside a non-event group, since `.event-first` at 0,2,2 shielded the events group only. The companion sets the donor accent `#8fc4e0` on `[data-current="true"]`, measured 5.94:1 to 7.39:1 across the gradient, and `tests/e2e/accessibility.spec.ts` now opens the mobile menu on a non-event route at 375 px so the state is scored at all. The trigger's inert `text-base font-semibold py-3 min-h-12` utilities went in the same commit — the donor heading renders at weight 400 — so the height floor now belongs to the consumer, `mobile-navigation.tsx` being the accordion primitive's only importer. No `disableRules` entry | Check a Tailwind state utility's specificity against the companion, not only its colour. A trimmed primitive leaves its floors to consumers; the comment in `components/ui/accordion.tsx` says so |
| E-32 | §5 WP-2 footer bullet, Task 6 (`2e1341a` → `3642e45`) | The plan's `.footer-bottom` rule: small print at `rgba(255,255,255,0.5)` and 9 px | The donor's dark footer fades its own small print past AA on `#363839`: `.footer-brand > small` at alpha .42 measures 3.48:1 and the privacy link (`.footer-bottom a`, alpha .5) 4.28:1, both serious on every public page because the footer is in the public layout — and hkwtia's two additions to that row, the copyright `<small>` and the `LocaleSwitcher` button, inherit the problem. axe was red on 18 of 19 public pages as the plan wrote it. The companion sets all four to alpha .63, which is not an invented number: it is the alpha the port already gives `.footer-links a` and `.footer-links address` in the same footer. axe printed 5.74:1 and passed 19 of 19; an independent recomputation of the same blend gives 5.76:1. Size too — the plan copied the port's base 9 px, but `wisetech.css:636` later promotes `.footer-bottom a` to 11 px, so the language button and the copyright are set to 11 px to match the sibling they sit beside | With E-30 and E-31 this is the third and last sanctioned colour correction over the port. All three live in `app/styles/wisetech-shell.css` with their measured pairs and none disables an axe rule. Read the port's later passes before copying a base declaration out of it |
| E-33 | §2.9, WP-2 Tasks 5 and 6 (`3642e45`) | Reuse the shared `LocaleSwitcher` inside the donor chrome | The switcher is a light-theme component: `hover:bg-muted` (near white) and `focus-visible:ring-ring` (#1a5184) are right in the header and wrong on the two dark hosts WP-2 gave it, `.mobile-utilities` and `.footer-bottom`. The focus ring measured 1.43:1 against the footer's `#363839` and 1.36:1 against the mobile panel's `#0a3d67`, far under the 3:1 WCAG 1.4.11 asks of an indicator, and hover put white text on a near-white ground. axe scores default states only and reported none of it. The companion adds hover and focus rules at specificity 0,2,1: the blended hover ground is `rgb(78,80,81)` on the footer and `rgb(39,84,121)` on the lighter gradient stop, giving white text 8.12:1 and 7.95:1, and the restored `--wt-focus` #ff5c4d outline scores 3.87:1 on the footer and 3.67:1 / 4.57:1 on the two gradient stops | **Rule:** every new dark host of a shared light-theme component needs companion hover and focus rules with measured ratios. axe cannot catch the omission, so this is a review item, not a test |
| E-34 | §6 accessibility criterion | axe: 0 serious or critical on the public matrix | axe-core cannot score `color-contrast` for any text inside `.mobile-menu`: the donor gradient background files every node under `results.incomplete` with messageKey `bgGradient`, which `expectNoSeriousOrCritical` ignores, so an axe-only assertion for that dialog is vacuous. `tests/e2e/accessibility.spec.ts` now computes the current trigger's ratio itself against every declared gradient stop (worst stop decides; precondition `data-current="true"`; non-empty stops) and still runs axe for what axe can score: RED 2.17:1 on `10ef644`, GREEN 5.94:1 after `b261edb`. Two limits are stated in the comment rather than fixed — the parser treats any alpha channel as unmeasurable and flags both the `rgba()` and the `rgb(r g b / p%)` forms, and the worst-declared-stop shortcut is sound only while the foreground luminance lies outside the stops' range (white on two dark stops), so a lighter middle stop is not covered. The rest of the dialog was measured in review and is not e2e-guarded: eyebrow 4.63:1 to 5.37:1, utilities 6.60:1 to 7.89:1, panel links 7.16:1 to 8.63:1, join action 8.06:1 to 9.80:1, event action 7.39:1, brand 11.19:1 | Any later donor surface with a gradient or image background needs the same pairing: axe for what it scores, a computed-ratio assertion for what it files as incomplete. Re-measure the listed values when WP-4 or WP-6 changes the panel |
| E-35 | §6 accessibility criterion | axe on the open mobile dialog | With the dialog open axe also files `aria-hidden-focus` under `incomplete`, reason `focusable-modal-open`: it sees a modal and asks for a manual check that the hidden content is not tabbable. Radix's `FocusScope trapped` guarantees exactly that, so it is not a violation and nothing was changed | Do not "fix" this incomplete result. If the dialog ever stops trapping focus it becomes a real violation, and the trap is the thing to restore |
| E-36 | WP-2 mega-menu bullet, §6 keyboard contract | `ArrowDown` opens the mega menu | It does not: Radix's `NavigationMenuTrigger` guards `ArrowDown` behind `open &&` (`node_modules/@radix-ui/react-navigation-menu/dist/index.mjs:338-344`), so it is an entry key only, and `Enter` or `Space` opens a closed trigger. `Tab` from an open trigger now moves to the next trigger rather than into the panel, because the focus proxy is out of the tab order (E-37); `ArrowDown` enters the panel, matching the donor. The e2e traversal step opens with `Enter`, asserts the panel, then uses `ArrowDown` | Write mega-menu keyboard tests as Enter-to-open then ArrowDown-to-enter. Do not add a timer or re-map the keys |
| E-37 | §6 accessibility criterion, WP-2 Task 4 (`2f1473b`) | axe reports `aria-hidden-focus` on the open mega menu | The offending node is Radix's own focus proxy: with a menu open it renders a `VisuallyHidden` element carrying `aria-hidden` and `tabIndex={0}` (`dist/index.mjs:348-356`). `components/ui/navigation-menu.tsx` sets `tabIndex=-1` on it through a MutationObserver scoped to the nav root, because the proxy remounts on every open. A live probe read the attribute back as `-1`, forcing it to `0` in the page was reverted within a tick, and axe on the open desktop menu reports the rule clean; the programmatic `ArrowDown` entry still works. Task 5's independent repro found the finding already gone, so its "passes as written: record and change nothing" branch applied | Re-check the observer whenever `@radix-ui/react-navigation-menu` is upgraded: it depends on the proxy's shape, not on a public API |
| E-38 | §4.2 mega menu, WP-2 Task 4 | The donor's `<section class="mega-menu-v2">` panel | The panel root is a `div` inside Radix's content wrapper, which carries the `id` and `aria-labelledby`, so the donor's region landmark is not reproduced. Columns carry `role="group"` with `aria-labelledby` pointing at the donor's `<p class="mega-column-title">` rather than at headings, because `.mega-column h2` in the port would restyle a heading element. Two navigation landmarks therefore exist on desktop — hkwtia's `.desktop-nav` element and Radix's own root `nav`, one of them unnamed; pre-existing and below axe's serious threshold | A later task may `asChild` the Radix root to collapse the two landmarks. Do not promote `.mega-column-title` to a heading without checking the port's type rules first |
| E-39 | WP-2 mobile bullet, Task 5 | Radix Dialog supplies `aria-modal` | `@radix-ui/react-dialog@1.1.19` never sets it: `dist/index.mjs:222` sets only `role="dialog"`, and modality comes from `hideOthers` (every other `<body>` child gets `aria-hidden="true"`), `trapFocus` and `RemoveScroll`. The mobile dialog therefore carries `role="dialog"` without `aria-modal`, unlike the donor's hand-rolled markup, and axe passes all 18 accessibility cases. Pre-existing — the Sheet was already a Radix Dialog — and unchanged. `SheetOverlay` does drop its tint and blur for `side="full"`, because the opaque `.mobile-menu` hides it | Do not hand-add `aria-modal` to work around it: the guarantee is the focus trap plus the hidden siblings, and asserting the attribute would pin an implementation detail Radix does not promise |
| E-40 | WP-2 mobile bullet, Task 5 | The donor's `.mobile-accordion > button` type rules style the trigger | `AccordionPrimitive.Header` renders an `<h3>`, so the donor's rules (`app/styles/wisetech.css:321-322` and `:1079-1080`) never reach the trigger. The companion restates them one level deeper at `.mobile-accordion > h3 > button`, and the element name is pinned by a unit test rather than forced with `!important` | Keep the two sets in step whenever the port is regenerated: the companion's copies are the only thing styling that trigger |
| E-41 | WP-2 Task 2 (`c90dd76` → `d154a18`) | The dismiss island adds `.no-announcement` to the header | It cannot. `HeaderShell` (Task 3) re-renders `header.site-header`'s `className` from its own React state on every scroll toggle, which would silently drop a class added by direct DOM mutation. Dismissal is stamped as `data-announcement-dismissed="true"` on `<html>` instead and moved through `:root[data-announcement-dismissed="true"] .site-header { top: 0 }` in the companion sheet — specificity 0,3,0, which beats both the port's base `.site-header { top: 42px }` (`app/styles/wisetech.css:51`) and its `@media(max-width:820px) .site-header:not(.scrolled) { top: 48px }` (`:845`), with no `!important` and no duplicated media query | Never add a class to an element a client component re-renders from state; stamp state a stylesheet can read instead |
| E-42 | WP-2 Task 2, §6 CLS row | The announcement bar sits above a header offset by its height | The port's above-820 px offset is a fixed `.site-header { top: 42px }` that assumes a one-line, `min-height: 42px` bar; it does not measure the bar. The companion therefore clamps `.announcement-text` to one line above 820 px, and stops at that breakpoint because below it the port applies its own two-line clamp and a 48 px offset (`wisetech.css:844-846`). Two behaviours follow from the island being client-only: a reader who already dismissed the bar sees it for one frame after a hard load and the header shifts 42 px, and dismissing it drops focus to `<body>` — the donor's own behaviour | **Owner decision:** the flash can only be removed by a blocking inline script that reads `sessionStorage` before paint, which is a spec-level call rather than an implementation choice. Moving focus to the first header control after dismissal is a separate, cheap refinement |
| E-43 | WP-2 Tasks 2 and 7 | Read `sessionStorage` or the pathname in a `useEffect` | `eslint-config-next` bundles `eslint-plugin-react-hooks@7`, whose `react-hooks/set-state-in-effect` is a hard error rather than a warning. `components/layout/announcement-dismiss.tsx` keeps a one-line scoped disable carrying its reason — reading a browser-only API during render would produce markup the server never emits — and Task 7's prompt effect carried the same one until its fix round replaced the effect with render-time resolution (E-23). A multi-line disable comment does not work: only the first line is the directive | Prefer resolving from a hook during render to disabling the rule. Where a disable is genuinely needed, keep it on one line with the reason on that line |
| E-44 | §4.2, WP-2 Task 7 | The donor positions the launcher with its `.concierge` wrapper | The whole `.concierge` wrapper family is dead in hkwtia: no element carries the class, so the fixed offsets at `app/styles/wisetech.css:286` and `:291`, the three `.site-root:has(.event-action-bar) .concierge` lifts at `:419`, `:445` and `:449`, and the `display: none` at `:860` never fire. The launcher is positioned by Tailwind `fixed bottom-[…]` utilities on the button itself | **WP-4:** the event action bar will overlap the launcher at every breakpoint unless WP-4 either wraps the launcher in `.concierge` or adds equivalent offsets to the companion sheet. Four donor rules are waiting for it |
| E-45 | §4.2 breakpoints, WP-2 Tasks 4 and 5 | The mobile trigger appears wherever the desktop navigation collapses | Between Task 4 and Task 5 it did not. Task 4 gave the port authority over `.desktop-nav`, which the port hides at ≤1240 px (`app/styles/wisetech.css:1085-1089`), while the trigger still carried Tailwind `lg:hidden` at 1024 px. The result was a navigation dead zone from 1025 px to 1240 px, and the two 1120 px e2e sweep cases were red across that window until Task 5 gave the trigger the donor `.mobile-trigger` class | **Rule:** never put a Tailwind breakpoint utility on an element the port already switches. The two systems use different breakpoints and the port, imported after the Tailwind layers, wins |
| E-46 | WP-2 Concierge bullet, Task 7 (`b3bb178`) | Restyle the launcher to the donor `.concierge-trigger` | The donor's `:focus-visible` outline does not survive: Tailwind's `focus-visible:outline-none` plus the two-band ring wins on specificity. Measured, the ring is adequate on its own — the blue band is 7.54:1 on the page, the white band 8.86:1 on the ink pill and 11.79:1 over the footer — so the indicator keeps at least 3:1 against both adjacent surfaces everywhere and no companion rule was added. The launcher's rect is identical at scrollY 0, 1952 and 2475 inside `.site-root { overflow: clip }`, so the clip does not disturb the fixed position | Re-measure if WP-6 restyles the pill (E-18): the figures are ring-against-pill and ring-against-page, and the skin changes both |
| E-47 | §5 WP-2 header bullet, WP-3 | The overlay header stays readable over the hero | Only until WP-3. The current `EditorialHero` scrim fades left to right, so the white search, language and sign-in controls at the right edge of `/` sit over its weakest part. The donor's own hero spans the scrim across the top, which closes the gap | **WP-3:** the donor hero fixes this by construction. If WP-3 keeps a left-to-right scrim, the overlay header needs a scrim of its own |
| E-48 | §3 D-6, WP-2 Task 6 | The footer newsletter is a prepared `mailto:` form | It degrades without JavaScript, but not completely: the form carries `action={mailto}` so a no-script GET opens a message addressed with the subject only — the body cannot carry the reader's address without script, and the island's `preventDefault` keeps that path unreached while JavaScript is live. The live regions are permanent rather than conditional: the status node is always mounted and takes the donor `.newsletter-success` class only on success, and the alert is keyed on an attempt counter, because a reset to idle is batched away by React and never re-announces. `tests/unit/public-shell.test.tsx`'s `next-intl/server` mock needed a `raw` member for `t.raw("addressLines")` and `t.raw("newsletter.mailBody")` | Keep the status node mounted: a live region that appears together with its message is announced unreliably. If a later WP wants the address in the no-script body, that needs a server route, not a longer `mailto:` |
| E-49 | §6 accessibility and journey criteria, WP-2 Task 8 (`f884b52`) | e2e locators name the control they mean | The public shell now mounts a permanent idle `role="status"` region (the footer newsletter) on every public route, and it repeats action names between shell and page: `Contact.conciergeLauncher` and `Concierge.launcher` have both read "Ask WiseTech" since Task 1, which is intentional — one name, one action. Three locators broke on that. `getByRole("status")` on `/membership` resolved to two nodes; `getByRole("link", {name: "Events"}).first()` in the mega-menu test resolved to the always-visible footer journey link outside the navigation landmark, so the `aria-current` expectation never looked inside the menu; and `/contact` raised a strict-mode violation on the duplicated launcher name. Scoping by the fixed launcher's presentational class was tried and rejected: it dropped the only browser test of the contact page's own wiring, and `.concierge-trigger` is not a stable handle while E-18 defers the skin | **Rule:** scope page-level `role="status"`, `role="alert"` and repeated shell action names by landmark — `main#main-content`, or the primary navigation — never by class. Demonstrated at two sites in `tests/e2e/wisetech-pr5-public-journeys.spec.ts` |
| E-50 | §0.2 test-first rule, WP-2 Task 8 (`f884b52`) | Write the RED test, read the failure, then implement | Two WP-2 assertions passed for the wrong reason, and both patterns generalise. A guard whose real inputs all sit on the happy path is satisfied vacuously: the translucency guard in `tests/e2e/accessibility.spec.ts` had silently failed to recognise the `rgb(r g b / p%)` alpha form, because every panel colour is opaque. The fix is a three-sample self-check evaluated in the page through the same helper, asserting both that it flags and that it clears. Separately, Testing Library's `rerender` bails out of re-rendering a subtree when handed a referentially identical element, so a soft-navigation test must build a fresh element per render; the Concierge staleness case failed for the wrong reason until that was corrected (comment in `tests/unit/concierge-shell.test.tsx`) | Any assertion that only hypothetical inputs can exercise carries its own failure samples. Any `rerender`-based test builds a new element each time |
| E-51 | §0.2, WP-2 Tasks 5 to 8 (`9ed0515`) | `PLAYWRIGHT_BASE_URL` stays unset so Playwright manages the dev server | Three harness facts the plan does not cover. `playwright.config.ts` derived `baseURL` as a fixed `http://localhost:3000` while `port` already honoured `PLAYWRIGHT_PORT`, so `PLAYWRIGHT_PORT=3100` started the managed server on 3100 and then pointed the tests at whatever answered on 3000 — during WP-2 that was an unrelated project on this machine — while setting `PLAYWRIGHT_BASE_URL` instead disables the managed server and skips the baseline spec. The default base URL is now derived from the port. Next 16 refuses a second dev server for the same directory, so a probe server on 3100 makes the managed server on 3000 fail with "Another next dev server is already running"; stop probe servers with `taskkill /PID <n> /T /F`, because the detached child survives a plain task stop. And `tests/e2e/concierge.spec.ts` needs `M4A_DETERMINISTIC_ACCEPTANCE=true`, `M4A_DETERMINISTIC_ACCEPTANCE_AUTHORIZED=true` and a loopback `APP_URL` matching the server origin on top of `buildM2RuntimeEnvironment`, or the widget answers 503 `AI_CONFIGURATION_UNAVAILABLE`; the fixture passes `process.env` through and maps `APP_URL`, so the three belong in the shell rather than in a fixture edit | Run the browser suite with `PLAYWRIGHT_PORT` alone when another project holds 3000; reserve `PLAYWRIGHT_BASE_URL` for a real external target, where skipping the baselines is correct (E-6) |
| E-52 | §7 command list, WP-2 Task 8 (`c984c08`, `293c5f5`) | The browser suite is green before WP-2 begins | Four route-matrix contracts were already broken or vacuous, not the two the plan expected. `tests/e2e/wisetech-pr3-public-pages.spec.ts:160` failed on all 8 cases because `#home-discover` already sits at viewport ratio 0.113 in a 600 px probe viewport, given the Task 2 to Task 6 hero and header geometry; `wisetech-pr5-public-journeys.spec.ts:102` hit a strict-mode violation on `/contact` from the duplicated "Ask WiseTech" name (E-49); the `header[data-variant="solid"]` locator matched nothing on `/` (E-25); and `getByRole("status")` on `/membership` resolved to two nodes (E-49). The discover-anchor proxy now uses ratio 0.3, measured on this tree: at rest 0.000 at 375 px, 0.062 at 768 px and 0.113 at 1440 px; after the anchor 0.447 at 375 px, 0.452 at 768 px and up to 1.000 at the wider widths — an empty band of 0.113 to 0.447 against a hard ceiling near 0.451, which is why the first repair's 0.4 left only 0.047 of headroom and was lowered in review. Task 7 also repaired that spec's launcher locator, which had been reading the retired "Ask WTIA" label since Task 1's rename with no task owning the fix | **WP-3** replaces the hero and moves both numbers: re-measure the discover ratio at 375, 768, 1024 and 1440 and reset the constant rather than nudge it |
| E-53 | WP-2 boundary rule | `tests/unit/wisetech-shell-boundary.test.ts` scans the six shell files; provenance comments name the donor file | Ten files, and no donor filename anywhere. The scan rejects the literal `WiseTechSite` even inside a comment, so every provenance comment in a scanned file cites `commit f91ecc5` plus line numbers instead; Tasks 2 and 3 adopted the form and Task 5's comments were rewritten to it. The list grew with the work: `announcement-bar.tsx` and `announcement-dismiss.tsx` (Task 2), `header-shell.tsx` (Task 3), `mega-menu-panel.tsx` (Task 4) and `footer-newsletter.tsx` (Task 6). The WP-2 task plan's "seven files" prose and its Task 3 file-table row are stale | Add every new shell file to the scan in the commit that creates it, and cite the donor by commit and line, never by filename |
| E-54 | §0.2, WP-2 §8 | The gate is green at every commit | This branch is not, by construction. `npx tsc --noEmit` and `npm run build` are red from Task 2's commit through Task 4's, because Task 3 leaves two call-site errors that Tasks 4 and 5 resolve; and the two 1120 px e2e sweep cases cannot pass between Task 4 and Task 5 (E-45), so the plan's Task 4 Step 8 expectation that "every test passes" was wrong. Visual baselines are stale from Task 6 onward, because the footer changed shape on every page; all 72 were recaptured once, in `e4a084b` | The branch must not be merged or deployed at an intermediate commit — only the tip is green. Regenerate baselines once at the end of a work package, as E-6 already instructs |
| E-55 | WP-2 task plan | Its own file lists, citations and test counts | Four corrections, none of which changes a decision. The chevron citation `f91ecc5:app/WiseTechSite.tsx:109` is wrong: the chevron is at `:409`. `tests/unit/desktop-mega-navigation.test.tsx` is absent from the plan's file list, yet Task 4 had to update it — five renders needed the new required props, and three assertions pinned the retired presentation (Tailwind widths, and text content the donor chevron changed). Task 7's Step 6 expects `tests/unit/concierge-widget.test.tsx` at "13 tests"; the untouched file holds 14, and its line 18 keeps the retired literal "Ask WTIA" in its own `ConciergeLabels` fixture, which is never compared with the bundles and is therefore harmless. Task 7 staged four files rather than three, because the `wisetech-pr3-public-pages.spec.ts` launcher repair had no other owner (E-52) | Read a plan's file list as a floor, not a ceiling, and re-derive donor line numbers with `git show f91ecc5:…` rather than trusting a citation |
| E-56 | §0.2 evidence rule | Commit bodies carry the RED and GREEN evidence | Two bodies on this branch are imperfect and could not be repaired. `2f1473b`'s body lost the words "behind `open`" to a shell backtick substitution, so its Radix sentence reads as though the citation were the guard. `9d333ec`'s body credits WP-2 with adding `components/ui/accordion.tsx`, which `git log --diff-filter=A` shows was added by `4336218`; WP-2 only modified it. Both amends were refused by a repository gate that treats `git commit --amend` as destructive, so the corrections live here instead | Compose multi-line commit bodies through a heredoc or a file, never through a double-quoted shell string, and read the result back with `git log -1 --format=%B` before moving on |
| E-57 | Appendix B `Navigation`, WP-2 Task 9 (`9da9dc9`) | `Navigation.groups.*.description` per group | Orphaned by Task 4. The donor's `.mega-menu-v2` has no description tile, so `LocalizedNavigationGroup.description`, `NavigationGroup.descriptionKey` and the four `Navigation.groups.*.description` messages lost their only consumer when the panel was rebuilt, and a grep across app, components, lib, tests and config finds no reader. All are removed, both bundles in parity, with a comment above `navigationGroups` recording why the field is absent. The `labels.description` that remains in `components/layout/mobile-navigation.tsx` is `Navigation.menuDescription`, the dialog's `SheetDescription`, and is unrelated | Re-adding a `description` key means re-adding a renderer for it. Neither `npm run audit:strings` nor `tests/unit/messages.test.ts` notices an unused key, so orphans have to be swept deliberately |
| E-58 | `CLAUDE.md` Conventions | `'use client'` only for interactive browser behaviour (25 files) | 40, counting every `.ts`/`.tsx` under app, components and lib whose first line is the directive. The count had already drifted before this branch; WP-2 added four — `announcement-dismiss.tsx`, `header-shell.tsx`, `mega-menu-panel.tsx` and `footer-newsletter.tsx`. `mega-menu-panel.tsx` carries the directive as a no-op, since it is only reachable from a client parent; it is a separate module so `tests/unit/public-shell.test.tsx` can render the panel without mounting Radix, which needs a `ResizeObserver` jsdom does not provide. Corrected in `9d333ec`, which is WP-2's only change to `CLAUDE.md` | Recount at the end of every work package that adds an island. A number that grows silently stops meaning anything |
| E-59 | Appendix D, WP-2 Task 9 | Errata numbers are allocated when the rows are written | Not on this branch. Code comments and commit prose written during Tasks 2 to 7 already cite E-13 to E-24, so the allocation was fixed before Appendix D was edited, and the rows above were written to match rather than the other way round. Every in-code citation was re-grepped after this row set and resolves to a row with matching content: `app/styles/wisetech-shell.css:53` to E-14, `components/ai/concierge-widget.tsx:626` to E-23, `components/layout/header-shell.tsx:34` to E-13, `components/layout/mobile-navigation.tsx:41` to E-19, `components/layout/site-footer.tsx:53` and `:145` to E-21 and E-22, `components/layout/site-header.tsx:21` and `:76` to E-15 and E-16, and `tests/unit/wisetech-css-port.test.ts:72` to E-24 | Cite an errata number in code only once the row exists, or allocate the number in the same commit. Where a citation and a row disagree, renumber the row: the comment is what a reader finds first |
