# Experience pass — "Signal & Record" (2026-10-05/06)

Branch `feat/award-grade-experience-20261005`, cut from `origin/main` `df2453fc`. Production
(`hkwtia.vercel.app`) was confirmed to serve that same commit (`dpl_5u276U2z6EbgjjmASYwCVBn593Cm`,
READY, `githubCommitSha df2453fc…`), so the live site is a valid "before" for this branch.
**Nothing here is deployed.** No push, merge, migration, payment, email, WhatsApp, AI provider
call or production data change was made. Local runs used the existing isolated Neon branch
`br-lingering-unit-azxl75s5` (synthetic data, Stripe `sk_test_`, email delivery mode `test`,
WhatsApp live off, no AI keys, batch worker paused), checked before use.

Design system: [`docs/design/DESIGN_SYSTEM.md`](../../design/DESIGN_SYSTEM.md).
Before/after screenshots: [`evidence/`](evidence/).

## 1. Baseline (observed 2026-10-05, live production, Chromium 390×844 and 1440×900)

| # | Gap | Evidence | Impact | Severity |
|---|---|---|---|---|
| G1 | Hero primary CTA opened `/events?status=open`, which was empty | live `/` → "No activities are currently open" | A new visitor's first click lands on an empty state | High |
| G2 | Five identical audience cards; no answer to "what do I do next" | `components/home/pathways.tsx` | Positioning without a route | High |
| G3 | Six inner pages shared one 620px navy hero with an empty right half; 185px top padding sized for an overlay header these pages never use | `/members` `/partners` `/contact` `/launchpad` `/programmes` `/showcase` | Template feel; first content below the fold on phones | High |
| G4 | zh-HK headings broke inside words (「香港如何引 ／ 領…」), Latin −0.045em tracking crushed Han glyphs, serif fallback rendered thin PMingLiU | `/zh` 390px | Bilingual craft | High |
| G5 | 178 donor font sizes below 13px: 10px body copy, 7px header subtitle | `app/styles/wisetech.css` | Readability | High |
| G6 | **Open-event card titles were white on white (1:1)** inside the ink "Open now" section | isolated DB with open events; latent on production only because nothing was open | Every open event's title becomes invisible when registration opens | **Critical (latent)** |
| G7 | Index numerals failed contrast on `/programmes`, `/showcase`, `/launchpad` (2.97:1, 3.73:1) | axe on **production** | WCAG 1.4.3 | High |
| G8 | `/about/history` printed eight raw `[pdf-embedder url=”…”]` WordPress shortcodes; their unbreakable URLs pushed nine entries past 320px, where text was clipped | production, 320px | WCAG 1.4.10 and credibility | High |
| G9 | Member and staff sign-in: bare card, links wrapping onto three lines on a phone, no explanation of passwordless sign-in | `/member-login` 390px | Member anxiety and friction | Medium |
| G10 | Member directory facets had screen-reader-only labels and no submit in their row | `/members` | Filter state unclear; extra step | Medium |
| G11 | Two nav items looked "current" at once (`.event-first` used the current-page underline) | `/about` | Orientation | Medium |
| G12 | Concierge pill covered content on phones (e.g. the "Past events" tab) | `/events` 390px | Obstructed control | Medium |

Severity definitions, fixed before triage: **Critical** = a core task impossible, or data or
security exposure; **High** = a core task degraded for a whole audience, or a WCAG A/AA failure
on a primary page; **Medium** = friction with a workaround; **Low** = polish.

Pre-existing gates from the repo's own CI (`docs/audits/hkwtia-2026-10-03-full-fix/evidence/t15`):
EN homepage Lighthouse on Linux 0.75–0.91, TBT 350–570ms, CLS 0. The homepage is
performance-fragile, so the signature interaction was built with **zero JavaScript**.

## 2. Award references (verified on the official sites, 2026-10-05)

Criteria: Webby — Content, Structure & Navigation, Visual Design, Functionality, Interactivity,
Innovation, Overall Experience; **no numeric weights are published**. Awwwards — Design 40%,
Usability 30%, Creativity 20%, Content 10%, and Honorable Mention at ≥ 6.5 (awwwards.com/about-evaluation).
These are the awards' criteria; the internal targets below are this project's own.

