# R2 offline continuation — 2026-10-26

Started on `wtia/hkwtia-plan-r1-20261025` at `fcc1a278d5f1f2fb869b5c804328e9189ccb8456`, using the authoritative product-development plan v2. This record supplements, rather than replaces, the historical R1 evidence. No historical test result is counted as current evidence.

| Task | Code | Tests | Deployment | Runtime |
| --- | --- | --- | --- | --- |
| T22-04A | Migration 0066; scoped SQL supplement repository and atomic requests/responses/receipts/audits | **PASS**: five original gated Neon cases; [superseding evidence](t22-04a.md) | Not deployed | **Isolated DB PASS**; Auth/HTTP/browser remains **BLOCKED** |
| T22-06 | Owner-scoped page/detail, tuple keyset query and composite index 0067; unbounded `listOwned` retained | **PASS**: five gated Neon cases with 10,001 owned rows and first/deep EXPLAIN; [superseding evidence](t22-06.md) | Not deployed | **Isolated DB PASS**; real Auth/browser, Stripe and sink remain **BLOCKED** |
| T-MP08 | Partial: `listApproved` version/publication/plan reader contract; owner source remains empty | Unit owner/seat/outsider, draft/published/withdrawn and v1/v2 controls; [current slice](r2-resources-binding.md) | Not deployed | **BLOCKED**: owner materials, private CMS/source and protected byte delivery; no resource DB/download PASS |
| T-MP10 | Versioned existing self-service link/copy contract consumed by membership page; membership refund entitlement and review SLA explicitly `unknown` | Real EN/ZH message keys, links, existing qualifications, empty association-policy registry and prior policy selection tests | Not deployed | **BLOCKED**: no new policy approval or live self-service acceptance claimed |
| T22-02 | Verified isolated Neon child target, guarded migration and deterministic synthetic fixtures | **PASS**: target refusal controls, replay/cleanup and A/B scoped SQL; [superseding evidence](t22-02.md) | Not deployed | **Isolated DB PASS**; real Auth sessions, Stripe test and notification sink **BLOCKED** |
| T22-04B binding | Disabled-by-default actor-resolving actions, SQL-backed binding seam and unmounted bound forms | Bilingual jsdom uses binding; action/gate units and synthetic SQL binding acceptance; [current slice](r2-resources-binding.md) | Not deployed; flag not enabled | Authenticated HTTP/browser round trip **BLOCKED** |
| T22-08 stretch | Submitted queue shortcut using existing routes; original daily-work data/case links retained | EN/ZH navigation and dashboard ordering unit tests | Not deployed | **BLOCKED**: staff study and browser task acceptance |
| T22-13 prep | Three-run LHCI configuration and HK midnight date/device-control contracts | Offline date/config/jsdom contracts | Not deployed | **BLOCKED**: real Lighthouse/RUM, four-width browser matrix and private performance |

## Current slice — resources and supplement binding

[Resources/binding evidence](r2-resources-binding.md) records the current code/test scope. T-MP08 now has a version/publication/plan authorization contract reused through `listApproved`; the owner source remains empty. It is **partial**, with no private byte storage, download route, resource editor or owner content acceptance claimed. T22-04B has a concrete disabled Server Action → server-only binding → SQL repository path and unmounted bound form wrappers. Auth/HTTP/browser acceptance remains blocked.

The summary rows above reflect superseding T22-02/04A/06 evidence; the sections below are historical observations for their stated commits. Their missing-schema/target/index statements no longer describe the current checkout.

## Implementation boundaries

`lib/membership/supplement-service.ts` exposes a repository-injected service factory with the seven plan-named operations. It is **not** a Server Action, a default database repository, or a runtime-enabled feature. Future HTTP/Server Action entrypoints must establish their own actor and preserve an explicit feature gate. No flag was enabled or environment configuration changed. No migration draft was added or applied.

The offline port exposes a transaction snapshot for fake-repository verification. It is not a scalable SQL adapter: the production implementation must use scoped reads/writes, atomic audit/receipt storage, serialization and a database partial uniqueness constraint over published/responded requests. The fake repository demonstrates the service contract under that serialization assumption; it cannot establish PostgreSQL durability, locking or rollback behavior.

