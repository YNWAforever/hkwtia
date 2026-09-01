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
| PR5 Public journeys | Event hero media, public event journeys (`?status=open|past`), localized news projections, partner wall, membership catalog, showcase presentation refresh, contact→Concierge | `drizzle/0023`, `lib/events/public.ts`, `lib/membership/public-catalog.ts`, `tests/e2e/wisetech-pr5-public-journeys.spec.ts` |
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

The body of this file is the v1 spec exactly as delivered on 2026-09-01. WP-0 committed it unchanged and records here the facts that differed when the spec was checked against the repository before the first edit. Where this appendix and the body disagree, later work packages follow the appendix.

| # | Spec location | Spec says | Verified state | Action for later WPs |
|---|---|---|---|---|
| E-1 | §0.1 (6), §0.2 | Clone the donor from GitHub into `../wisetech` | Donor commit `f91ecc5` (tree `d13a99e6`, 138 files, 79 partner records, line counts 1072 / 1222 / 533 / 1162 as stated) is already in this repository's object store on branch `codex/wisetech-pr6-publication`, checked out under `.worktrees/wisetech-pr6-wisetech-publication`. | Produce the read-only sibling without a network clone: `git archive f91ecc5 \| tar -x -C ../wisetech`. §0.1's rule stands: never import, copy or merge that tree into `main`. |
| E-2 | §1.3, WP-8, §8 | `LEGACY_UNSUBSCRIBE_SECRET_SUNSET = "2026-09-06"` | The constant has been `"2026-09-10"` since commit `323d02d` (Phase A of `docs/superpowers/plans/2026-09-01-unsubscribe-secret-sunset.md`). `CLAUDE.md` was corrected in WP-0. | Read every `2026-09-06` in this file as `2026-09-10`. Phase B (removing the `cronSecret` fallback) must not run before that date. |
| E-3 | §4.4, WP-4 | `listPublicEvents`, `getPublicEventBySlug`, `localizeEvent` in `lib/events/public.ts` | Those three are exported from `lib/db/repos/events.ts`. `lib/events/public.ts` exports `parsePublicEventStatus`, `eventBoundary` and the `PublicEventProjection` type. | Import the readers from the repository module; leave the page-level helpers where they are. |
| E-4 | §4.4, WP-4 | `components/showcase/*`, `components/programs/*`, `components/contact/*`, `app/[locale]/(public)/not-found.tsx` | `showcase-filters`, `request-intro-form`, `showcase-card`, `showcase-detail`, `program-editions`, `program-credential` and `contact-concierge-launcher` all live in `components/marketing/`. The not-found page is `app/[locale]/not-found.tsx`. | Restyle in place; do not move files to match the spec's paths. |
| E-5 | Appendix A note | `docs/integration/wisetech-route-parity.md` says "merge 45" | Confirmed from the manifest module: 133 entries (route 116, CTA 5, form 3, locale 1, asset 8); sitemap dispositions `retain` 11, `redirect` 1, `merge` 51, `retire` 4. The doc's line 158 is the stale figure. | Correct the doc in the WP-7 commit that adds the redirects, as the body already instructs. |
| E-6 | WP-0 | Baselines "under `tests/e2e/__screenshots__/`" | Playwright places snapshots by `snapshotPathTemplate`, which WP-0 sets to `{testDir}/__screenshots__/{arg}-{platform}{ext}`. `.github/workflows/ci.yml` runs no Playwright job, and rendering differs across operating systems, so the platform is part of each file name and the spec skips under `CI` unless `WISETECH_VISUAL_BASELINE=1` is set. | Capture and compare on the same platform. Regenerate with `--update-snapshots` only at the end of a WP, as WP-1 instructs, and commit the new baselines in that WP's PR. |
| E-7 | §0.2 | "Public pages run with only `NEXT_PUBLIC_SITE_URL`" | True. The managed Playwright server additionally maps `DATABASE_URL` to `DATABASE_URL_TEST` (`tests/fixtures/m2-runtime-env.ts`), so a worktree without `.env.local` renders every data-backed section in its honest empty state. | The "before" baselines are the empty-state renders. That is deliberate: drift then measures presentation, not data. |
| E-8 | §0.2 | `npm run typecheck && npm run lint && … must be green before the first edit` | True for committed `main`. The primary checkout at `C:\Users\laich\Documents\hkwtia` carries untracked scratch directories at the repo root that `tsc` and `eslint .` walk, so the gate is red there for environmental reasons only. | Run every WP from a clean `.worktrees/<branch>` checkout with `node_modules` junctioned from the primary checkout (the repository's existing convention; `--webpack` exists for it). |
