# 2026-10-25 R1 rebuild verification

P00 records the initial checkout in baseline.json. Historical local PASS is not current evidence. The supplied authoritative plan was initially untracked and is preserved in this delivery. Historical acceptance directory is unchanged.

| Task | Code at baseline | Tests this run | Deployment | Runtime |
| --- | --- | --- | --- | --- |
| T22-03 | Shared helper absent; tile targets draft default | Not tested | Not deployed | Staff/SQL blocked by unverified identity |
| T22-05 | Requires comparison with plan | Not tested | Not deployed | Visual not tested |
| T22-01 | Next 16.4.3 supersedes historical Next patch | Not tested | Not deployed | Identity blocked |
| T22-02 | No verified isolated target | Not tested | Not deployed | BLOCKED: no current Auth/Neon isolation metadata |
| T-MP12A | Requires source investigation | Not tested | Not deployed | BLOCKED: no sandbox contract |

CI requires Node 22, lock graph, strings, lint, typecheck, build, omit-dev audit, unit shards and worker checks. The workflow currently targets PR bases main/release/full-remediation; a stacked PR base is outside that trigger. Current deployment identity is UNKNOWN; no deployment is authorized. No database client, migration or seed has been invoked.

T22-03: observed red `expected false to be true` on submitted parser acceptance before implementation. Focused queue/dashboard/query suite now passes (4 files, 10 tests). Shared predicate and explicit dashboard link rebuilt; exact fixture IDs and real EN/ZH namespace covered. These are unit tests, not PostgreSQL or staff session evidence. Read installed Next `use-server` guide; authenticated action boundaries retained.

T22-05: observed red 5 vs 4 plan articles before moving assistant out. Comparison uses four-column responsive grid, independent unnumbered help, catalog seats and a hero comparison anchor. Existing unavailable/partial catalog behavior remains. Structural comparison labels excluded from CMS; existing editable count retained. Focused membership tests rerun. Browser visual matrix remains BLOCKED pending usable browser and a source-verified preview with populated catalog; jsdom is not visual evidence.

T22-01 initial audits: omit-dev 4 high/0 critical; full 20 high/1 critical (JSON captured separately). Join ownership/profile/recovery: 3 files/23 tests PASS. Next remains 16.4.3. No prior audit result reused.

R2 T22-04A offline start: member projection boundary implemented test-first. Observed four intended failures (staff sentinel exposure, draft visibility, other-applicant authorization, explicit projection). Seven unit cases then pass. No service writes/schema/migration wired: verified target is still absent. Transaction/receipt/concurrency/real identity acceptance remain BLOCKED. This is partial implementation, not completed supplements.

Fixture cleanup search: `rg -n r20261025a --glob '!package-lock.json' .` returned no matches before this note. No matching fixtures/manifests deleted.

Zod migration follows https://zod.dev/v4/changelog (read this run): explicit record key schemas, prefault for parsed object defaults, coercion input typing and partial patch omission preservation. Existing event write tests exposed the unwanted defaults; dedicated helper regression added. No boundary assertions weakened. Clean install completed with Node 22.23.4/npm 10.9.9; npm pruned canonical optional Ajv metadata, restored per existing CI contract. Initial interrupted full-suite runs are not claimed as passes; final results recorded below.

Browser capability rechecked: Playwright Chromium downloaded and `chromium.launch()` succeeded. No verified populated catalog preview/session/DB target supplied; full visual matrix remains BLOCKED (not a browser installation failure). No provider/production connection used to populate it.

T22-03 strengthened: SQL adapter unit test renders real Drizzle predicates for both dashboard and queue over six synthetic rows and compares exact review/payment UUIDs. Focused queue suite: 4 files/9 tests PASS. Still not live PostgreSQL evidence.

Dependency follow-up: final omit-dev high gate PASS (11 moderate/0 high/0 critical); full-tree gate FAIL (2 low/18 moderate/13 high/0 critical), retained as accepted dev-only LHCI exception with owner/deadline/path/exposure in dependency-disposition.md. No CI severity change. Browser Chromium launch PASS is capability evidence only.

Submitted mutation control: temporarily mapped submitted to draft; both the exact-ID fixture test and rendered repository predicate test failed (2 failures). Restored production predicate and reran: 2 files/5 tests PASS. No mutation remains.

Visual target evidence: GitHub deployment 7317971859 reported successful Preview for ad0c87de, URL https://hkwtia-nbshmfv20-ynwaforevers-projects.vercel.app. Anonymous HEAD /membership returned HTTP 302 to Vercel SSO on 2026-10-25; no bypass/session supplied. Nonces/cookies are omitted. This preview predates final membership adjustments and is not final-head visual evidence. Automatic preview triggered by authorized push is separate from manual deployment; no promotion/production deployment was performed.

Full suite after dependency corrections: 892 files passed, 113 skipped; 7,875 tests passed, 643 skipped. One earlier full run failed only the canonical Ajv peer contract before its restoration; rerun passed. Final stable-tree suite, build and worker checks follow below. Final membership focused suite now includes real next-intl EN/ZH links: 5 files/32 tests PASS. Six structural comparison labels remain outside the 114-key membership CMS surface.

Stable-tree full suite: all 7,877 assertions passed, but exit 1 due to an unhandled Radix focus-scope timer dispatch after jsdom Event realm teardown in mobile-navigation.test.tsx. This is a FAIL, not a PASS. Fixed test teardown to explicitly cleanup and await the zero-delay unmount callback while the jsdom realm remains alive; focused mobile navigation 7 tests PASS. Full suite is rerun after build/worker checks. Interrupted intermediate reruns are not acceptance evidence.

Stacked CI follow-up: test-first regression failed because the workflow excluded this PR base; adding the exact base made all 14 CI-contract tests pass without changing any gate. GitHub rejected push of that workflow commit because the OAuth App lacks `workflow` scope. The unpushed commit was removed (no shared history rewritten), its exact diff saved as stacked-ci-trigger.patch, and workflow/test restored. The patch is NOT applied; a workflow-capable maintainer must apply it or provide equivalent exact-head checks. No scope escalation or repeat authorization request made. Remote quality acceptance remains BLOCKED. All product commits push normally.

## Final local results

Product/test source HEAD: d10fddc06bf3e3c694bd783b4c86f15aaf37dd17; git tree ba4a6d2a4390c11bdd4cb3a217d2b73327d40347 (only acceptance documentation dirty). Final root suite: **7,877 passed / 643 skipped**, 893 files passed / 113 skipped, exit 0, no unhandled errors. Production build exit 0 (Next 16.4.3); final typecheck exit 0; lint exit 0 (77 warnings); visible strings exit 0 (357 TSX files). Worker clean install/typecheck and **57 tests** pass. No worker code changed. Generated next-env.d.ts path edits were restored after build.

Final commands and four-layer task ledger are in verification.json. Full-tree npm audit intentionally remains exit 1 under the explicit LHCI dev-only exception; omit-dev high gate exits 0. No merge, promotion, production writes, seed, live Stripe or messaging performed. All original 20261022 acceptance records remain unchanged. R2 is started and committed, with only the offline projection boundary implemented; persistence, receipts, concurrency, member/staff UI, SQL pagination, policy/resources and real identity UAT remain.

## R2 continuation, 2026-10-26

The projection-only R2 status above is historical. Current offline service, paging and self-service contract work and four-layer limitations are recorded in [r2-progress.md](r2-progress.md) and [r2-verification.json](r2-verification.json). Final local suite: 7,910 passed / 643 skipped; 91 focused tests passed; build, typecheck, lint and strings passed. No database/identity/deployment PASS is claimed.
