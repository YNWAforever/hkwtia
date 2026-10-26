# Local anonymous browser evidence — 2026-10-26

The localhost follow-up below supersedes the launcher blocker. The original failed attempt is retained here as historical evidence.

## Original failed attempt (retained)

**Blocked by a repeatable local production-start redirect loop.** Build/start work; public pages never reach rendering. This is failed local acceptance evidence, not a Preview/SSO PASS. Base HEAD `45dbecbe21b153ddd0da300a783e5625f2e6a1f4`, existing branch `wtia/hkwtia-plan-r1-20261025`, PR #212 stacked on #211. [Redacted manifest](anon-browser-local-manifest.json) records commands, versions and per-UC results.

The guarded launcher validates `.env.acceptance.local` through `localAcceptanceTarget` / `verifyAcceptanceTarget` before creating the production child, against only project `dark-cake-07139424` / branch `br-restless-pond-a11dpkvd`. Its child environment is an allowlist, not the ambient environment: only system path/home/temp/language plus explicit application settings. No credentials are logged. The guard runs before setting the child's production mode; no seed guard is bypassed and no migration or seed runs. The isolated database is used for reads only. All mutation flags are absent/off, `AGENTS_ENABLED` is false, and Stripe, messaging, email and AI provider credentials are absent. No Preview secrets or real Auth secrets are supplied. Dummy distinct Auth/concierge cookie values and an Auth URL at loopback closed port 9 satisfy import/boot needs; they cannot establish a real session. Turnstile is absent. No provider-success or provider-failure response is claimed because the UI never loaded.

Node **22.23.4**, Next **16.4.3**, Playwright Chromium **149.0.7827.55**. Production `next build --webpack` and `next start` at `127.0.0.1:3212` succeeded. The focused spec explicitly uses empty cookies/origins, disables traces, rejects cross-origin browser requests and is gated by `HKWTIA_ANONYMOUS_ACCEPTANCE=true`. Both evidence runs set `PLAYWRIGHT_BASE_URL`, so neither used `next dev`. Screenshots and JSON would go under ignored `test-results/` / `.tmp/anon/`; no binaries or private logs are committed.

Initial browser run: **0 passed, 16 failed** (34.6 seconds). One retry with additional initial-hop diagnostics: **4 passed, 16 failed**, zero flaky successes (29.4 seconds). Every browser navigation failed with `net::ERR_TOO_MANY_REDIRECTS`, before headings, CTAs, screenshots, axe or keyboard assertions. The width loops attempted 375/768/1024/1440 in EN/ZH; they fail on their first `/` or `/zh` navigation, so later public paths in those loops were not visited. Separate membership, locale, concierge and directory tests also failed at navigation. Intended public coverage includes home, about, chairman, committees, membership, AI Ops, contact and members; this is a coverage plan, not achieved render evidence.