Only exact `staff` actors mutate requests; only the application applicant (`member.profileId`) responds/lists, independent of company ownership. Mutation results distinguish saved/conflict/unknown/validation/forbidden. Unknown results retain retry answers and operationRequestId; receipt lookup never invents a successful commit. Retry the same key/payload after lookup; do not treat unknown as permission to start another operation. Business request IDs and operationRequestIds remain distinct.

Drafts cancelled before publication remain invisible. Published responded/closed/cancelled requests retain member-readable history and answers. Internal context and cancellation reasons are not projected. Historical reads are independent of application actionability and future write enablement. No replacement of company/profile data, automatic membership approval, file upload, email or WhatsApp send was introduced.

Paging defaults to 20, caps at 50 and fetches limit+1. The cursor binds version, owned-query scope, applicant, exact UTC PostgreSQL microsecond timestamp and UUID; SQL enforces applicant ownership separately. It is a live keyset, not snapshot isolation: updated rows may reorder after refresh. Detail failures remain errors, distinct from a missing/foreign record. The portal now pages; join-resume retains its complete owned history.

The self-service contract versions shipped link/copy facts only. It does not populate `MEMBERSHIP_POLICIES`, approve legal terms, promise refunds or review deadlines, or alter Stripe state machines. EN/ZH paging strings were added together; existing membership policy copy was reused unchanged.

## Test-first and review evidence

- Supplement placeholders returned unknown: 15 behavioral failures (saved/validation/authorization expectations); implementation then passed. The initial missing-operation smoke was not used as sufficient behavioral evidence.
- Paging placeholder: five intended behavior failures (limit+1, scoped cursor, detail read and authorization). SQL-adapter stub: two failures because no query executed; portal regression failed because detail still listed all history. Implemented and reran green.
- Policy contract placeholder failed its missing version assertion before adding the version/unknown fields. Existing bilingual facts were verified against shipped bundles.
- Portal paging: three new failures for ignored cursor/missing navigation and repeated-cursor recovery before wiring the page.
- Independent read-only review found unpublished draft cancellation exposure. Added regression, observed the cancelled draft in the member result, required publication evidence and reran green. Cross-operation idempotency coverage uses a valid transition payload and rejects key reuse.
- First broad suite: 896 files passed, one failed, 113 skipped; 7,898 passed, eight failed, 643 skipped. All eight failures came from the application-security UI repository mock missing the new detail method. Updated it to the new read contracts while retaining hostile foreign rows and assertions; focused security tests pass. This first run is **FAIL**, not acceptance PASS.

## Final checks

Tested product HEAD: `61b74c6c61647f13e7a5d27f05a9062a45b337e4`. Final focused suite: **91 passed / 9 files**. Full suite: **7,910 passed / 643 skipped**, 897 files passed / 113 skipped, exit 0, no unhandled errors. Build (Next 16.4.3), typecheck, lint (0 errors / 77 warnings), visible strings (357 TSX files) and diff checks all exit 0. Build-generated `next-env.d.ts` path changes were restored. Exact commands and commit references are recorded in `r2-verification.json`. Worker/dependency audits were not rerun: those source areas were unchanged and their historical evidence remains separate. No browser matrix, real identity, integration, deployment or provider PASS is implied by jsdom, SQL rendering or fake transaction tests.

## Remaining gates and recommended next slice

T22-02 isolated DB verification, supplement migration 0066/persistence and paging migration 0067/10k EXPLAIN acceptance have superseding PASS evidence linked above. They do not need rebuilding. Next: obtain verified real A/B/staff Auth sessions, exercise the gated action and form round trip on the isolated target, then mount the bound forms after authorization/read projection review. Keep the write flag disabled until that gate. Obtain approved owner resource materials and agree private document storage/type/retention limits before implementing private delivery and its SQL/CMS publish workflow. Stripe test, notification sink, real browser/device/lab/RUM and exact-head remote CI remain independent gates.

PR #212 remains stacked on #211. Its base is excluded by the existing CI trigger; the earlier workflow-scope rejection and unapplied `stacked-ci-trigger.patch` remain unresolved. Local checks do not establish exact-head remote CI acceptance. No merge, manual deployment, promotion, production writes, Neon fixture seed, live Stripe or messaging was performed.


## R2 UI stretch follow-up

Continued from `3c66cb4e` on 2026-10-26. See [r2-ui-stretch.md](r2-ui-stretch.md) for the current four-layer scope, test-first evidence, device/measurement protocol and recovery limitations, and `r2-ui-verification.json` for exact commands/results. The prior “Final checks” above remain historical evidence for the earlier slice. New components remain unmounted offline scaffolding; implementing feature-gated authenticated binding and receipt reconciliation still follows the verified T22-02 environment and supplement persistence adapter. No real browser, database, deployment, Lighthouse or RUM PASS is added by this follow-up.