| Reference | Award (and where verified) | Viewed | Borrowed principle | Not suitable here | Translation into WTIA |
|---|---|---|---|---|---|
| **NASA.gov** | Webby 2025 Winner + People's Voice, Websites & Mobile Sites — Government & Associations (confirmed on nasa.gov's Webby page; the Webby gallery URL redirected to its landing page) | Home at 3 scroll depths, 1440 and 390 | Mission-first hero, then dense but scannable "what's happening now" modules; one accent colour for actions | Media scale; dark-only palette | Hero question, then route finder, then "open now" with a record fallback |
| **The Design Society** (Lyon) | FWA of the Day, 21 Sep 2026 (thefwa.com/cases/the-design-society) | Home at 3 depths, 1440 and 390 | A professional community whose events *are* the product; brand personality carried by type | Pixel-art novelty and full-viewport colour blocks would undermine an industry body's credibility | Personality from WTIA's own motif (signal arcs), not from novelty |
| **HeronAI** (by Bearplus, Hong Kong) | FWA of the Day, 1 Oct 2026 (thefwa.com/cases/heronai) | Home at 3 depths, 1440 and 390 | An original line-drawing language taken from the users' own world (architecture) | **A forced loading counter (92%) gates the content**, which this pass deliberately avoids | The signal mark comes from WTIA's wireless origin; nothing gates content |
| **Hoyt Arts Center** | Awwwards **Nominee** (not a winner), 30 Sep 2026 | Home at 3 depths, 1440 and 390 | "Plan your visit / See what's on / Get hands on": audience entry points over real photography | Template layout | Audience entry as an interactive route, not three cards |

Reference screenshots were used for analysis only and are not committed (third-party assets).

## 3. Direction

"Signal & Record". The comparison table and rationale are in DESIGN_SYSTEM.md §1.

## 4. What changed (code)

| Area | Files | Regression evidence |
|---|---|---|
| Route finder (signature interaction, CSS-only) | `components/home/pathways.tsx`, `app/styles/wisetech-experience.css` | `tests/unit/home-pathways.test.tsx`: radio group, D-7 hrefs, every destination ∈ `publicRoutes`, and a case proving the guard can fail |
| Hero CTAs | `components/home/hero.tsx` | `tests/unit/home-hero.test.tsx` (red before, green after) |
| Open-now record and open-event title contrast | `components/home/open-now.tsx`, CSS | `tests/unit/home-open-now.test.tsx` (red before); `tests/e2e/experience-contrast.spec.ts` (measured 1:1 before) |
| Signal heroes, compact hero | `components/wt/page-hero.tsx`, CSS | renders; existing page tests |
| Bilingual type, type floor, long-token wrap | CSS | renders; reflow sweep (§6) |
| Index numeral contrast | CSS | `experience-contrast.spec.ts` (2.97:1 red with the fix removed) |
| History shortcodes | `lib/history/readable-body.ts` and three render sites | `tests/unit/milestone-readable-body.test.ts` (red with a stub), `history-detail.test.ts` |
| Sign-in shell | `components/auth/auth-shell.tsx`, both login pages | the existing 27 login and message tests, unchanged and green |
| Member directory filters | `components/marketing/member-filters.tsx` | `tests/unit/public-member-filters.test.tsx` (red before) |
| Join lockup, nav current state, concierge on phones, events tabs, plan cards | layouts + CSS | renders |

## 5. Iterations

| Round | Observed (rendered) | Change | Re-verified by |
|---|---|---|---|
| 1 | G1–G5, G11, G12 | Route finder, hero CTA, signal heroes, type, nav, concierge | EN/ZH × 390/1440 renders; unit tests |
| 2 | Members facets raw; events tabs uneven; plan cards ~300px empty; **open-event titles invisible (G6)** | Filters, tabs, plan cards, contrast fix | Renders; contrast e2e red → green |
| 3 | axe: G7 on three pages (pre-existing on production) | Accent-text numerals | axe 0 critical / 0 serious in 36 page×viewport runs; e2e red → green |
| 4 | Reflow sweep at 320 / 640 / 844×390: G8, open-event cards at 320, search row at 640 | Shortcode cleaner, long-token wrap, flex min-width | Sweep: no horizontal scroll on 18 routes × 3 sizes; history tests |
| 5 | Lighthouse accessibility 0.97 on the local homepage | Diagnosed: axe scores an unpainted `content-visibility:auto` section (1.08:1 without scrolling, clean after scrolling it into view). Not a user-facing defect; the optimisation was left in place rather than removed to raise a score | axe before/after scroll |
| 6 | Final review of the before/after evidence: **this pass's own regression** — wrapping the concierge label in a span let the donor's `.concierge-trigger span` disc rule squeeze "Ask WiseTech" into a 38px circle on desktop | Higher-specificity label rule, phone collapse restated after it | New e2e case red (38px) → green; re-captured evidence; 3-engine smoke |

