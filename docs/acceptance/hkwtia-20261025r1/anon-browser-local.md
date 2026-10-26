# Local anonymous browser attempt — 2026-10-26

**Blocked by a repeatable local production-start redirect loop.** Build/start work; public pages never reach rendering. This is failed local acceptance evidence, not a Preview/SSO PASS. Base HEAD `45dbecbe21b153ddd0da300a783e5625f2e6a1f4`, existing branch `wtia/hkwtia-plan-r1-20261025`, PR #212 stacked on #211. [Redacted manifest](anon-browser-local-manifest.json) records commands, versions and per-UC results.

The guarded launcher validates `.env.acceptance.local` through `localAcceptanceTarget` / `verifyAcceptanceTarget` before creating the production child, against only project `dark-cake-07139424` / branch `br-restless-pond-a11dpkvd`. Its child environment is an allowlist, not the ambient environment: only system path/home/temp/language plus explicit application settings. No credentials are logged. The guard runs before setting the child's production mode; no seed guard is bypassed and no migration or seed runs. The isolated database is used for reads only. All mutation flags are absent/off, `AGENTS_ENABLED` is false, and Stripe, messaging, email and AI provider credentials are absent. No Preview secrets or real Auth secrets are supplied. Dummy distinct Auth/concierge cookie values and an Auth URL at loopback closed port 9 satisfy import/boot needs; they cannot establish a real session. Turnstile is absent. No provider-success or provider-failure response is claimed because the UI never loaded.

Node **22.23.4**, Next **16.4.3**, Playwright Chromium **149.0.7827.55**. Production `next build --webpack` and `next start` at `127.0.0.1:3212` succeeded. The focused spec explicitly uses empty cookies/origins, disables traces, rejects cross-origin browser requests and is gated by `HKWTIA_ANONYMOUS_ACCEPTANCE=true`. Both evidence runs set `PLAYWRIGHT_BASE_URL`, so neither used `next dev`. Screenshots and JSON would go under ignored `test-results/` / `.tmp/anon/`; no binaries or private logs are committed.

Initial browser run: **0 passed, 16 failed** (34.6 seconds). One retry with additional initial-hop diagnostics: **4 passed, 16 failed**, zero flaky successes (29.4 seconds). Every browser navigation failed with `net::ERR_TOO_MANY_REDIRECTS`, before headings, CTAs, screenshots, axe or keyboard assertions. The width loops attempted 375/768/1024/1440 in EN/ZH; they fail on their first `/` or `/zh` navigation, so later public paths in those loops were not visited. Separate membership, locale, concierge and directory tests also failed at navigation. Intended public coverage includes home, about, chairman, committees, membership, AI Ops, contact and members; this is a coverage plan, not achieved render evidence.

Direct HTTP corroboration: `/` returns **307 Location: /**, `/about` returns **307 Location: /about**; `/zh` returns **307 Location: /zh-HK**, then browser navigation loops. The responses include locale rewrites such as `/en/about`. Both loopback-IP and localhost Host probes reproduce the problem. Root cause is not established; production routing was not modified to make evidence pass.

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