## T22-02 DB acceptance follow-up

[T22-02 target/fixture evidence](t22-02.md) supersedes the prior blanket Neon blocker for the explicitly verified isolated child branch only. Guarded migration and synthetic fixture replay/cleanup/readback passed; A/B scoped SQL reads and NONSTAFF pure authorization passed with zero observed row changes. Auth/HTTP/server-action, Stripe test and notification sink remain BLOCKED. This does not complete supplement persistence, real identity UAT, paging performance, deployment or remote CI acceptance.

## T22-04A SQL persistence follow-up — 2026-10-26

[T22-04A persistence evidence](t22-04a.md) supersedes the earlier persistence/schema blocker for this slice. Incremental migration 0066 and an injectable scoped repository now persist requests, responses, actor-scoped receipts and existing audit events atomically. Five gated PostgreSQL cases pass on the T22-02 authorized child branch, including distinct-staff concurrency, direct unique-index violation, migration over existing rows, lost-response reconciliation and audit-failure rollback. Synthetic actors do not establish Auth/HTTP/browser acceptance. Mounted UI, actual sessions, Stripe and sink acceptance remain blocked; no manual deployment or merge.

## T22-06 verified database follow-up — 2026-10-26

[T22-06 evidence](t22-06.md) supersedes the earlier PostgreSQL/index/performance pending claims for owned paging. A 10k bulk fixture was affordable. Migration 0067 and index-compatible tuple SQL reduce first/deep paging to 21 index rows with no sort. Five gated cases pass and cleanup verifies absence. This does not establish Auth/browser or production acceptance.

## T22-07 offline inventory — 2026-10-26

[T22-07 inventory](t22-07-inventory.md) / [JSON](t22-07-inventory.json) maps UC22-01–60 to current offline/isolated-DB evidence: **0 PASS, 44 PARTIAL, 14 BLOCKED, 2 NOT RUN**. Focused offline rerun of all cited suites: 106 files, 1,235 passed / 0 failed / 3 skipped. Per-UC themes are inferred from plan §7 because the original Test_Cases.csv is not in the repo. This is not the T22-07 acceptance run; Auth/HTTP/browser, Stripe test, sink, T-MP08/10/12 and remote CI remain open.


## UC22-42/43 — PostgreSQL same-ID-set acceptance (2026-10-26)

Continued from `eecb0cfe` on the existing PR #212 branch, stacked on #211. [Evidence](uc22-42-43.md) and [redacted manifest](uc22-42-43-manifest.json) record two final gated WebSocket PostgreSQL runs (1/1 passed each) against only verified project `dark-cake-07139424` / branch `br-restless-pond-a11dpkvd`. Eight run-derived application UUIDs cover every real status, equal-count draft near misses and tied microsecond timestamps. Real dashboard counts and queue readers execute against the same repeatable-read fixture. The actual dashboard predicate's scoped diagnostic ID projection equals the expected three IDs and the queue's exact set; the dashboard count delta is three. Limit-one pages in both directions have no missing or duplicated IDs. Exact-ID cleanup and post-rollback absence readbacks pass.

Temporarily replacing submitted statuses with draft preserved the count of three but failed the exact dashboard-ID assertion (observed red, exit 1). Restored production code passes; no bypass remains. Production code is unchanged. No write flags, supplement mounts, real Auth sessions, other target, Stripe, messaging or deployment operations were used. Synthetic actor objects are authorization inputs only, never sessions.

Local Node 22 checks: focused queue/dashboard units **8 passed / 4 files**; full `npm test` **7,976 passed / 658 skipped / 0 failed**, 906 passed files and 117 skipped files; typecheck, lint and build **PASS**. Exact commands and two run manifests are linked above. Build-generated `next-env.d.ts` changes were restored and typecheck repeated successfully.

Four layers: **Code PASS** (test/docs; existing production paths exercised), **Tests PASS**, **Deployment NOT RUN** (push can trigger existing Preview automation), **Runtime isolated DB PASS; real staff Auth and authenticated HTTP/browser BLOCKED**. UC22-42/43 and REG-submitted-id-set remain **PARTIAL**. No Auth/browser PASS or remote exact-head CI result is claimed. Remaining R2 owner, Stripe/provider and browser gates are unchanged.


