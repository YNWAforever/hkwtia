# WiseTech design fidelity — WP-8 evidence record

Programme spec: `docs/superpowers/plans/2026-09-01-wisetech-design-fidelity.md` (§5 "WP-8 · Verification, evidence and gate closure", §6 acceptance criteria, §7 verification order). Execution plan: `docs/superpowers/plans/2026-09-06-wisetech-wp8-verification.md`. Living status: `docs/integration/wisetech-design-fidelity-checklist.md`. Gate record: `docs/integration/wisetech-delivery-gates.md`. Format precedent: `docs/integration/wisetech-pr5-verification.md`.

The local runs in §2 and §4 were still executing when this record was first written; every cell was then filled by hand from the saved command logs on 2026-09-07 before the PR was opened. No cell was left unrecorded; cells that read "not reached" or "not measured" describe runs that aborted, with the reason given beneath the table.

## 1. Record identity and scope

- Record date: 2026-09-07 (Asia/Hong_Kong, UTC+08:00). All dates in this record are HKT.
- Branch: `worktree-wt-wp8-verification`, stacked on WP-7 (`worktree-wt-wp7-routes-seo`, tip `19dda79`, pull request [#40](https://github.com/YNWAforever/hkwtia/pull/40), CI `quality` passed, **not yet merged** when this record was written).
- Preview under test: Vercel deployment `dpl_6dsVDPHvx1pZsX7MimnyPdxE9o74`, origin `https://hkwtia-git-worktree-wt-wp7-routes-seo-ynwaforevers-projects.vercel.app`, built from `19dda79`. The Preview therefore predates every WP-8 commit; the two product fixes this branch carries (`03904e3`, `27065f2`) were found on this Preview and are **not** re-verified against a Preview by this record.
- WP-8 commits on this branch at the time of writing (`git log --oneline origin/main..HEAD`, WP-8 portion): `83e3bd8` plan, `bbdcd79` Preview session harness, `3c4aa13` read-only zh-HK walk spec, `35d9ecd` Lighthouse target list, `7fdb423` harness credential fixes, `03904e3` programme-card "since <first year>" fix, `e0d288f` harness follow-ups, `5bd3501` donor README note, `18714b4` checklist rows 4-6, `27065f2` SME plan-card contrast fix. The two commits that add this record and flip the checklist follow them.
- Scope: read-only browser verification against a Vercel Preview, plus the local source gate on this tip.
- Boundary: this record does not claim a production action, a schema change, a merge, a push, or Preview database isolation. Preview database isolation is **unverified** — `docs/integration/wisetech-delivery-gates.md` still records "isolated Neon/test identities/providers: NOT PASSED" — which is why only read-only specs ran against the Preview (§3) and every write-path suite ran locally (§4).
- Credential handling: Preview access was obtained through a Vercel share link that `scripts/vercel-preview-session.mjs` turned into an ignored Playwright `storageState` and an ignored cookie file under `.playwright/`. No token, cookie, share URL or Lighthouse report link is recorded here or anywhere in the repository; only the Preview origin and the scores are cited.

## 2. Local gate on this tip

Master plan §7 order. Windows note: the repository's own records substitute `npm.cmd` for `npm`.

| Exact command | Date (HKT) | Exit | Result and material warnings |
|---|---|---:|---|
| `npm.cmd run audit:strings` | 2026-09-07 | 0 | Visible-string audit passed; 224 TSX files scanned |
| `npx vitest run tests/unit/wisetech-tokens.test.ts tests/unit/wisetech-css-port.test.ts tests/unit/homepage.test.tsx tests/unit/preview-session-harness.test.ts tests/unit/zh-walk-regex.test.ts` | 2026-09-07 | 0 | 5 files, 159 tests passed (7.0 s) |
| `npm.cmd test` | 2026-09-07 | 1 in-suite | 452 files passed, 2 failed, 15 skipped (469); 3768 tests passed, 3 failed, 40 skipped (3811). The two failing files (`tests/unit/wt-pages/launchpad-page.test.tsx`, `tests/unit/wt-pages/news-page.test.tsx`) were rerun alone: exit 0, 2 files / 3 tests passed (22.8 s) — load-related 5 s timeouts, the pattern recorded for this machine since WP-3 |
| `npm.cmd run lint` | 2026-09-07 | 0 | 0 errors, 26 warnings (all pre-existing, in test fixtures) |
| `npm.cmd run typecheck` | 2026-09-07 | 0 | `tsc --noEmit` completed with no diagnostics |
| `npm.cmd run build` | 2026-09-07 | 0 | Next.js Webpack production build compiled; 128/128 static pages generated (12.5 s); `AGENTS.md` / `next-env.d.ts` unchanged afterwards |
| `npm.cmd audit --omit=dev --audit-level=high` | 2026-09-07 | 0 | no high or critical findings at the required threshold; lower-severity advisories in the dev tool chain remain, no fix or install was run |

Known load-sensitive files on the development machine (the WP-7 gate and `docs/integration/wisetech-pr5-verification.md` record the same behaviour): `board-reporter-service`, `ci-security-contract`, `homepage`, `public-environment-isolation`, `repository-boundary`, `wt-pages/about-chairman-committees`, `wt-pages/launchpad-page`, `wt-pages/about`, `wt-pages/programs-editions`. If any of them times out inside the full run, the isolated rerun is recorded next to the full-run total, not instead of it.

Earlier WP-8 local runs already recorded on this branch (not reruns on the final tip):

| Run | Commit context | Result |
|---|---|---|
| `PLAYWRIGHT_PORT=3100 npm.cmd run test:e2e -- tests/e2e/wisetech-zh-walk.spec.ts` on the managed dev server (Task 2) | `3c4aa13` | 21/21 passed |
| Harness unit tests (`tests/unit/preview-session-harness.test.ts`, `tests/unit/m2-browser-acceptance-contract.test.ts`, `tests/unit/m3-e2e-safety.test.ts`) | `bbdcd79` / `7fdb423` | 25/25 passed |
| `npm.cmd test` (full unit suite) | after `7fdb423` | 3768 passed, 40 skipped (the 40 are the environment-gated Postgres integration cases) |

## 3. Preview evidence (read-only scope)

### 3.1 How access was obtained

1. A share link for deployment `dpl_6dsVDPHvx1pZsX7MimnyPdxE9o74` was minted with the Vercel tooling and supplied only in the process environment (`VERCEL_SHARE_URL`).
2. `node scripts/vercel-preview-session.mjs` visited it in a headless browser and wrote `.playwright/preview-state.json` (Playwright storage state) and `.playwright/preview-cookie.txt` (Lighthouse cookie header). `.playwright/` is git-ignored; `git status --short` showed nothing new.
3. The Playwright path worked: every navigation in the run below reached the Preview with the session cookie in the browser's jar.
4. The Lighthouse path did **not** work: Vercel's SSO check does not accept the session cookie when it arrives as an `extraHeaders` `Cookie` header. This was confirmed independently with `curl` — every Preview URL answered `302` to the SSO endpoint with the header alone. See §3.4.

Vercel Authentication (SSO) covers every Preview of this project. Every Preview response also carries `X-Robots-Tag: noindex`, and `/robots.txt` sits behind SSO, so Lighthouse's SEO category cannot be measured on any Preview of this project as configured.

### 3.2 Command

```sh
PLAYWRIGHT_BASE_URL=<preview-origin> PLAYWRIGHT_STORAGE_STATE=.playwright/preview-state.json npm run test:e2e -- tests/e2e/public-shell.spec.ts tests/e2e/accessibility.spec.ts tests/e2e/public-route-matrix.spec.ts tests/e2e/wisetech-redirects.spec.ts tests/e2e/wisetech-pr3-public-pages.spec.ts tests/e2e/wisetech-pr5-public-journeys.spec.ts tests/e2e/wisetech-zh-walk.spec.ts
```

`<preview-origin>` is the origin named in §1. Run on 2026-09-07 with a single worker; wall time 7.4 minutes. `tests/e2e/wisetech-visual-baseline.spec.ts` is deliberately absent from the list because it skips under `PLAYWRIGHT_BASE_URL`; `tests/e2e/concierge.spec.ts` and every `m*` spec are absent because they write (§4).

### 3.3 Per-spec totals — 140 passed, 4 failed of 144

| Spec | Result | Note |
|---|---:|---|
| `tests/e2e/public-shell.spec.ts` | 21/21 | |
| `tests/e2e/public-route-matrix.spec.ts` | 42/42 | |
| `tests/e2e/wisetech-redirects.spec.ts` | 7/7 | The WP-7 redirect contract holds on the deployed proxy, not only in `next.config.ts` |
| `tests/e2e/wisetech-pr3-public-pages.spec.ts` | 30/30 | |
| `tests/e2e/wisetech-zh-walk.spec.ts` | 21/21 | Row 8.4's repeatable `/zh` walk, on the Preview (§5) |
| `tests/e2e/accessibility.spec.ts` | 16/19 | Failures 1-3 below |
| `tests/e2e/wisetech-pr5-public-journeys.spec.ts` | 3/4 | Failure 4 below |

**Failures 1-3 — real product defect, fixed on this branch (`27065f2`), not yet re-verified on a Preview.** The three failing cases are `accessibility.spec.ts`'s `/membership`, `/zh/membership`, and "the current mobile group … keeps AA contrast", which runs axe on `/zh/membership` after opening the mobile menu. All three share one root cause: axe `color-contrast` (serious) on `.plan-grid > article:nth-child(5)`, the SME pathway card (D-7) that sits on the dark `--wt-ink` `#0f4c81` background. Two elements failed: `.card-index` at `#646464` (1.49:1) and the card's body copy at `rgba(255,255,255,.62)` (4.46:1). The defect is invisible locally because the managed test server's empty database renders the "membership unavailable" notice instead of the plan grid, so no local axe run had ever seen the card; the companion sheet's global `.card-index { color: var(--wt-steel) }` — WP-4's fix for the light cards — had landed on the dark card as well. `27065f2` changes `app/styles/wisetech-shell.css` only: index `#a8d4ec` (5.61:1) and body copy `#c9d8e6` (6.09:1), both ratios pinned in `tests/unit/wisetech-css-port.test.ts`. Because the Preview predates the fix, re-verification needs WP-8's own Preview (§8).

**Failure 4 — environment difference, spec left unchanged.** `wisetech-pr5-public-journeys.spec.ts` "keeps the bilingual Membership catalog honest without repository credentials" expects the "Membership is currently unavailable" `role="status"` notice. That assumption only holds on the managed server, whose catalogue is empty; the Preview's database has real plans, so the page renders the plan grid instead. Not a defect; per the plan's rule the spec was not patched to fit the Preview.

**Also found on the Preview, outside the suites.** The programme cards read "6 editions since 2025" — the span was counted from the latest edition year rather than the first. Found by the controller's browser walk (§5), fixed in `03904e3` (cards now read "since 2020"); the Preview predates that fix too.

### 3.4 Lighthouse (partial — Preview unreachable for Lighthouse's Chrome)

```sh
LHCI_BASE_URL=<preview-origin> LHCI_COOKIE_FILE=.playwright/preview-cookie.txt npm run test:lighthouse
```

Targets: the ten URLs in `lighthouserc.js` (`35d9ecd`). Thresholds: performance ≥ 0.90, accessibility ≥ 0.95, SEO ≥ 0.95; LCP < 2.5 s; CLS < 0.05. The run aborted after a Windows temp-directory `EPERM` and a Lighthouse Lantern "cycle detected" error on `/membership`.

| URL | Performance | Accessibility | SEO | LCP | CLS | Outcome |
|---|---:|---:|---:|---:|---:|---|
| `/zh` | 0.93 | 1.00 | 0.54 | 2491 ms | 0.000 | Performance, accessibility, LCP and CLS clear their thresholds. SEO fails solely on `is-crawlable`, `robots-txt` and `canonical`, all caused by the Preview's `X-Robots-Tag: noindex` header and SSO-gated `/robots.txt` — not measurable on this target |
| `/` | — | — | — | — | — | Lighthouse's Chrome was redirected to the SSO login (cookie header not honoured); no valid measurement |
| `/membership` | — | — | — | — | — | Same redirect; Lantern "cycle detected" on the redirected document |
| `/zh/membership`, `/events`, `/zh/events`, `/programmes`, `/zh/programmes`, `/partners`, `/zh/partners` | — | — | — | — | — | Not reached; the run aborted before them |

Consequence for the checklist: rows 3.19 and 8.3 stay `ported`. The checklist's own rule says a Preview-needing row is never verified from a local run, and this Preview could not be measured. Owner action recorded in `docs/integration/wisetech-delivery-gates.md`: enable Vercel "Protection Bypass for Automation" (or exempt Preview deployments from SSO) so `npm run test:lighthouse` can reach a Preview, then rerun; the SEO category must be measured on a target that is not served with `noindex` (production, or a bypass-exempt Preview).

## 4. Local-only browser evidence on this tip

Managed dev server, `PLAYWRIGHT_PORT=3100`. Command for the first eight suites:

```sh
PLAYWRIGHT_PORT=3100 npm run test:e2e -- tests/e2e/public-shell.spec.ts tests/e2e/accessibility.spec.ts tests/e2e/public-route-matrix.spec.ts tests/e2e/wisetech-redirects.spec.ts tests/e2e/wisetech-pr3-public-pages.spec.ts tests/e2e/wisetech-pr5-public-journeys.spec.ts tests/e2e/wisetech-zh-walk.spec.ts tests/e2e/wisetech-visual-baseline.spec.ts
```

then `tests/e2e/concierge.spec.ts` with `M4A_DETERMINISTIC_ACCEPTANCE=true M4A_DETERMINISTIC_ACCEPTANCE_AUTHORIZED=true`.

| Suite | Local result (2026-09-07) | Why it runs locally |
|---|---:|---|
| `tests/e2e/public-shell.spec.ts` | 21/21 passed | Managed-server counterpart of the Preview run, on the tip that carries `27065f2` (run 1 of 3: 89 passed, 7.0 min, exit 0) |
| `tests/e2e/accessibility.spec.ts` | 19/19 passed | Same; note the SME card is not rendered locally (empty catalogue), so this run cannot re-verify `27065f2` |
| `tests/e2e/public-route-matrix.spec.ts` | 42/42 passed | Managed-server counterpart |
| `tests/e2e/wisetech-redirects.spec.ts` | 7/7 passed | Managed-server counterpart |
| `tests/e2e/wisetech-pr3-public-pages.spec.ts` | 30/30 passed | Managed-server counterpart (run 2 of 3: 55 passed, 3.6 min, exit 0) |
| `tests/e2e/wisetech-pr5-public-journeys.spec.ts` | 4/4 passed | Managed-server counterpart; the "membership unavailable" case passes here (empty catalogue), confirming the Preview failure was the environment difference, not the spec |
| `tests/e2e/wisetech-zh-walk.spec.ts` | 21/21 passed | Managed-server counterpart |
| `tests/e2e/wisetech-visual-baseline.spec.ts` | 88/88 passed, 0 diffs (5.4 min, exit 0) | Skips under `PLAYWRIGHT_BASE_URL` by design; the WP-7 baselines from `af97302` still hold on this tip — the `03904e3` copy change sits under the spec's 2% full-page tolerance and the `27065f2` card is not rendered locally (empty catalogue) |
| `tests/e2e/concierge.spec.ts` | 4/4 passed, 1 skipped (36.7 s, exit 0) | Sends Concierge messages and needs the deterministic acceptance environment (`M4A_DETERMINISTIC_ACCEPTANCE=true`, `M4A_DETERMINISTIC_ACCEPTANCE_AUTHORIZED=true`, loopback `APP_URL=http://localhost:3100`); never run against the Preview. A first attempt without `APP_URL` failed all four cases with a 503 from the Concierge API — the boundary in `lib/ai/m4a-acceptance-boundary.ts` refuses the mock provider unless `APP_URL` is the served loopback origin; the retry with it passed |

Local production-build Lighthouse (`npm run test:lighthouse` without `LHCI_BASE_URL`, which starts `npm.cmd run start` itself) — evidence only, never a verifying run for rows 3.19 / 8.3:

| URL | Performance | Accessibility | SEO | LCP | CLS |
|---|---:|---:|---:|---:|---:|
| `/` | not measured | not measured | not measured | not measured | not measured |
| `/zh` | 0.63 (devtools throttling; not comparable) | 1.00 | 0.92 | 5302 | 0.000 |
| `/membership` | not reached | not reached | not reached | not reached | not reached |
| `/zh/membership` | not reached | not reached | not reached | not reached | not reached |
| `/events` | not reached | not reached | not reached | not reached | not reached |
| `/zh/events` | not reached | not reached | not reached | not reached | not reached |
| `/programmes` | not reached | not reached | not reached | not reached | not reached |
| `/zh/programmes` | not reached | not reached | not reached | not reached | not reached |
| `/partners` | not reached | not reached | not reached | not reached | not reached |
| `/zh/partners` | not reached | not reached | not reached | not reached | not reached |

The local Lighthouse pass (production build from the gate above, `next start -p 3200`, `LHCI_BASE_URL=http://localhost:3200`) could not be completed in this session, so this table is not release evidence and rows 3.19 / 8.3 stay `ported`:

- With the rc's default simulated throttling, Lighthouse 12.6.1 aborted on the first URL with its own `LanternError: Invalid dependency graph created, cycle detected` — the same error the Preview run hit on `/membership` — and `lhci autorun` stops at the first failed URL.
- With `--collect.settings.throttlingMethod=devtools` (real throttling, no Lantern simulation) the first URL completed but is recorded above under `/zh`: Lighthouse's Chrome on this zh-HK workstation sends a Chinese `Accept-Language`, so the request for `/` is answered by the locale redirect to `/zh`. The second URL then failed the same way and the run aborted. Devtools-throttled performance scores are not comparable with the programme's simulated-throttling thresholds (WP-3 recorded 0.89–0.97 on the same pages), so the 0.63 is reported, not judged.
- Rerun on a Linux CI runner with an English locale (or on a Preview exempted from SSO through Vercel's protection bypass for automation) with the rc defaults; if the Lantern error persists there, it is a Lighthouse defect to isolate (which request graph on `/` and `/membership` forms the cycle), not a site regression — recorded as a follow-up in §8.

## 5. `/zh` walk (row 8.4)

- Key parity: `tests/unit/messages.test.ts` is part of the full unit suite (§2).
- Repeatable walk: `tests/e2e/wisetech-zh-walk.spec.ts` (`3c4aa13`, regex hardened in `e0d288f`) visits every route in `config/public-routes.ts` under `/zh` and asserts a 200, a `zh` document language, exactly one `h1` inside the main landmark, no raw message key or JS placeholder in the body text, and no `/zh-HK/` href (CLAUDE.md boundary 5). 21/21 on the managed server (Task 2) and 21/21 on the Preview (§3.3).
- Human pass (controller, in-app browser, on the Preview, 2026-09-07): `/zh`, `/zh/programmes` and `/zh/partners` rendered in Traditional Chinese with the fullwidth-bar `｜WiseTech Hong Kong` titles and no raw keys. `/zh/partners` showed the honest empty state, because the Preview database has no published partner rows. The one finding was the programme-card edition span ("6 editions since 2025"), fixed in `03904e3` (§3.3).

## 6. Before / after per breakpoint and locale

"Before" is the WP-0 capture of the pre-programme site, committed in `895216b` (72 PNGs). "After" is the current set of 88 committed in `af97302` (WP-7): the same 72 files recaptured, plus `partners` and `programmes` × 8 each, which have no "before" because the pages did not exist. The images are not copied into this document (29 MB per capture); read them as:

- before: `git show 895216b:tests/e2e/__screenshots__/wisetech-visual-baseline/<file>`
- after: `tests/e2e/__screenshots__/wisetech-visual-baseline/<file>` in the working tree at this tip

File names follow `<page>-<locale>-<viewport>-win32-chromium.png`; the four viewports are `desktop-1440`, `laptop-1120`, `tablet-820`, `mobile-390` (the harness's fourth viewport is 390, errata E-26).

| Page | Locale | Before | desktop-1440 | laptop-1120 | tablet-820 | mobile-390 |
|---|---|---|---|---|---|---|
| about | en | `git show 895216b:tests/e2e/__screenshots__/wisetech-visual-baseline/<file>` | `about-en-desktop-1440-win32-chromium.png` | `about-en-laptop-1120-win32-chromium.png` | `about-en-tablet-820-win32-chromium.png` | `about-en-mobile-390-win32-chromium.png` |
| about | zh | `git show 895216b:tests/e2e/__screenshots__/wisetech-visual-baseline/<file>` | `about-zh-desktop-1440-win32-chromium.png` | `about-zh-laptop-1120-win32-chromium.png` | `about-zh-tablet-820-win32-chromium.png` | `about-zh-mobile-390-win32-chromium.png` |
| contact | en | `git show 895216b:tests/e2e/__screenshots__/wisetech-visual-baseline/<file>` | `contact-en-desktop-1440-win32-chromium.png` | `contact-en-laptop-1120-win32-chromium.png` | `contact-en-tablet-820-win32-chromium.png` | `contact-en-mobile-390-win32-chromium.png` |
| contact | zh | `git show 895216b:tests/e2e/__screenshots__/wisetech-visual-baseline/<file>` | `contact-zh-desktop-1440-win32-chromium.png` | `contact-zh-laptop-1120-win32-chromium.png` | `contact-zh-tablet-820-win32-chromium.png` | `contact-zh-mobile-390-win32-chromium.png` |
| events | en | `git show 895216b:tests/e2e/__screenshots__/wisetech-visual-baseline/<file>` | `events-en-desktop-1440-win32-chromium.png` | `events-en-laptop-1120-win32-chromium.png` | `events-en-tablet-820-win32-chromium.png` | `events-en-mobile-390-win32-chromium.png` |
| events | zh | `git show 895216b:tests/e2e/__screenshots__/wisetech-visual-baseline/<file>` | `events-zh-desktop-1440-win32-chromium.png` | `events-zh-laptop-1120-win32-chromium.png` | `events-zh-tablet-820-win32-chromium.png` | `events-zh-mobile-390-win32-chromium.png` |
| home | en | `git show 895216b:tests/e2e/__screenshots__/wisetech-visual-baseline/<file>` | `home-en-desktop-1440-win32-chromium.png` | `home-en-laptop-1120-win32-chromium.png` | `home-en-tablet-820-win32-chromium.png` | `home-en-mobile-390-win32-chromium.png` |
| home | zh | `git show 895216b:tests/e2e/__screenshots__/wisetech-visual-baseline/<file>` | `home-zh-desktop-1440-win32-chromium.png` | `home-zh-laptop-1120-win32-chromium.png` | `home-zh-tablet-820-win32-chromium.png` | `home-zh-mobile-390-win32-chromium.png` |
| launchpad | en | `git show 895216b:tests/e2e/__screenshots__/wisetech-visual-baseline/<file>` | `launchpad-en-desktop-1440-win32-chromium.png` | `launchpad-en-laptop-1120-win32-chromium.png` | `launchpad-en-tablet-820-win32-chromium.png` | `launchpad-en-mobile-390-win32-chromium.png` |
| launchpad | zh | `git show 895216b:tests/e2e/__screenshots__/wisetech-visual-baseline/<file>` | `launchpad-zh-desktop-1440-win32-chromium.png` | `launchpad-zh-laptop-1120-win32-chromium.png` | `launchpad-zh-tablet-820-win32-chromium.png` | `launchpad-zh-mobile-390-win32-chromium.png` |
| membership | en | `git show 895216b:tests/e2e/__screenshots__/wisetech-visual-baseline/<file>` | `membership-en-desktop-1440-win32-chromium.png` | `membership-en-laptop-1120-win32-chromium.png` | `membership-en-tablet-820-win32-chromium.png` | `membership-en-mobile-390-win32-chromium.png` |
| membership | zh | `git show 895216b:tests/e2e/__screenshots__/wisetech-visual-baseline/<file>` | `membership-zh-desktop-1440-win32-chromium.png` | `membership-zh-laptop-1120-win32-chromium.png` | `membership-zh-tablet-820-win32-chromium.png` | `membership-zh-mobile-390-win32-chromium.png` |
| news | en | `git show 895216b:tests/e2e/__screenshots__/wisetech-visual-baseline/<file>` | `news-en-desktop-1440-win32-chromium.png` | `news-en-laptop-1120-win32-chromium.png` | `news-en-tablet-820-win32-chromium.png` | `news-en-mobile-390-win32-chromium.png` |
| news | zh | `git show 895216b:tests/e2e/__screenshots__/wisetech-visual-baseline/<file>` | `news-zh-desktop-1440-win32-chromium.png` | `news-zh-laptop-1120-win32-chromium.png` | `news-zh-tablet-820-win32-chromium.png` | `news-zh-mobile-390-win32-chromium.png` |
| programs-asa | en | `git show 895216b:tests/e2e/__screenshots__/wisetech-visual-baseline/<file>` | `programs-asa-en-desktop-1440-win32-chromium.png` | `programs-asa-en-laptop-1120-win32-chromium.png` | `programs-asa-en-tablet-820-win32-chromium.png` | `programs-asa-en-mobile-390-win32-chromium.png` |
| programs-asa | zh | `git show 895216b:tests/e2e/__screenshots__/wisetech-visual-baseline/<file>` | `programs-asa-zh-desktop-1440-win32-chromium.png` | `programs-asa-zh-laptop-1120-win32-chromium.png` | `programs-asa-zh-tablet-820-win32-chromium.png` | `programs-asa-zh-mobile-390-win32-chromium.png` |
| showcase | en | `git show 895216b:tests/e2e/__screenshots__/wisetech-visual-baseline/<file>` | `showcase-en-desktop-1440-win32-chromium.png` | `showcase-en-laptop-1120-win32-chromium.png` | `showcase-en-tablet-820-win32-chromium.png` | `showcase-en-mobile-390-win32-chromium.png` |
| showcase | zh | `git show 895216b:tests/e2e/__screenshots__/wisetech-visual-baseline/<file>` | `showcase-zh-desktop-1440-win32-chromium.png` | `showcase-zh-laptop-1120-win32-chromium.png` | `showcase-zh-tablet-820-win32-chromium.png` | `showcase-zh-mobile-390-win32-chromium.png` |
| partners | en | no before (page did not exist) | `partners-en-desktop-1440-win32-chromium.png` | `partners-en-laptop-1120-win32-chromium.png` | `partners-en-tablet-820-win32-chromium.png` | `partners-en-mobile-390-win32-chromium.png` |
| partners | zh | no before (page did not exist) | `partners-zh-desktop-1440-win32-chromium.png` | `partners-zh-laptop-1120-win32-chromium.png` | `partners-zh-tablet-820-win32-chromium.png` | `partners-zh-mobile-390-win32-chromium.png` |
| programmes | en | no before (page did not exist) | `programmes-en-desktop-1440-win32-chromium.png` | `programmes-en-laptop-1120-win32-chromium.png` | `programmes-en-tablet-820-win32-chromium.png` | `programmes-en-mobile-390-win32-chromium.png` |
| programmes | zh | no before (page did not exist) | `programmes-zh-desktop-1440-win32-chromium.png` | `programmes-zh-laptop-1120-win32-chromium.png` | `programmes-zh-tablet-820-win32-chromium.png` | `programmes-zh-mobile-390-win32-chromium.png` |

Capture commits: `895216b` (WP-0, 2026-09-02) → `af97302` (WP-7). Intermediate recaptures (WP-1 colour/type drift, WP-2's single tip capture) are recorded on checklist rows 1.9 and 2.10.

## 7. Programme totals

One line per work package: pull request and the final gate its record carries (from the checklist prose and the PR bodies).

| WP | PR | Final gate as recorded |
|---|---|---|
| WP-0 Baseline, guardrails and evidence harness | [#33](https://github.com/YNWAforever/hkwtia/pull/33) | Full local gate; RED/GREEN e2e runs of the visual-baseline spec; 72 baselines committed (`895216b`) |
| WP-1 Design-system foundation | [#34](https://github.com/YNWAforever/hkwtia/pull/34) | Full local gate, RED/GREEN per task, axe re-run; baselines regenerated for colour/type drift |
| WP-2 Public shell + WP-3 Homepage | [#35](https://github.com/YNWAforever/hkwtia/pull/35) (contrast follow-up [#36](https://github.com/YNWAforever/hkwtia/pull/36)) | WP-2: 3427 unit tests, 112 e2e cases across the five shell suites plus Concierge, 72 baselines, clean lint/typecheck/build/audit/stylesheet drift. WP-3: 3478 unit tests / 407 files, clean lint/typecheck/build, `audit:strings` (194 files), `wisetech-pr3-public-pages.spec.ts` at 375/768/1024/1440 px in both locales |
| WP-4 Inner-page patterns | [#37](https://github.com/YNWAforever/hkwtia/pull/37), merged 2026-09-05 | 3584 passed / 40 skipped; clean lint/typecheck/`audit:strings`; `accessibility.spec.ts` 19/19; route-matrix + pr5 journeys 42/42; five real bugs found and fixed beyond the 24 tasks |
| WP-5 Content and asset migration tooling | [#38](https://github.com/YNWAforever/hkwtia/pull/38), merged 2026-09-05 | 3611 passed / 40 skipped; clean lint/typecheck/`audit:strings`; the import script was never executed against any database (rows 5.3 / 5.5 stay `ported` by design) |
| WP-6 Join, Portal and Admin | [#39](https://github.com/YNWAforever/hkwtia/pull/39), merged 2026-09-06 | 3706 passed / 0 failed / 40 skipped; lint 0 errors; typecheck, build, `audit:strings` clean; no browser run (row 6.7 stays `ported`) |
| WP-7 Routes, redirects, SEO, manifest | [#40](https://github.com/YNWAforever/hkwtia/pull/40), open; CI `quality` passed | `audit:strings`, lint (0 errors, 26 pre-existing warnings), typecheck, build, `npm audit` all exit 0; e2e redirects 7/7, public-shell 21/21, accessibility 19/19, route-matrix 42/42, visual baselines 88/88 |
| WP-8 Verification, evidence and gate closure | this PR | Preview read-only e2e 140/144 with the two classified causes (§3.3); Preview Lighthouse partial (§3.4); full unit suite 3768 passed / 40 skipped after `7fdb423`; the local gate on the final tip is §2 |

## 8. Open items

1. **SME plan-card contrast (`27065f2`)** — fixed on this branch; the Preview that found it predates the fix. Re-verify with `tests/e2e/accessibility.spec.ts` against WP-8's own Preview once one exists (the card only renders with a populated catalogue).
2. **Programme-card edition span (`03904e3`)** — same: re-verify `/programmes` and `/zh/programmes` on WP-8's own Preview.
3. **Lighthouse on a Preview (rows 3.19, 8.3)** — owner action: enable Vercel "Protection Bypass for Automation" or exempt Preview deployments from SSO, then rerun `npm run test:lighthouse` with `LHCI_BASE_URL`; measure SEO on a non-`noindex` target.
4. **`(join)` layout landmark** — the join route group has no `#main-content` id and no skip link, unlike the public and internal shells (landmark-contract gap; follow-up, not a WP-8 change).
5. **`/partners` on the mobile accordion** — the sixth About leaf drops off the five-leaf mobile accordion (errata E-79, accepted; reachable from the footer and the home partner wall).
6. **Earlier follow-up chips still open** — seat-invitation acceptance error codes; the admin `{placeholder}`-inside-`t()` suspicion.
7. **Unsubscribe Phase B** — on or after 2026-09-10, never before (owner; `docs/superpowers/plans/2026-09-01-unsubscribe-secret-sunset.md` Phase A moved the sunset from 2026-09-06).
8. **Lighthouse Lantern error** — Lighthouse 12.6.1 aborts with `LanternError: Invalid dependency graph created, cycle detected` on `/` (local, simulated throttling) and `/membership` (Preview); reproduce on a Linux runner and isolate which request graph forms the cycle. Until then no Lighthouse row can be verified from this workstation.