## 6. Verification results

### Lighthouse 12.6.1: before vs after under identical conditions

Both builds were produced with `npm run build` from the same machine and served by `next start`
against the same isolated database: **before** = `df2453fc` (port 3300), **after** = this
branch (port 3200). Each row is the median of **3 runs** [min–max], run back-to-back in one
batch, with mobile (simulated throttling) and desktop presets.

| Page | Form | Build | Perf | A11y | BP | SEO* | LCP ms | TBT ms | CLS | JS KB | Total KB |
|---|---|---|---|---|---|---|---|---|---|---|---|
| home-en | mobile | before | 0.95 [0.93–0.95] | 0.97† | 1 | 0.92 | 2900 [2850–3066] | 64 [61–115] | 0 | 201.9 | 517 |
| home-en | mobile | after | 0.93 [0.92–0.93] | 0.97† | 1 | 0.92 | 3168 [3082–3205] | 101 [59–123] | 0 | 201.2 | 518 |
| home-zh | mobile | before | 0.89 [0.84–0.94] | 0.96† | 1 | 0.92 | 2937 [2478–2964] | 288 [115–522] | 0 | 201.9 | 524 |
| home-zh | mobile | after | 0.92 [0.90–0.92] | 0.96† | 1 | 0.92 | 3060 [3027–3283] | 153 [146–156] | 0 | 201.2 | 525 |
| membership-en | mobile | before | 0.94 [0.93–0.96] | 0.97 | 1 | 0.92 | 2559 [2485–2563] | 199 [153–227] | 0 | 200.4 | 285 |
| membership-en | mobile | after | 0.96 [0.94–0.97] | 0.97 | 1 | 0.92 | 2262 [2261–2490] | 188 [126–203] | 0 | 199.8 | 293 |
| events-en | mobile | before | 0.93 [0.93–0.94] | 1 | 1 | 0.92 | 3127 [2983–3179] | 72 [65–73] | 0 | 202.2 | 380 |
| events-en | mobile | after | 0.91 [0.91–0.91] | 1 | 1 | 0.92 | 3281 [3156–3285] | 116 [111–164] | 0 | 201.6 | 382 |
| all four | desktop | before | 1.00 | 1 | 1 | 0.92 | 578–678 | 0–14 | 0 | ≈202 | — |
| all four | desktop | after | 1.00 | 1 | 1 | 0.92 | 576–672 | 0–10 | 0 | ≈201 | — |

Reading it honestly:

- **Targets** (this project's own, not an award rule): mobile Performance ≥ 90 is met by every
  *after* median (0.91–0.96); desktop ≥ 95 is met (1.00); Accessibility and Best Practices ≥ 95
  are met. Local SEO is 0.92 only because `canonical` points at the production host from
  `localhost`; production scores SEO 1.0 on the same pages.
- **Mobile LCP ≤ 2.5s is NOT met locally, before or after** (2.26–3.28s). The LCP element is
  the hero image in both builds, and the delay is render-blocking CSS (the 114KB donor stylesheet
  costs ~460ms of simulated blocking). A paired re-run of the EN homepage gave 3136ms before and
  3120ms after, so the 3-run median gap on that page is within run-to-run variance. This pass
  adds one render-blocking stylesheet (`wisetech-experience.css`: 20KB raw, about 6KB
  transferred, ~300ms simulated). That is the real performance cost, and the budget it uses is
  recorded here. Live production measured 2.2–2.5s mobile LCP on the same tool, because Vercel's
  edge serves the CSS faster than local `next start`. Lab numbers are not field data.
- **JavaScript is 0.6KB smaller**: the route finder is CSS-only and adds no client JS.
- † The homepage accessibility 0.96/0.97 is the same before and after. It is one axe
  `color-contrast` hit on an impact-metrics span that axe measures against an unpainted
  `content-visibility:auto` section (1.08:1 without scrolling; clean once the section is in
  view). It is a measurement artifact of the existing performance optimisation, not a user-facing
  defect.

\* SEO caveat as above. Field Core Web Vitals (p75 LCP, INP, CLS) were **not measured**. There is
no field data for this branch, and lab TBT is not INP.

### Accessibility (axe-core via Playwright, WCAG 2.0/2.1/2.2 A+AA tags)

18 public routes × desktop 1440 and mobile 390 = 36 scans, after scrolling every section into
view: **0 critical, 0 serious** after round 3 (3 serious were found first, all pre-existing on
production and now fixed). Automated scanning is not a full WCAG audit. The manual checks
done: keyboard through the route finder (Tab to the group, arrows between audiences, visible
focus on the label), sign-in form labels and alerts, and skip link present. Screen-reader output
was not tested with a real screen reader.

### Cross-browser smoke (local production build, Playwright)

Chromium (bundled), WebKit 2359 and Firefox 1543 (the machine's cached builds; this
Playwright pins 2311/1532, so they are newer than pinned, but both launched and drove pages),
each at 1440×900 and 390×844, ran 13 checks: homepage h1; the route finder's default panel,
switch on click and switch on arrow key; hero CTA anchor; launcher label (shown on desktop,
collapsed on phone); no horizontal scroll; zh h1; member sign-in form; member filters with
apply; events tabs; history without shortcodes; and no page errors. Result: **77/78**. The one
failure is WebKit "Fetch API cannot load /zh/… due to access control checks" on `/zh` after
an EN visit. It is **pre-existing on production** (the same sequence on hkwtia.vercel.app
reports it for `/events`), it does not break navigation (the affected link was clicked and
loaded `/zh/programs/cpai`), and it is classed Low. Its likely cause is Next.js prefetches
across the locale-cookie switch; it is recorded for follow-up, not fixed here. Emulated
viewports are not physical devices.

### Unit, lint, type and string gates

- `npx vitest run --maxWorkers=2` (first full run): 6,791 passed, 596 guarded skips (the same
  count as the repo's own baseline receipts), and **1 failed**: `page-copy-scope` pins the
  number of staff-editable strings. This pass deliberately added 22 editable Home strings;
  the test was updated to the new exact counts (166 → 188, 577 → 599) with the arithmetic
  written beside them. The assertion is still an exact equality, not a loosened one. See the
  full re-run result below.
- `npm run typecheck`: 0 errors. `npm run lint`: 0 errors, 77 pre-existing warnings, and
  **0 warnings in any file this branch touches**. `npm run audit:strings`: passed (325 files).
- `npm run build` (Next 16.3.6, webpack): passed three times during the pass.
- Playwright `tests/e2e/experience-contrast.spec.ts`: 5/5. The repo's credentialed E2E specs
  were **not** run (see §7).

### Reflow and responsive

No horizontal page scroll on 18 routes at 320×640, 640×720 (≈ 200% zoom of 1280) and 844×390
landscape, after the round-4 fixes. Header checked at 320, 360, 390, 768, 1024, 1121, 1280,
1366, 1440 and 1920 in EN and ZH: no control overflows.

## 7. Status

| Item | Status |
|---|---|
| G1–G12 code changes | IMPLEMENTED, then checked on a local production build with the isolated DB (§4–6) → **PRE_RELEASE_VERIFIED** for the public surface in Chromium |
| Member portal and admin interactive walkthrough | **BLOCKED**: sign-in goes through hosted Neon Auth, and the agent may not enter the test passwords. The owner, or CI with the `M2_TEST_*` credentials, must run `npm run test:e2e` |
| Google OAuth and magic-link end-to-end (expired or reused link, return URL) | **BLOCKED**: needs a real Google account and mailbox. These code paths are unchanged; the `next` continuation is preserved and pinned by the existing login tests |
| WebKit / Firefox | Public-surface smoke 77/78 (§6); the one WebKit item is pre-existing and Low. Full journeys in WebKit and Firefox were not run |
| Google sign-in rendering | The isolated env sets `AUTH_GOOGLE_ENABLED=false`, so local captures show the "Google sign-in will be available…" note; production has Google enabled (observed on live) |
| Real devices, real users, field CWV (p75) | **NOT_STARTED**: emulation only; no CrUX or RUM data exists for this branch |
| Preview deployment | **BLOCKED**: Vercel has no branch-scoped isolated env for this branch (queried 2026-10-06), so a Preview would run against unverified data. Not pushed |
| Production | Not deployed; **PRODUCTION_VERIFIED is not claimed** |

## 8. Content to verify (not changed)

- The zh-HK header subtitle publicly reads 「…中文法定名稱待正式批准」. Brand names were not changed; WTIA should confirm whether this pending-approval note should still be public.
- Two milestone records contain Cloudflare's `[email protected]` placeholder where an address was obfuscated during the WordPress capture (`content/milestones.ts` lines 725–726, the 2020 postponement notice, and line 837, the IoT guide book). The real address must come from WTIA.
- The eight stripped `[pdf-embedder]` PDFs are not hosted on this site. If WTIA still holds them, they can be added under `/public` and linked.
- zh-HK "Clinics" was translated as 「診所」 (medical); it is now 「實務諮詢」. Please confirm the wording.

## 9. Remaining work (priority order)

| # | Task | Depends on | Acceptance | Rollback |
|---|---|---|---|---|
| 1 | Run `npm run test:e2e` (member, admin, RSVP and checkout specs) against an isolated Preview of this branch | Branch-scoped isolated Preview env (owner) | All specs green, no new skips | n/a |
| 2 | Owner walk: magic link (new, expired, reused), Google, return URL, member vs staff role | #1 | Recorded in the activation checklist | n/a |
| 3 | Homepage IA: fold "Events journey (Before/During/After)" into `/events`; decide 13 → ~10 sections | Content owner sign-off | No route loses its link; Lighthouse ≥ baseline | Revert commit |
| 4 | Locale switch inside `/join` with an unsaved-input guard (`beforeSwitch`) | — | Typed input is never lost on switch | Revert |
| 5 | Admin workspace typography pass to the same floors | #1 for verification | axe 0 serious on admin routes | Revert |
| 6 | Field CWV review after release | Release | p75 LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1, separately for mobile and desktop | n/a |

Rollback for the whole pass: revert this branch's commits. The visual layer alone reverts by
removing the `wisetech-experience.css` import. There are no migrations, data or env changes.

## 10. Internal scoring and final review

Scores are this project's internal yardstick (anchors: 6 = usable but templated, 8 = mature
with specific gaps, 9 = competitive with the verified references across pages, devices and
operations). They are not award scores and imply no recognition.

| Dimension | Score | Evidence | Still open to criticism |
|---|---|---|---|
| Brand identity and originality | 8 | Signal motif from WTIA's wireless origin; route finder; seeded hero marks (evidence/*.webp) | Most sections still use the donor's card grammar; the hero itself is unchanged |
| Visual hierarchy and typography | 8 | Bilingual heading fixes, type floor, header checked 320–1920 EN/ZH | The header subtitle wraps to three lines at 1280; the admin shell was not touched |
| Content quality and credibility | 8 | Record-backed empty state; shortcodes gone; no invented numbers | `[email protected]` placeholders and the "name pending approval" note await WTIA (§8) |
| Navigation and core tasks | 8 | Hero no longer dead-ends; every route-finder destination is a real page (tested); filters apply in place | Join → payment → portal not walked signed-in (BLOCKED) |
| Interaction and motion | 8 | One purposeful CSS interaction, keyboard-native, reduced-motion safe, 3 engines | One signature moment only; no motion beyond it was justified |
| Mobile and bilingual | 8 | 320/360/390/640/768/844×390/1024/1280/1440/1920 checks; EN/ZH evidence | Emulation only, no physical devices; WebKit prefetch noise (pre-existing) |
| Member / admin efficiency | **UNVERIFIED** | No signed-in walkthrough was possible (§7) | Nothing in this pass is demonstrable to daily admin staff |
| Engineering completeness | 8 | Red→green regression tests for each defect; typecheck, lint, strings, build; axe 0 serious | Mobile LCP ≤ 2.5s not met locally (pre-existing CSS weight); credentialed E2E not run |

**The internal convergence target (every dimension ≥ 9, every pre-release gate passed) is
not met**, and this record does not claim it is.

### "What would most likely make them reject this version?"

1. **A strict design reviewer:** "Beyond the route finder and the new heroes, the homepage is
   still thirteen donor sections with similar numbered cards." True. Shortening it means
   removing or merging content sections, which needs the content owner (§9 #3). It was not done
   unilaterally.
2. **A first-time member:** "I could not see the whole path from sign-in to paying." The
   public half (route finder → membership → join plan step, sign-in explainer) is improved and
   verified. The signed-in half (magic link, Google, checkout, portal) is **BLOCKED** for the
   agent and needs the owner walk (§9 #1–2). Mobile LCP is also around 3s on a local build
   (live 2.2–2.5s) and is not field-verified.
3. **A daily admin:** "Nothing changed for me." Correct. The admin workspace could not be
   entered, so no admin change was made or claimed. The earlier remediation programme's admin
   work stands as recorded in `docs/audits/hkwtia-2026-10-03-full-fix`.

None of the three can be closed with the access available in this session. Each is listed with
its dependency in §9.