## UC22-56 — isolated database timing (2026-10-26)

Continued from `6afe4cf2` on the existing PR #212 branch, stacked on #211. [DB-only evidence](uc22-56.md) and [redacted manifest](uc22-56-manifest.json) record two complete successful timing runs on only verified project `dark-cake-07139424` / branch `br-restless-pond-a11dpkvd`: 1,001 and 10,001 owned rows, 30 warm and 30 fresh-connection samples per production first/deep/detail reader per scale (720 accepted timed calls total), p50/p95/max, serialized bytes and actual EXPLAIN ANALYZE/BUFFERS plans. Cold means a new WebSocket/client connection to the pooled endpoint; compute/backends/buffers may stay warm. No suspended-compute or HTTP/browser claim. Exact generated application IDs and fixture manifest were cleaned up with absence readbacks in both runs.

The shared T22-06 bulk fixture now runs normal ANALYZE after insertion. An observed existing-plan regression (8-row estimate, 10,001 scanned plus sort) failed before this fixture-statistics correction and passed afterward. The first timing attempt failed its cleanup readback bind shape after deletes; it is excluded from accepted results. An intermediate repeat failed a fresh WebSocket handshake after seven groups; its cleanup readback passed, its partial timings are excluded, and a clean full retry passed without sample-level retries. At 1k, the planner may choose a scan/sort for a deep page; actual plans, including filter removals, are retained. Connection-inclusive p95 exceeded 2s in some first-run cases even though every reader-only p95 passed the lenient 2s guard. See both run summaries rather than treating this as a production SLO.

Final Node 22 checks: focused **23 passed**; existing gated paging **5 passed**; timing **1 passed in each of two runs**; full suite **7,978 passed / 659 skipped**, zero failures; typecheck, lint (0 errors / 77 existing warnings), build, strings audit (360 TSX files) and diff check passed. Code commit `aaed8109` changes test/helper code only. No write flags, supplement mounts, real Auth sessions, other targets, provider calls, merge or deployment.

Four layers: **Code PASS**, **Tests PASS**, **Deployment NOT RUN** (push only; remote exact-head CI/Preview unverified), **Runtime isolated DB timing PASS; real Auth and authenticated HTTP/browser p95 BLOCKED**. UC22-56 remains **PARTIAL**, and the inventory's next step no longer calls the DB timing unrun. Other R2 owner, Stripe, sink and browser gates remain open.

## UC22-56 retry hardening — 2026-10-26