Direct HTTP corroboration: `/` returns **307 Location: /**, `/about` returns **307 Location: /about**; `/zh` returns **307 Location: /zh-HK**, then browser navigation loops. The responses include locale rewrites such as `/en/about`. Both loopback-IP and localhost Host probes reproduce the problem. Root cause was unknown during this attempt (now verified as the launcher origin mismatch below); production routing was not modified to make evidence pass.

The four successful request-context diagnostics use `maxRedirects: 0` and verify eight paths: `/admin`, `/admin/members`, `/portal`, `/portal/company`, and their `/zh` equivalents. Each returns **307**, a same-origin locale-correct `/admin-login` or `/member-login`, and the exact unprefixed `next=` destination. This establishes the initial anonymous boundary only; following those redirects fails at login rendering. It proves no authenticated access, session handling or full protected-route browser journey.

The read-only directory preflight found exactly one existing synthetic fixture company, with `directory_visible=false` and unpublished public status. No fixture was created or changed. Public directory navigation loops, so **absence from the public directory is not proven**. Independently, no Stripe price IDs are configured: the paid-tier catalog requires matching configured IDs, so a populated four-tier visual pass cannot be assumed even after the loop is resolved.

| UC | Local result | Inventory old → new |
| --- | --- | --- |
| UC22-01 | BLOCKED: public render loops | NOT RUN → BLOCKED |
| UC22-03 | BLOCKED: no comparison render; price IDs absent | PARTIAL → PARTIAL |
| UC22-04 | BLOCKED: seats/help/anchor not reached | PARTIAL → PARTIAL |
| UC22-05 | BLOCKED: locale round-trip not reached | PARTIAL → PARTIAL |
| UC22-07 | PARTIAL: initial admin 307 verified; destination loops | PARTIAL → PARTIAL |
| UC22-08 | PARTIAL: initial portal 307 verified; destination loops | PARTIAL → PARTIAL |
| UC22-09 | BLOCKED: help/CTA visual not reached | PARTIAL → PARTIAL |
| UC22-34 | BLOCKED: hidden DB precondition verified; public absence unproven | PARTIAL → PARTIAL |
| UC22-52 | BLOCKED: disabled-provider UI/503 not reached | PARTIAL → PARTIAL |
| UC22-55 | BLOCKED: width navigation fails; keyboard/axe/screen reader NOT_TESTED | PARTIAL → PARTIAL |
| UC22-57 | NOT RUN: LHCI omitted after failed browser pass; field INP NOT_TESTED | NOT RUN → NOT RUN |

Existing PARTIAL statuses retain prior offline/isolated-DB evidence; the failed local browser layer adds no full-UC PASS. Counts are now **0 PASS, 44 PARTIAL, 15 BLOCKED, 1 NOT RUN**. Deployment, Preview/SSO and remote CI remain unverified. The skipped acceptance scaffold still cannot yield PASS and needed no mapping changes.

Local checks: full `npm test` under Node 22 **7,984 passed / 659 skipped / zero failures**, 909 passed files / 118 skipped. Typecheck passes; lint passes with 77 existing warnings and zero errors. Build passes; generated `next-env.d.ts` is restored. The ordinary flag-off focused run with an explicit loopback base skips all 20 cases. Earlier excluded setup attempts are listed in the manifest, including one gate check that omitted the base URL and failed in managed-server setup before tests. They are not acceptance evidence. No application behavior changed, so there is no product red/green claim; the browser assertions remained red and are reported as such.

Server stopped after evidence collection. No new branch/PR, merge, manual deployment, production/preview database, Stripe, provider calls or fixture mutations. `stacked-ci-trigger.patch` remains untouched. Next action: diagnose the local production routing loop, then rerun this gated suite using the same guarded target. No Lighthouse numbers are available.


## Localhost follow-up — 2026-10-26

Continued from `37887794ed21e4c71a74bcc906d6c9321a61090d`, same branch/PR. Verified the parent diagnosis before the fix: an IP-origin request returned 307 `Location: /` with `x-middleware-rewrite: http://localhost:3212/en`. Next treated the differing origin as an external proxy rewrite and re-entered the as-needed locale redirect. The launcher now derives hostname, port, APP_URL, NEXT_PUBLIC_SITE_URL and child PLAYWRIGHT_BASE_URL from `http://localhost:3212`. Guarded rebuild succeeded with this inlined public origin; the rebuilt server returns 200 and relative rewrite `/en`. This fixes the launcher, with no production routing change.

The original failed runs above remain failures. First complete localhost replay: **17 passed / 3 failed**, 179.4s. Final replay after making only the axe and four-tier assertions soft: **15 passed / 5 failed**, 94.2s, no skips or flaky successes. Soft assertions retain failures and let subsequent checks run. All **64** public path/locale/width combinations reached 200 with one visible h1, main landmark, no horizontal overflow, keyboard skip-link focus/Enter, screenshots and axe observations. The eight paths and four widths are listed above. Ignored raw outputs: `.tmp/anon/browser-localhost-first.json`, `.tmp/anon/browser-localhost-final.json`, `test-results/`. The manifest contains compact per-page observations.

Findings remain unresolved: serious axe `color-contrast` on the home CTA (first run EN 768; final EN 768, ZH 375 and ZH 1024). First finding: “Find your route”, foreground `#96b0c7` on `#154e82`, ratio 3.81 against required 4.5. Variable affected widths across runs mean this is observed runtime evidence, not a complete contrast diagnosis. No styles or animation behavior were modified. Both locale catalog cases still fail the four-tier assertion: only Community/Patron appear because Startup/Corporate require deliberately absent Stripe price IDs. Available tier headings, plans anchor, FAQ and contact help all execute successfully afterward. These are failed requirements, never converted to skips or PASS.

Both locale protected journeys reach rendered admin/member login pages; eight initial HTTP redirects still preserve exact next destinations. Locale switching retains query/hash. Disabled concierge returns 503 with localized manual fallback in both locales, without provider calls. Read-only preflight plus healthy EN/ZH directory renders prove the existing hidden/unpublished company is absent locally. No real Auth, write flags, fixture changes, deployment, new PR or CI patch application.

### UC inventory reconciliation

| UC | Old → new | Proven locally / limits |
| --- | --- | --- |
| UC22-01 | BLOCKED → PARTIAL | EN/ZH eight public paths render across four widths; local only, Preview/SSO unverified. |
| UC22-03 | PARTIAL → PARTIAL | Community/Patron render; four-tier assertion remains red: Startup/Corporate unavailable without deliberately absent Stripe price IDs. |
| UC22-04 | PARTIAL → PARTIAL | Rendered tier headings, plans anchor, FAQ and contact help checked in both locales; paid seats/checkout remain unverified. |
| UC22-05 | PARTIAL → PARTIAL | Locale round-trip retains query/hash and localized contact hrefs. |
| UC22-07 | PARTIAL → PARTIAL | Anonymous admin routes redirect to rendered locale-correct login; initial 307 preserves exact next. No real Auth. |
| UC22-08 | PARTIAL → PARTIAL | Anonymous portal routes redirect to rendered locale-correct login; initial 307 preserves exact next. No real Auth. |
| UC22-09 | PARTIAL → PARTIAL | Membership plans anchor, FAQ and manual contact link exercised in both locales. |
| UC22-34 | PARTIAL → PARTIAL | Existing hidden/unpublished synthetic company absent from healthy EN/ZH directory; preflight read-only, no fixture writes. |
| UC22-52 | PARTIAL → PARTIAL | Disabled concierge POST returns 503 and localized alert/manual support link in EN/ZH; no provider calls. |
| UC22-55 | PARTIAL → PARTIAL | Four-width render/overflow/skip-link/axe checks executed; observed serious home CTA contrast finding. Screen reader NOT_TESTED. |
| UC22-57 | NOT RUN → PARTIAL | Three-run local LHCI per ten public EN/ZH URLs; median LCP/CLS/TBT recorded. Field INP NOT_TESTED; no Preview performance PASS. |

Counts now **0 PASS, 46 PARTIAL, 14 BLOCKED, 0 NOT RUN**. Local anonymous evidence does not establish Preview/SSO or full-UC acceptance.

### UC22-57 local Lighthouse lab

`lhci collect --config=lighthouserc.js` with explicit `LHCI_BASE_URL=http://localhost:3212` and Playwright Chromium executable completed **3 runs for each of 10 URLs**, 30 reports. No upload, cookie, real session, provider or deployment. Default mobile simulated Lighthouse settings from the config; parts ran concurrently with browser/unit/typecheck/lint on this shared host. Results are loaded local lab observations, not controlled-device, Preview or production performance acceptance. **Field INP NOT_TESTED**. No LHCI assertion/category PASS is claimed.

| URL | Median LCP ms | Median CLS | Median TBT ms |
| --- | ---: | ---: | ---: |
| /programmes | 2487.7 | 0 | 98.0 |
| /zh/events | 2866.0 | 0 | 41.5 |
| /events | 2925.6 | 0 | 150 |
| /zh/programmes | 2710.8 | 0 | 82 |
| / | 2937.5 | 0 | 527.5 |
| /zh/membership | 2334.9 | 0 | 68 |
| /zh/partners | 2417.1 | 0 | 84 |
| /membership | 2567.9 | 0 | 178 |
| /zh | 2940.5 | 0 | 152 |
| /partners | 2712.5 | 0 | 77 |

Final checks under Node 22.23.4: full `npm test` **7,984 passed / 659 skipped / 0 failed**, 909 passed files / 118 skipped; typecheck PASS, lint 0 errors / 77 existing warnings; guarded production build PASS. Typecheck/lint repeated after restoring `next-env.d.ts`. Browser suite remains red as detailed above. Server stopped after collection, including the prior diagnostic localhost listener. No manual deployment or merge; push may trigger existing automation, whose result is not verified. Remaining gates: contrast findings, full four-tier/paid flows, real identities, Stripe test, provider/sink, screen reader, controlled/field performance, Preview/SSO and remote exact-head CI.
