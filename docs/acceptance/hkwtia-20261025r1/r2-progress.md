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