[Retry hardening evidence](uc22-56.md#retry-hardening) / [manifest](uc22-56-manifest.json) adds bounded connection-only retries, per-group handshake/exhaustion counts, successful-attempt latency statistics (no imputation), unique ignored raw run/recovery manifests and fresh-pool exact-ID cleanup. Two new full isolated DB replays passed (12 groups / 360 samples each): 0 handshake failures, 0 retried successes, 0 exhausted samples and 0 idle errors in each; 5 infrastructure connection attempts each, no failures. All exact application/profile/company absence checks passed. Cold total p95 ranges: replay 1 1475.1–1731.3 ms; replay 2 1275.2–1642.1 ms. Prior >2s cold totals and missing authenticated HTTP/browser evidence remain material; **UC22-56 status stays PARTIAL**. Original accepted raw output was preserved.

Node 22: focused units 38 passed; gated owned-applications 5 passed; timing 1 passed in each replay; full suite 7,982 passed / 659 skipped / 0 failed; typecheck, lint (77 existing warnings), build and diff check passed. Retry classifier/backoff and failed-pool closure have observed behavioral red/green evidence. No Auth, new branch/PR, or deployment performed.

## Local anonymous browser attempt — 2026-10-26

Continued from `45dbecbe` on the same PR #212 branch. [Evidence](anon-browser-local.md) / [manifest](anon-browser-local-manifest.json) record a successful guarded isolated-target production build/start, followed by a failed browser run (0/16) and one retry (4 initial-hop HTTP checks passed, 16 browser navigations failed). Public and login routes loop with `ERR_TOO_MANY_REDIRECTS`; no rendered width/keyboard/axe/concierge/directory-absence evidence or LHCI numbers. Eight initial admin/portal redirects preserve locale and exact next destination. A read-only existing-fixture check confirms hidden/unpublished company state but cannot prove public absence. No new fixture writes, real identity, Stripe, provider or deployment acceptance.

UC22-01 NOT RUN → BLOCKED; other targeted statuses unchanged. Inventory now **0 PASS, 44 PARTIAL, 15 BLOCKED, 1 NOT RUN**; JSON carries per-UC `localBrowserEvidence`. Node 22 full unit suite **7,984 passed / 659 skipped**, typecheck/lint pass (77 existing warnings), build passes; generated `next-env.d.ts` restored. Server stopped. Preview/SSO and remote CI remain unverified; billing blocker and unapplied CI trigger patch remain. Production routing was not modified to conceal the observed failure.


## Anonymous localhost launcher and UC22-57 follow-up — 2026-10-26

Continued from `37887794` on PR #212. [Evidence](anon-browser-local.md#localhost-follow-up--2026-10-26) / [manifest](anon-browser-local-manifest.json) verifies the prior redirect loop came from the launcher IP/localhost origin mismatch. Guarded launcher now derives bind/advertised origin consistently; rebuilt runtime returns 200 with relative rewrite. No production routing changed. Original failed runs remain documented.

Final anonymous Chromium replay: **15 passed / 5 failed**, all 64 EN/ZH page/width combinations rendered and checked. Unresolved serious home CTA contrast observations and absent paid-tier configuration remain red; help/anchors, login boundaries, locale/query/hash, disabled concierge 503/manual fallback and hidden-company exclusion verified locally. LHCI collect completed 30 reports (three runs per ten public URLs); per-URL median LCP/CLS/TBT in evidence, shared-host local lab only; field INP and screen reader NOT_TESTED. UC22-01 BLOCKED → PARTIAL, UC22-57 NOT RUN → PARTIAL; others remain PARTIAL. Inventory: **0 PASS, 46 PARTIAL, 14 BLOCKED, 0 NOT RUN**.

Node 22 full units 7,984 passed / 659 skipped, zero failures; build/typecheck/lint pass (77 existing warnings). Generated next-env.d.ts restored, typecheck/lint repeated. Server stopped; no real Auth, writes, providers, manual deployment, new PR or stacked-ci-trigger.patch application. Preview/SSO and exact-head remote CI remain unverified.


## Home CTA animation measurement — 2026-10-26

Continued from `cd84a012` on PR #212. [Evidence](anon-browser-local.md#settled-cta-contrast-replay--2026-10-26) / manifest `settledContrastRun` verifies the exact 3.81 axe sample at ancestor opacity 0.552; settled white/#1a4f82 is 8.452:1, hover 8.857:1. No CSS change. New settled assertion failed under a temporary real mid-animation probe before the bounded finite-animation wait was added. Final anonymous replay **20 passed / 2 failed**: all 64 public axe scans, eight home width/locale contrast checks and two reduced-motion home checks clear. Only unchanged paid-tier catalog assertions fail. Three-run LHCI repeated for the same ten URLs; medians in evidence. UC22-01/55/57 and paid-tier finding remain PARTIAL; inventory **0 PASS / 46 PARTIAL / 14 BLOCKED / 0 NOT RUN**. Screen reader, Preview/SSO/deployment, real Auth, Stripe, providers/sink and field INP remain open.

Node 22: full units **7,984 passed / 659 skipped / zero failures**, typecheck/lint green (77 existing warnings), guarded build green; next-env.d.ts restored, server stopped with no port 3212 listener. Same branch, no new PR, Auth, write flags, deployment or stacked-ci-trigger.patch application. Remote exact-head CI remains unverified.


## Movement-only home CTA entrance — 2026-10-26

Approved CSS fix `cafee809`: hero-actions retains movement/timing and full opacity (WCAG 1.4.3). [Evidence](anon-browser-local.md#movement-only-cta-entrance--2026-10-26) / manifest `movementOnlyEntranceRun`: old CSS failed new assertion with opacity 0; focused replay 8/8 green; full anonymous suite **28 passed / 2 failed** (unchanged paid-tier configuration failures). All 32 paused samples across four widths × EN/ZH at 0/450/600/800ms: every CTA ancestor opacity 1, white/#1a4f82 **8.451873:1**; eight paused hero axe scans clear. Existing 64 settled public scans and reduced-motion checks remain clear. Same-config three-run LHCI per ten URLs repeated; medians in linked evidence. Node 22 units **7,986 passed / 659 skipped**, typecheck/lint/build green (77 existing lint warnings); next-env.d.ts restored, server stopped, no listener on 3212.

UC22-01/55/57 and paid-tier finding remain **PARTIAL**. Inventory **0 PASS / 46 PARTIAL / 14 BLOCKED / 0 NOT RUN**. Preview/SSO, screen reader, real devices, controlled performance/field INP, Auth, Stripe/provider acceptance and exact-head remote CI remain open. Same branch/PR, no deployment, Auth, write flags, fixture changes or CI patch application.


## Live member B Auth/browser UAT — 2026-10-26

[Evidence](auth-browser-live-member-b.md): member B signed in by Neon Auth magic link on live production `https://hkwtia.vercel.app` (no Deployment Protection wall; Google also offered; no passwords used). Deployed code is `release@6833eb9a` (main@3eb9992d) — existing-feature evidence, not PR #212 exact-head. Read-only: /portal Community ACTIVE 1 seat, own applications (Community Complete / Startup Draft), profile unsaved, tier gates on company/tools, empty seats/events/directory/documents, billing ACTIVE; `/admin` refused for member B. UC22-12/13 BLOCKED → PARTIAL; inventory **0 PASS / 48 PARTIAL / 12 BLOCKED / 0 NOT RUN**. Open: member A and staff D magic links (gmail.com inbox not connected), B-vs-A comparison, staff positive control, zero-write readback, `next=` via magic link, exact-head deployment, screen reader, Stripe. No writes, deployment, write flags or CI patch application.


## Live member A magic-link finding — 2026-10-26

[Finding](auth-browser-live-member-b.md#member-a-magic-link-attempt--2026-10-26-finding): production (`release@6833eb9a`, not PR #212). Reused B token → `INVALID_TOKEN` (expected). Two fresh A links: Neon verify succeeds → `/member-login?next=/portal&neon_auth_session_verifier=…` never clears (~45 s); `/portal` redirects to login; no A session. Google OAuth not tried; root cause not determined. UC22-11 BLOCKED, UC22-12 PARTIAL; inventory unchanged **0 PASS / 48 PARTIAL / 12 BLOCKED**. Docs only.

## Member A verifier exchange fix — 2026-10-26 (not deployed)

[Code diagnosis and retest](auth-browser-live-member-b.md#root-cause-and-fix-branch-not-deployed), manifest `memberAAttempt.branchFix`: baseline `488d220a` and production ancestor `main@3eb9992d` both suppress exchange on session-cookie presence. This reproduces the same-browser failure mechanism; live cookies were not captured. PR #212 now exchanges supplied verifiers despite old cookies, isolating the old token/cache from the SDK's cache and upstream request. Success relays both cookies and removes the verifier; refusal/outage retains existing fallthrough. Hosted verifier replay semantics remain unverified. Profile/role checks occur later and cannot suppress exchange; normal sign-out delegates token deletion to Neon and the SDK pairs it with cache deletion. No production reads, writes, deployment, write flags, new PR or stacked CI patch.

Node 22 evidence: new proxy regressions **2 failed / 8 passed** on old code (upstream never called), then proxy/login-resolution/actions **25 passed**; additional member-login-page/login-resolution-server/portal-layout **20 passed**. Full `npx -y -p node@22 npm test`: **910 files passed / 118 skipped; 7,987 tests passed / 659 skipped**. Build passed; generated `next-env.d.ts` restored. Typecheck rerun sequentially after build passed (the first concurrent attempt raced build's generated types). Lint passed (0 errors; repository warnings remain). A new unused mock-argument warning was removed with an explicitly typed exchange mock; focused checks rerun. No application server started; skipped integration checks are not live acceptance evidence.

UC22-11 stays **BLOCKED**: **Fix on PR #212 not deployed**, production is older, and A's session never established. Inventory JSON and Markdown blocker index updated; counts remain **0 PASS / 48 PARTIAL / 12 BLOCKED / 0 NOT RUN**. Retest fresh A and same-browser-after-B on a deployment of this branch. Clearing site cookies/private-window plus a fresh link is only a code-derived workaround on current production.

## Live member A Auth/browser UAT (Google) — 2026-10-27

[Evidence](auth-browser-live-member-a.md) / [manifest](auth-browser-live-member-a-manifest.json): production `release@6833eb9a` (re-verified `dpl_5TMerrJ1oURQsBYhau8cNrUHCLmi`; older than PR #212, fix `a34a631c` **not deployed**). Clean cookie jar; automated member A magic-link send produced no request, so Willy signed A in **via Google** in the box browser. Read-only: `/portal` Corporate **PAYMENT PENDING** 25 seats; profile (display name "WTIA member" vs chip "Test", job title Test, phone/WhatsApp present, directory off); company "Test" HIDDEN; seats page "Seat access is unavailable…" despite 25 seats; billing PAYMENT PENDING with Continue payment **not clicked**; `/admin` → `/admin-login` refusal; session sticky throughout. Magic-link path for A remains unconfirmed on production, so the stale-cookie diagnosis is neither confirmed nor refuted live.

UAT note (docs only, no product change): `hkwtia-login-resend-member` sessionStorage cooldown in `components/auth/sign-in-form.tsx` survives cookie clearing and blocks submit; automation that bypasses React `onChange` leaves the controlled email empty. Retest procedure: clear cookies **and** sessionStorage (or fresh private tab), type with real keystrokes, wait out "Wait N".

UC22-11 BLOCKED → **PARTIAL** (Google session; magic-link, staff D, exact-head/Preview and fix deployment open). UC22-08/12/13/15/22/29/30/50 gain member A evidence, statuses unchanged; UC22-21/23/35/36/39 blocker reworded (A route not walked). Inventory **0 PASS / 49 PARTIAL / 11 BLOCKED / 0 NOT RUN**. No writes, Stripe, deployment, new PR or stacked CI patch.

## Live staff Auth/browser UAT (Google) — 2026-10-27

[Evidence](auth-browser-live-staff.md) / [manifest](auth-browser-live-staff-manifest.json): production `release@6833eb9a` (`dpl_5TMerrJ1oURQsBYhau8cNrUHCLmi`; older than PR #212, not deployed). Member A signed out, site data cleared, empty cookie jar confirmed; Willy signed staff in **via Google** on `/admin-login` in the box browser. Identity **Willy Lai, Superadmin**, Staff workspace (not the staff D fixture role). Read-only: session sticky across `/admin`, `/admin/members`, `/admin/members/queue` (Applications and payments), `/admin/events-mgmt` (WTIA Global Growth Demo Briefing listed), `/admin/inbox` (No conversations yet) and back to `/admin`; `/portal` redirects staff to `/admin`. Dashboard snapshot ~00:52 HKT: 5 unfinished, 1 submitted, 0 member-page/listing reviews, 0 pending approvals, 3 open staff tasks (CANARY 20261019 Follow up documents), 0 at-risk, 0 draft news; 4 profile records, 1 active membership, 1 unrevoked company seat (not reconciled with DB). No approvals, actions, messages or saves. Staff magic-link path not tested.

UC22-08/13/33/42/43/50 gain staff evidence; staff blockers reworded on UC22-11/21/22/23/29/30/35/36/39 (staff session exists; route walks, staff D role, ID-set comparison and zero-write readback open). **No status change** — no UC is PASS without exact-head evidence and the full checklist. Inventory **0 PASS / 49 PARTIAL / 11 BLOCKED / 0 NOT RUN**. No writes, Stripe, deployment, new PR or stacked CI patch.


## R2 blockers live status — 2026-10-27

Continued from `7c8e3308` on PR #212. [Unblock paths and live checks](r2-blockers-unblock.md) record Preview SSO (`prod_deployment_urls_and_all_previews`), unauthenticated 302 to `vercel.com/sso-api` for Preview `dpl_2PJRwnya2prEY68ZE43aMpgbQFgG` / `hkwtia-l4eh06gmt-…`, box Vercel CLI logged out (OIDC/`vc curl` not yet provable), Stripe price ID **presence** on Vercel Preview/Production vs absent local acceptance env, and GitHub Actions billing still blocking #211 (zero-step failures) while #212 has no Actions runs. Preferred Preview path: `vercel login` → `vercel link` → `vc curl` / `x-vercel-trusted-oidc-idp-token` (never print/commit token); fallback existing `VERCEL_SHARE_URL` + `scripts/vercel-preview-session.mjs`. Do not disable Deployment Protection; do not apply `stacked-ci-trigger.patch` until billing is fixed; no production deploy.

Inventory unchanged: **0 PASS / 49 PARTIAL / 11 BLOCKED / 0 NOT RUN**. Docs only this slice.
