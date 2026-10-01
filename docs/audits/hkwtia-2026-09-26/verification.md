# Verification record

Record every result with date, SHA, environment, command, exit code, count, skips, and artifact path. A skipped test is not a pass.

| Date (HKT) | SHA / environment | Command | Result | Scope / limitation |
|---|---|---|---|---|
| 2026-09-27 | audit ZIP, Node 24.18.0 | SHA-256 top-level and ZIP manifest check | 6/6 and 108/108 match | Integrity only. |
| 2026-09-27 | ZIP baseline `e309f9e8` | `node --disable-warning=ExperimentalWarning evidence/reproduce-findings.mjs source` | exit 0 | Historical in-memory F03/F04/F08 reproduction; no current DB, endpoint or Stripe. |
| 2026-09-27 | feature worktree `e309f9e8` | `npm ci --no-audit --no-fund` | exit 0; 1334 packages | Locked dependencies installed. |
| 2026-09-27 | feature worktree `e309f9e8` | `npm test` | exit 1; 627 files passed, 1 failed to load, 27 skipped; 5591 tests passed, 75 skipped | Existing `production-lhci-target.test.ts` import of the `.mjs` CLI failed with `SyntaxError: Invalid or unexpected token`. Full log in the plan workspace. |
| 2026-09-27 | feature worktree `e309f9e8` | `npm run audit:strings` | exit 0; 268 TSX files | Baseline pass. |
| 2026-09-27 | feature worktree `e309f9e8` | `npm run lint` | exit 0; 0 errors, 59 warnings | Baseline warnings. |
| 2026-09-27 | feature worktree `e309f9e8` | `npm run typecheck` | exit 0 | Baseline pass. |
| 2026-09-27 | feature worktree `e309f9e8` | `npm run build` | exit 0 | Production build compiled, typechecked and generated route output without task env values. |
| 2026-09-27 | feature worktree `e309f9e8` | `npm audit --omit=dev --audit-level=high` | exit 0; 8 below-high advisories | High-severity gate passed; one low and seven moderate remain in dependency report. |

| 2026-09-27 | T01 feature worktree | `npx vitest run` four guest RSVP files | exit 0; 4 files, 15 tests passed | Empty/malformed fields, dependency failure, retained values, saved-registration send failure. No DB fixture. |
| 2026-09-27 | T01 local managed Next server | `npx playwright test tests/e2e/guest-rsvp-recovery.spec.ts` | exit 0; 2 skipped | Both locales lacked an open RSVP event fixture; this is not browser acceptance. |
| 2026-09-27 | T01 feature worktree | `npm run typecheck` | exit 0 | TypeScript contract pass. |

| 2026-09-27 | T02 feature worktree | `npx vitest run` four ticket/cancellation files | exit 0; 4 files, 87 tests passed | Direct write, actor mismatch, current/expired member, invite-only, legacy flag and idempotency. No DB or Stripe. |
| 2026-09-27 | T02 feature worktree | `npx vitest run tests/integration/ticket-eligibility-postgres.test.ts` | exit 0; 1 file and 3 tests skipped | `RUN_POSTGRES_INTEGRATION=1` was not set; Docker daemon unavailable. Last-seat and revocation SQL remain unexecuted. |
| 2026-09-27 | T02 feature worktree | `npm run typecheck` | exit 0 | Actor and repository interface typecheck. |

| 2026-09-27 | T03 feature worktree | `npx vitest run` six event authoring/detail files | exit 0; 6 files, 54 tests passed | Form mode/format round trip, validation, ticket visibility guard and public online/hybrid facts. No database. |
| 2026-09-27 | T03 local managed Next server | `npx playwright test tests/e2e/admin-event-authoring.spec.ts` | exit 0; 2 skipped | Staff identity, isolated M2 database and test payment setup absent; not browser acceptance. |
| 2026-09-27 | T03 feature worktree | `npm run typecheck`; `npm run audit:strings` | exit 0 for both; 268 TSX scanned | Updated event field and translation contracts. |

| 2026-09-27 | T04 seat slice feature worktree | `npx vitest run` parser/action/form/refund-link files | exit 0; 4 files, 34 tests passed | Quantity 1/3/10, missing/extra rows, total and buyer-to-attendee copy; no DB or Stripe. |
| 2026-09-27 | T04 seat slice feature worktree | `npm run typecheck`; `npm run audit:strings` | exit 0 for both; 268 TSX scanned | Ticket component interface and bilingual copy. |

| 2026-09-27 | T04 recovery feature worktree | `npx vitest run` nine ticket files | exit 0; 9 files, 79 tests passed | Token digest/cookie, owner-checked read, provider-confirmed resume, quantity and core idempotency. Mocked DB/provider; no paid flow. |
| 2026-09-27 | T04 recovery feature worktree | `npm run typecheck`; `npm run audit:strings`; focused ESLint | exit 0 for all; 268 TSX scanned | Recovery route/schema/action/UI and bilingual copy. |
| 2026-09-27 | T04 recovery feature worktree | `npx drizzle-kit check` | exit 0 | Migration metadata consistent; does not apply 0043 or prove SQL against PostgreSQL. |
| 2026-09-27 | T04 feature worktree | `npx vitest run tests/integration/ticket-checkout-recovery-postgres.test.ts` | exit 0; 2 skipped | `RUN_POSTGRES_INTEGRATION=1` not set and Docker unavailable; migration SQL not run. |
| 2026-09-27 | T04 managed local Next server | `npx playwright test tests/e2e/ticket-checkout-recovery.spec.ts` | exit 0; 2 skipped | Isolated M2 DB/auth/Stripe test-mode values absent; no browser or provider acceptance. |

| 2026-09-27 | T05 feature worktree | `npx vitest run` six membership billing files | exit 0; 6 files, 55 tests passed | Local summary, fee/attempt match, explicit action, owner-only read, no-store route, bounded polling and existing Stripe idempotency. Mocked repositories/provider. |
| 2026-09-27 | T05 feature worktree | `npm run typecheck`; `npm run audit:strings`; focused ESLint; `git diff --check` | exit 0 for all; 268 TSX scanned | Type, translation and changed-code checks. |
| 2026-09-27 | T05 managed local Next server | `npx playwright test tests/e2e/membership-checkout.spec.ts` | exit 0; 2 skipped | Missing isolated M2 DB/auth/Stripe setup, owned pending membership fixture and non-Production Preview target. No browser or provider acceptance. |

| 2026-09-27 | T06 feature worktree | `npx vitest run` nine admin member files | exit 0; 9 files, 35 tests passed | Shared priority, multi-company scope, generated SQL selected company, purchase/seat/refund projection, staff note author, local navigation and copy. Mocked DB; no live records. |
| 2026-09-27 | T06 feature worktree | `npm run typecheck`; `npm run audit:strings`; focused ESLint; `git diff --check` | exit 0 for all; 268 TSX scanned | Type, translation and changed-code checks. |
| 2026-09-27 | T06 disposable PostgreSQL | `npx vitest run tests/integration/member-360-purchases.test.ts` | exit 0; 2 skipped | `RUN_POSTGRES_INTEGRATION=1` unset and Docker daemon unavailable; buyer isolation SQL not run on PostgreSQL. |
| 2026-09-27 | T06 managed local Next server | `npx playwright test tests/e2e/admin-members.spec.ts` | exit 0; 2 skipped | Isolated M2 database and staff auth values absent; no browser acceptance. |

| 2026-09-27 | T07 feature worktree | `npx vitest run` four join unit files | exit 0; 4 files, 55 tests passed | Read-only GET, applicant ownership, explicit POST, persisted steps and safe magic-link resume intent. Mocked DB/auth. |
| 2026-09-27 | T07 feature worktree | `npx vitest run tests/integration/join-resume.test.ts` | exit 0; 3 skipped | `RUN_POSTGRES_INTEGRATION=1` unset and Docker daemon unavailable; advisory-lock concurrency remains unverified on PostgreSQL. |
| 2026-09-27 | T07 feature worktree | `npm run typecheck`; `npm run audit:strings`; focused ESLint | exit 0 for all; 268 TSX scanned | Types, bilingual copy and changed-code lint. |

| 2026-09-27 | T07 managed local Next server | `npx playwright test tests/e2e/join-resume.spec.ts` | exit 0; 2 skipped | Isolated M2 database/auth and non-Production Preview target absent; no browser acceptance. |

| 2026-09-27 | T08 feature worktree | `npx vitest run` four guest/action/table/presentation files | exit 0; 4 files, 31 tests passed | Registration-keyed UI, search, actor guard, locked-write query order, repeat/ineligible mapping and copy. Mocked DB. |
| 2026-09-27 | T08 disposable PostgreSQL | `npx vitest run tests/integration/guest-check-in.test.ts` | exit 0; 2 skipped | `RUN_POSTGRES_INTEGRATION=1` unset and Docker daemon unavailable; concurrent audit count and transaction rollback not executed on PostgreSQL. |
| 2026-09-27 | T08 feature worktree | `npm run typecheck`; `npm run audit:strings`; focused ESLint | exit 0 for all; 268 TSX scanned | Types, bilingual copy, changed-code lint. |
| 2026-09-27 | T08 managed local Next server | `npx playwright test tests/e2e/event-check-in.spec.ts` | exit 0; 2 skipped | Isolated staff/database/confirmed guest and non-Production Preview absent; no 390px browser acceptance. |

## Historical gates at T08 (superseded by later evidence)

- The Lighthouse target CLI shebang was removed so Vitest can import its exported function; its nine tests and the full suite now pass. This is a test-loader repair, not a production Lighthouse measurement.
- No isolated `DATABASE_URL_TEST` or Stripe test variables in this shell. Disposable Docker PostgreSQL 16 suites ran with synthetic data; no shared-host migrations, seeds or paid flows ran.
- Browser acceptance still needs isolated test identities, Neon Auth, Stripe test mode and access to the SHA-specific protected Preview. The public alias's deployed SHA is unverified.
- Full Playwright was attempted twice and did not pass; the credential-free public subset passed 22 with 2 login skips. Authenticated journeys remain an external gate.


| 2026-09-27 | T09 feature worktree | focused cancellation panel/repository/worker vitest | exit 0; 3 files, 35 tests passed | Intent snapshot SQL shape, confirmation counts, retry boundaries, frozen key, timeout and known-block behavior. Repository and transport mocked; no real DB/provider. |
| 2026-09-27 | T09 feature worktree | email catalogue and render snapshots vitest | exit 0; 2 files, 19 tests passed | Exact 31-template ID list, service classification and en/zh-HK rendered HTML/text. |
| 2026-09-27 | T09 feature worktree | job kind/routes/handler/worker-cron vitest | exit 0; 4 files, 66 tests passed | Route authorization and registry contract. |
| 2026-09-27 | T09 feature worktree | worker package npm test --prefix workers -- --run | exit 0; 5 files, 47 tests passed | Worker schedule and dispatch contract. |
| 2026-09-27 | T09 feature worktree | npm run typecheck; npm run audit:strings; npx drizzle-kit check | exit 0 for all; 268 TSX scanned | Types, bilingual strings, migration metadata only. Migration 0044 was not applied. |
| 2026-09-27 | T09 disposable PostgreSQL | npx vitest run tests/integration/event-cancellation-notices.test.ts | exit 0; 3 skipped | RUN_POSTGRES_INTEGRATION=1 unset, Docker unavailable. Atomic snapshot/rollback and concurrent claims remain unexecuted on PostgreSQL. |

| 2026-09-27 | T09 feature worktree | npm run build; focused ESLint; git diff --check | exit 0 for all | Production bundle includes authenticated event-notifications route. Build did not connect to DB or provider. |

## T10 public content and navigation evidence

| Date | Target | Command | Result | Scope and limit |
|---|---|---|---|---|
| 2026-09-27 | feature worktree | Focused Vitest on 19 event/demo/home/navigation/login/membership files | exit 0; 156 tests passed | Includes exact demo public/RSVP/order/admin publication guards, dated event lifecycle, separate directory/showcase availability, safe login continuation and FAQ/catalog rendering. Mocked DB/provider except pure model logic. |
| 2026-09-27 | feature worktree | `npm run typecheck`; `npm run audit:strings`; `git diff --check` | exit 0; 268 TSX scanned | Type, bilingual string and whitespace gates. |
| 2026-09-27 | local managed Next browser | `npx playwright test tests/e2e/public-navigation.spec.ts --reporter=line` | exit 0; 10 passed, 2 skipped | en/zh public destinations, FAQ, 390/768/1440px overflow/headings and axe on membership passed. Login cases skipped because `NEON_AUTH_BASE_URL`/`NEON_AUTH_COOKIE_SECRET` absent; no login browser acceptance. |
| 2026-09-27 | feature worktree, URL explicitly unset | `npm run content:archive-demo` | exit 1 `DATABASE_URL_REQUIRED` | Proves the inventory/mutation script does not access a database without an explicit URL. No dry-run against an isolated or production database was possible, and no cleanup occurred. |

The historical demo event's current production row, registration/order relationships and deployed SHA were not queried. The browser walk used the local worktree server, not a staging or live alias. No Stripe Price reconciliation or membership policy approval was available.

| 2026-09-27 | T10 feature worktree | `npm run lint`; changed-file ESLint; `npm run build` | exit 0 for all; full lint 61 warnings, focused lint 5 warnings, build compiled and generated 251 static pages | Warnings are test mock image tags; no lint errors. Build ran without database/provider credentials and does not prove runtime behavior. |

## T11 admin pagination evidence

| Date | Target | Command | Result | Scope and limit |
|---|---|---|---|---|
| 2026-09-27 | feature worktree | Focused Vitest: new cursor/event/member tests and existing event/member regressions | exit 0; 10 new event tests, 10 member-timeline tests, 2 summary tests, 2 rendered page tests, plus prior event/member suites | By-ID, SQL bounds, tie keys, actor checks, lazy sections, copy and legacy compatibility. SQL proxy/mocked DB; no live PostgreSQL latency evidence. |
| 2026-09-27 | feature worktree | `npm run typecheck`; `npm run audit:strings`; `git diff --check` | exit 0; 268 TSX scanned | Types, bilingual strings and whitespace after T11 event/member wiring. |
| 2026-09-27 | disposable PostgreSQL | `npx vitest run tests/integration/admin-pagination.test.ts` | exit 0; 3 skipped | `RUN_POSTGRES_INTEGRATION=1` unset and Docker daemon unavailable. Same-name member/guest/ticket, same-time orders/notes and authorization were not executed on PostgreSQL. |

No 10k-member/500-attendee load fixture, EXPLAIN ANALYZE, query count or server p50/p95 was produced. Staff sign-in and Preview admin browser acceptance are also unavailable in this shell. T11 is code-verified by unit/rendered tests only; staging and production remain unverified.
| 2026-09-27 | T11 feature worktree | `npm run lint`; `npm run build` | exit 0 for both; lint 61 warnings, 0 errors; build compiled and generated 251 static pages | Same warning count as T10. Build has no authenticated admin/database acceptance or performance proof. |

| 2026-09-27 | T11 full feature worktree | `npm test` | exit 0; 654 files and 5,754 tests passed; 34 files and 93 tests skipped | All checked-in unit suites pass after contract reconciliation. PostgreSQL integration remains skipped without an isolated test database/Docker; browser and provider acceptance remain separate gates. |
| 2026-09-27 | T11 feature worktree | `npm run typecheck`; `npm run audit:strings`; `npm run lint` | exit 0 for all; 268 TSX scanned; lint 61 warnings, 0 errors | Static checks after the full-suite repairs. Existing warning count unchanged from T10. |

## T12 member operations evidence

| Date | Target | Command | Result | Scope and limit |
|---|---|---|---|---|
| 2026-09-27 | feature worktree | Focused T12 query, saved-view, navigation, selection and repository Vitest | pass; selection/navigation 7 tests plus repository/cursor regression 8 tests | Strict filters, HK day conversion, actor/saved-view boundaries, page selection, filter reset and SQL-proxy row shape. No actual PostgreSQL read. |
| 2026-09-27 | disposable PostgreSQL | `npm test -- tests/integration/member-filter-selection.test.ts` | 4 skipped | `RUN_POSTGRES_INTEGRATION=1` unset and Docker daemon unavailable; matching-row, company and Hong Kong boundary SQL remain unexecuted against PostgreSQL. |
| 2026-09-27 | feature worktree | `npx drizzle-kit check`; `npm run audit:strings`; `npm run typecheck` | exit 0; 272 TSX scanned | Migration metadata, bilingual strings and types. Migration 0045 unapplied. |
| 2026-09-27 | feature worktree | `npm test` | exit 1; 661 files and 5,782 tests passed, 2 tests failed, 35 files/97 tests skipped | Two stale T12 cursor/projection fixtures caused the failures. Both were updated; the 5 affected tests then passed. A fresh full suite remains required before handoff. |
| 2026-09-27 | feature worktree | `npm run lint` | exit 1; 1 new React effect error, 63 warnings | Selection state was then moved to `useSyncExternalStore`; its focused test and direct ESLint passed. Fresh full lint remains required. |

Saved-view migration, staff browser flow, keyboard/mobile checks, and a selection-to-server-preview journey remain unverified. This is code evidence, not staging verification or production release.
| 2026-09-27 | feature worktree | `npm run build`; `git diff --check` | exit 0; 251 static pages generated; diff check exit 0 | Bundles the T12 admin page and saved-view action. No database, auth, provider or staff browser session was exercised. |

## T13 batch engine evidence

| Date | Environment | Command | Result | Scope and limit |
|---|---|---|---|---|
| 2026-09-27 | feature worktree | focused batch/member Vitest | 11 unit cases passed | Contract, actor gate, default-off flag, selection UI, repository, retry, profile handler; DB mocked. |
| 2026-09-27 | disposable PostgreSQL 16 via Docker | `RUN_POSTGRES_INTEGRATION=1 npx vitest run tests/integration/admin-batch-snapshot.test.ts tests/integration/admin-batch-concurrency.test.ts tests/integration/member-filter-selection.test.ts` | 3 files, 6 tests passed | Real migration 0046, filter SQL, selection snapshot, digest/ownership, competing claims, expired lease/fence and atomic update/audit. Initial run failed on alias and timestamp precision; fixed and rerun passed. Local disposable database only. |
| 2026-09-27 | feature worktree | `npm run typecheck`; `npm run audit:strings`; focused ESLint; `npx drizzle-kit check` | all exit 0; 275 TSX scanned | Batch page, bilingual copy, migration metadata and changed files. |
| 2026-09-27 | feature worktree | `npm run lint` | initial exit 1 on impure `Date.now` render; corrected; fresh full lint pending | Existing warnings remain. |

Migration 0046 is not applied to staging/production. `ADMIN_BATCH_ENABLED` remains false. No staff-authenticated browser or 5000-item load run has been performed. Later T18 entries below record full suite/build and selected disposable-DB passes; staff browser and staging gates remain.
## T14 member import evidence

| Date | Environment | Command | Result | Scope and limit |
|---|---|---|---|---|
| 2026-09-27 | feature worktree | Focused CSV/import validation, match, service, upload-route and wizard Vitest | pass; 24 tests including 2 wizard cases | BOM, quoted newline, Chinese, duplicate/invalid fields, XLSX formula/external-link rejection, actor/flag checks and conflict-row selection. Mocks except parser. |
| 2026-09-27 | disposable PostgreSQL 16 via Docker | `RUN_POSTGRES_INTEGRATION=1 npx vitest run tests/integration/member-import-commit.test.ts tests/integration/admin-batch-snapshot.test.ts tests/integration/admin-batch-concurrency.test.ts tests/integration/member-filter-selection.test.ts` | exit 0; 4 files, 8 tests passed, then 3 import tests passed after the preview-snapshot change | Migration 0047, actor-owned staging, exact-ID/contact conflicts, same-file run reuse, confirmed batch commit, prior batch/filter regressions. No shared data. |
| 2026-09-27 | feature worktree | `npm run typecheck`; `npm run audit:strings`; `npx drizzle-kit check`; focused ESLint; `npm audit --omit=dev --audit-level=high` | exit 0; 277 TSX scanned; audit reports 8 low/moderate paths | Type, copy, migration, new-source lint and no high npm audit advisory. Full suite/lint/build remain for T18. |

Current and incoming row values are displayed in the bilingual preview; exact-ID version change after preview skips without profile mutation or import audit. No staff-authenticated browser, real upload proxy, 5000-row load, approved retention deletion or staging deployment was exercised. Migration 0047 and both flags remain unapplied/disabled outside disposable tests.
## T15 finite grant evidence

| Date | Environment | Command | Result | Scope and limit |
|---|---|---|---|---|
| 2026-09-27 | feature worktree | Focused finite-grant model/service/form, historical comp, batch service and worker contract Vitest | exit 0; 41 grant/comp/worker cases plus 4 batch service cases | Strict target/reason/window, HKT midnight, default-off and superadmin gates, historic comp behavior, worker registry parity. Mocked DB for unit cases. |
| 2026-09-27 | disposable PostgreSQL 16 via Docker | `RUN_POSTGRES_INTEGRATION=1 npx vitest run tests/integration/membership-grant-batch.test.ts tests/integration/membership-grant.test.ts tests/integration/admin-batch-snapshot.test.ts tests/integration/admin-batch-concurrency.test.ts tests/integration/member-import-commit.test.ts` | exit 0; 5 files, 10 tests passed | Real 0048 on synthetic schema; plan seats, conflict and concurrent same-profile grants, single audit, future/expiry SQL boundaries, expiry only grant rows, bulk target preview/commit, and prior batch/import regressions. The first grant DB run caught an untyped PostgreSQL JSON parameter; fixed and rerun. |
| 2026-09-27 | local worker package | `npm test` in `workers/` | exit 0; 5 files, 47 tests passed | Schedule/dispatch and worker package contracts; no deployed cron call. |
| 2026-09-27 | feature worktree | `npm run typecheck`; `npm run audit:strings`; `npx drizzle-kit check`; focused ESLint | exit 0; 278 TSX scanned | Type, bilingual strings, migration metadata and changed-source lint. Initial lint rejected a repository import from the membership folder; expiry runner moved to `lib/db/repos` and rerun passed. |

No approved association grant policy, superadmin browser session, staging deployment, live expiry job or production grant was exercised. Both grant flags default off; migration 0048 exists only in the branch and disposable PostgreSQL tests.
## T16 profile cleanup evidence

| Date | Environment | Command | Result | Scope and limit |
|---|---|---|---|---|
| 2026-09-27 | feature worktree | `npx vitest run tests/unit/admin-batch-contract.test.ts tests/unit/admin-batch-profile-patch.test.ts`; `npm run typecheck` | exit 0; 6 unit cases passed; typecheck passed | Strict request allowlist, locked reread and audit SQL. Initial test run caught the old mock's missing locked read; fixture corrected after the real PostgreSQL test passed. |
| 2026-09-27 | disposable PostgreSQL 16 via Docker | `RUN_POSTGRES_INTEGRATION=1 npx vitest run tests/integration/admin-batch-profile-cleanup.test.ts` | exit 0; 2 tests passed | Metadata-only patch, profile version and audit in one item transaction; owner role demotion after preview skips without metadata or audit. Initial behavior test failed with `BATCH_PATCH_UNAVAILABLE` before implementation. |

Communication, invitation, ticket resend, export, staff browser and shared-environment evidence are not part of this slice. No real recipient or member was changed.


## T16 ticket resend and private export evidence

| Date | Environment | Command | Result | Scope and limit |
|---|---|---|---|---|
| 2026-09-27 | disposable PostgreSQL 16 via Docker | `RUN_POSTGRES_INTEGRATION=1 npx vitest run tests/integration/admin-batch-ticket-resend.test.ts` | exit 0; 1 test passed | Exact-seat preview, one stable outbox key, event cancelled after preview skips without an extra outbox row. Synthetic tables and recipients; no provider send. |
| 2026-09-27 | feature worktree | `npx vitest run tests/unit/ticket-email-runner.test.ts` | exit 0; 8 tests passed | Outbox resend send-time cancellation and default-off suppression, alongside existing confirmation/refund behavior. Mock transport only. |
| 2026-09-27 | disposable PostgreSQL 16 via Docker | `RUN_POSTGRES_INTEGRATION=1 npx vitest run tests/integration/admin-batch-export.test.ts tests/integration/admin-batch-profile-cleanup.test.ts` | exit 0; 3 tests passed | Exact ID snapshot, formula-neutralized CSV, actor-owned 30-minute download, and shared selection refactor regression. No browser download or shared storage. |
| 2026-09-27 | feature worktree | `npm run typecheck`; `npm run audit:strings`; focused ESLint | exit 0; 279 TSX scanned | Type, bilingual UI and repository-layer import rule. A first full lint run caught the export DB helper in the admin layer; it was moved to `lib/db/repos` and focused lint passed. |

The resend and export flags remain default off. No staff-authenticated browser flow, provider delivery, shared-environment download, real member communication or production migration was exercised. Renewal reminder and update invitation remain open.


## T17 shared rate-limit evidence

| Date | Environment | Command | Result | Scope and limit |
|---|---|---|---|---|
| 2026-09-27 | disposable PostgreSQL 16 via Docker | `RUN_POSTGRES_INTEGRATION=1 npx vitest run tests/integration/shared-rate-limit.test.ts` | exit 0; 2 tests passed | Migration 0049 applied; two instances racing on one key allow five and reject sixth, cold-start persistence, operation scope, 15-minute reset, expired-row cleanup, and store fault. Initial stub run failed with all six allowed. |
| 2026-09-27 | feature worktree | `npx vitest run tests/unit/guest-registration-service.test.ts tests/unit/ticket-checkout-actions.test.ts tests/unit/shared-rate-limit.test.ts` | guest/ticket 18 tests and digest 2 tests passed in focused runs | Guest service awaits async decision; checkout store outage returns unavailable without order write; scope/secret digest guards. Mock shared store in action tests. |
| 2026-09-27 | local worker package | `npm test` in `workers/` | exit 0; 5 files, 47 tests passed | Ten-minute cleanup route included in the declared job schedule; no deployed worker call. |
| 2026-09-27 | feature worktree | `npx drizzle-kit check`; focused ESLint | exit 0 | Migration journal and new limiter/job source. Initial T17 typecheck caught a test mock tuple annotation; corrected and pending full gate. |

No shared environment, real proxy load, production key, or deployed cleanup job has been verified. Auth/interest endpoints still use their existing separate limiter design. Pending hold ceiling, public cache, notification load and RUM remain open.

## T17 homepage streaming evidence

| Date | Environment | Command | Result | Scope and limit |
|---|---|---|---|---|
| 2026-09-27 | feature worktree | `npx vitest run tests/unit/homepage.test.tsx` | exit 0; 7 passed | Regression was first observed failing: with a pending event read, `HomePage` did not resolve. It now returns the hero tree while twelve section reads remain behind independent Suspense boundaries. The jsdom section test resolves async Server Components before client rendering; it is not a browser stream measurement. |
| 2026-09-27 | feature worktree | `npm run typecheck`; focused ESLint | exit 0 | TS and changed-file lint after the streaming change. |

Public `force-dynamic` remains. No shared-cache key, CMS invalidation, A/B member isolation, same-region Lighthouse/RUM, or notification-capacity result is claimed.

## T17 ticket queue capacity and T18 metric evidence

| Date | Environment | Command | Result | Scope and limit |
|---|---|---|---|---|
| 2026-09-27 | disposable PostgreSQL 16 via Docker | `RUN_POSTGRES_INTEGRATION=1 npx vitest run tests/integration/ticket-email-capacity.test.ts` | exit 0; 2 passed after red/green repair | 500 synthetic confirmation notices; first three froze payloads and got a retryable provider outage, then every unique key settled once. At the current limit of three claims per tick, recovery took 167 simulated minute ticks. The test uses a mock acceptance, not a provider or wall-clock throughput measurement. |
| 2026-09-27 | local Vitest | `npx vitest run tests/unit/ticket-email-runner.test.ts` | exit 0; 11 passed | Provider duration/outcome and aggregate queue health emit no recipient/key; a failed metric sink cannot re-send an accepted email; a failed queue probe emits an unavailable signal and recovers on the next drain. |
| 2026-09-27 | feature worktree | focused ESLint and `npm run typecheck` | exit 0 | Repository and runner type/lint boundaries after metrics. |

The queue test first failed because `queueHealth` was absent, then caught an empty-queue age incorrectly reported as zero; both failures were read before the implementation was corrected. The production runner now logs `ticket_email_metric` JSON with backlog, oldest pending age, claim count, provider outcome and provider-only duration. It logs no recipient, message text or idempotency key. No deployed log/alert pipeline has been verified. Five-minute pending-age and three missed-cron thresholds remain proposals, not association SLA or enabled alerts. Changing the current three-per-minute ticket batch needs provider rate, timeout, lease and test-sink acceptance; the 167-tick result is a capacity warning, not permission to raise live send throughput.

## T18 critical-journey test mapping

The existing Playwright specs are the canonical journey suites; a second `hkwtia-critical-journeys.spec.ts` would duplicate their fixtures and could pass while their stronger checks fail. This table maps the plan's requested journey to the current equivalent and records what still requires an isolated Preview.

| Journey | Existing browser spec(s) | Current acceptance gap |
|---|---|---|
| Roles and actor denial | `m2-admin-crm.spec.ts`, `admin-members.spec.ts`, `portal-dashboard.spec.ts` | Isolated Neon Auth identities and side-effect checks after revocation. |
| Join and resume | `join-auth.spec.ts`, `join-resume.spec.ts`, `phase-a-funnel.spec.ts` | Two-tab live database and expired-link Preview fixture. |
| Membership billing | `membership-checkout.spec.ts`, `phase-a-funnel.spec.ts` | Stripe test-mode redirect/webhook/3DS and second-account denial. |
| Event authoring | `admin-event-authoring.spec.ts`, `phase-b1-member-events.spec.ts` | Staff login and persisted bilingual mode/format round trip. |
| RSVP and tickets | `guest-rsvp-recovery.spec.ts`, `phase-d4a-ticket-checkout.spec.ts`, `ticket-checkout-recovery.spec.ts`, `seat-management.spec.ts` | 1/3/10-seat provider matrix and last-seat concurrent Preview run. |
| Cancellation/refunds | `phase-d4d-event-cancellation.spec.ts`, `phase-d4c-refunds.spec.ts` | Provider unknown/retry and notification receipt reconciliation. |
| Check-in | `event-check-in.spec.ts`, `phase-d4b-passes-and-check-in.spec.ts` | Isolated guest/member/ticket data and 390px staff session. |
| Member operations | `admin-members.spec.ts`, `phase-d2-member-tools.spec.ts` | Saved view, batch selection, actor revocation and 10k-member load. |
| Bulk/import | `admin-batches.spec.ts`; disposable PostgreSQL integration covers batch/import/grant transactions | The 5,000-row load and retry transaction driver passed locally. Authenticated staff browser and safe provider receipts remain unverified. |
| Public/accessibility | `core-pages.spec.ts`, `public-navigation.spec.ts`, `accessibility.spec.ts` | Repeat against known deployment SHA at 390/768/1440px and compare axe/Lighthouse baselines. |

The manual `.github/workflows/audit-acceptance.yml` runs a non-Production Preview public subset and disposable PostgreSQL tests. It has not run remotely. Its public subset can skip auth cases; it cannot mark the authenticated matrix complete.

## T18 full-gate repair log

| Date | Environment | Command | Result | Scope and limit |
|---|---|---|---|---|
| 2026-09-27 | feature worktree | `npm run audit:strings`; `npm run lint`; `npm audit --omit=dev --audit-level=high` | exit 0; 279 TSX; lint 0 errors/63 warnings; audit 1 low/7 moderate | No high-severity audit result. Warnings are recorded rather than called clean lint. |
| 2026-09-27 | feature worktree | first `npm test -- --reporter=dot` | exit 1; 5,833 passed, 23 failed, 113 skipped | Nine failed files exposed stale router/limiter fixtures, route ownership, worker alert vocabulary, repository boundary, ticket recovery and the pre-existing npm optional-peer closure. Not a passing gate. |
| 2026-09-27 | feature worktree | second `npm test -- --reporter=json --outputFile=test-results/audit-vitest.json` | exit 1; 5,851 passed, 5 failed, 113 skipped | Machine-readable report isolated `ci-security-contract`, `repository-boundary` and `ticket-checkout-action-recovery`. No green claim. |
| 2026-09-27 | feature worktree | `npx vitest run tests/unit/repository-boundary.test.ts`; `npm run typecheck` | exit 0; 32 boundary cases, types | DB-bearing batch handlers and finite-grant SQL relocated into repositories; established paths are thin exports. |
| 2026-09-27 | disposable PostgreSQL 16 via Docker | `RUN_POSTGRES_INTEGRATION=1 npx vitest run` on five moved batch handler integration files | exit 0; 5 files/8 tests | Import, profile correction, finite grant, ticket resend and private export still work through the original atomic batch transaction. Synthetic data only. |
| 2026-09-27 | feature worktree | focused route-parity, worker-alert, guest-email, admin render, ticket recovery and npm lock contract suites | exit 0 after fixes; route parity 33 tests, ticket recovery 5, lock contract 12 | Test fixtures now inject the shared limiter; seven new protected routes and the cleanup alert kind are enumerated; four npm optional-peer records restored. |
| 2026-09-27 | feature worktree | first `npm run build` after contract repair | exit 1 at TypeScript | Alert schema accepted `rate-limit-cleanup` while a duplicate manual type omitted it. The type now derives from the schema and `npm run typecheck` passes; build must be rerun. |

A final full suite and build were run after these repairs. The JSON reports stay under ignored `test-results/` and are local evidence, not CI artifacts.

| Date | Environment | Command | Result | Scope and limit |
|---|---|---|---|---|
| 2026-09-27 | feature worktree, bounded local workers | `npm test -- --maxWorkers=2 --reporter=json --outputFile=test-results/audit-vitest-bounded.json` | exit 0; 5,856 passed, 0 failed, 113 skipped | Full repository Vitest collection. Skips include credential and database gated suites; this is a unit gate, not staging acceptance. Earlier unbounded runs failed under contention and exposed fixtures/contracts repaired in this branch. |
| 2026-09-27 | feature worktree | `npm run lint`; `npm run typecheck`; `npm run audit:strings`; `npx drizzle-kit check`; `npm run build`; `npm audit --omit=dev --audit-level=high` | exits 0; lint 0 errors/63 warnings; strings 279 TSX; build 256 static pages; audit 1 low/7 moderate | Lint warnings remain; no high-severity npm audit result. The final build and typecheck were after code repairs; generated `next-env.d.ts` was restored. |
| 2026-09-27 | GitHub PR #94 at `f6ee1005` | CI checks and Vercel status | CI `checks`, `quality`, both test shards passed; Vercel Preview deployment succeeded | Remote checks do not prove authenticated journeys, migrations or provider effects. Preview URL: `https://hkwtia-bv2yh7357-ynwaforevers-projects.vercel.app`. |
| 2026-09-27 | SHA-specific protected Preview | `npx playwright test tests/e2e/core-pages.spec.ts tests/e2e/public-navigation.spec.ts` | stopped after four Chinese route assertions saw Vercel's logged-out page (`html lang=en-US`) | Vercel protection hides app content; no share token/storage state available. This is a Preview access gate, not a locale result. |
| 2026-09-27 | GitHub workflow dispatch | `gh workflow run audit-acceptance.yml --ref codex/audit-remediation-20260927 ...` | HTTP 404: new workflow is not registered on the default branch | Manual workflow cannot be dispatched before it exists on the default branch; no remote disposable-DB or Preview browser result is claimed. |

The first full local Playwright attempt on port 3107 was stopped after the Concierge route returned 503: its documented loopback-only deterministic acceptance pair and matching `APP_URL` were absent. The second full run used those values; the four Concierge mock cases passed, but by approximately case 115/390 anonymous protected-route and guest-cancel checks failed repeatedly while Neon Auth reported `ECONNREFUSED` at `localhost:3000`. It was stopped, and the full E2E gate is **not passed**. The credential-free bilingual local public subset (`core-pages` and `public-navigation`) finished with 22 passed and 2 login cases skipped in 3.3 minutes; it covers both locales, 390/768/1440px public layouts, navigation, FAQ and selected axe checks. No Neon Auth, isolated `DATABASE_URL_TEST`, Stripe test-mode, Preview share token or staff/member test identities are present in this session. Only variable presence was checked; values were not read or printed.

## Final disposable PostgreSQL rerun and release gates

| Date | Environment | Command | Result | Scope and limit |
|---|---|---|---|---|
| 2026-09-27 | disposable Docker PostgreSQL 16 | `RUN_POSTGRES_INTEGRATION=1 npx vitest run` on eight selected ticket, join, check-in, cancellation, admin pagination, purchase and outbox integration files | first attempt: 5 files passed, 3 failed; 17 tests passed, 6 failed | The red cases exposed two real raw-SQL defects: `note_authors` was treated as a physical relation, and cancellation's `UNION ALL` bound `event_id` as text. The ticket eligibility synthetic table also lacked current `events.slug` and grant-window fields. No provider was contacted. |
| 2026-09-27 | disposable Docker PostgreSQL 16; commit `b71583ed` | same eight-file command, `--maxWorkers=1 --reporter=dot` | exit 0; 8 files, 23 tests passed, 0 failed; 123.03 s | Validates transactional SQL and synthetic journeys. It is neither authenticated Preview acceptance nor a load measurement. |
| 2026-09-27 | feature worktree after `b71583ed` | `npm run typecheck`; focused ESLint on three changed files | exit 0 for both | Type and changed-file lint after the SQL repair. |
| 2026-09-27 | feature worktree after `b71583ed` | `npm run build` | exit 0; 256 static pages | Production compile, TypeScript and page generation pass after SQL repair; generated `next-env.d.ts` restored. No provider or staging assertion. |
| 2026-09-27 | feature worktree after `b71583ed` | `npm run audit:strings`; `npx drizzle-kit check`; `npm audit --omit=dev --audit-level=high` | exit 0 for all; 279 TSX; metadata consistent; 1 low/7 moderate advisories | Translation scan and metadata/high-severity dependency gates; no shared migration or dependency upgrade. |
| 2026-09-27 | feature worktree after `b71583ed` | `npm run lint` | exit 0; 0 errors, 63 warnings | Full repository lint after final code repair. Warnings remain recorded. |
| 2026-09-27 | feature worktree at `88fbff90` before `b71583ed` | `npm test -- --maxWorkers=2 --reporter=json --outputFile=test-results/audit-vitest-final.json` | exit 0; 5,859 passed, 0 failed, 115 skipped, 1,678 suites | Full local unit collection after queue metrics. This result predates the final SQL correction; those paths were separately exercised by PostgreSQL above. JSON is local ignored evidence. |
| 2026-09-27 | feature worktree after `b71583ed` | `npm test -- --maxWorkers=2 --reporter=json --outputFile=test-results/audit-vitest-postgres-fix.json` | exit 0; 1,678/1,678 suites; 5,859 passed, 0 failed, 115 skipped | Final full local Vitest collection after the SQL repair. Skips are not staging acceptance; JSON remains under ignored `test-results/`. |
| 2026-09-27 | GitHub PR #94 at `88fbff90` | `gh pr checks 94` and Vercel Preview status | `checks`, `quality`, both test shards and Vercel deployment passed | Historical SHA-specific Preview `https://hkwtia-n0ufe31jm-ynwaforevers-projects.vercel.app` was Vercel-login protected; no app acceptance was run there. |
| 2026-09-27 | GitHub PR #94 at `e1aa32f3` | `gh pr checks 94`; GitHub Preview deployment 6689132826 | `checks`, `quality`, tests (1), tests (2), Vercel all passed; deployment state `success` | SHA-specific Preview: `https://hkwtia-f4eivn322-ynwaforevers-projects.vercel.app`. External web access could not open app content; no authenticated/browser acceptance is claimed. A later documentation-only SHA must be checked separately before release. |

Code coverage is broader than runtime acceptance. No member-facing send, payment/refund, shared database migration or production cleanup was performed. The default-off batch, grant, notification and limiter rollout and rollback sequence is in `release-runbook.md`; external policy and credential gates remain in `decisions.md`.

## Continuation check — grant reader gaps (2026-09-27)

At `728f6177`, the earlier finite-grant write and expiry tests did not exercise every benefit reader. With the expiry job deliberately paused, PostgreSQL reproduced future/expired personal grants in the portal directory, company plan badges outside the window, company seat access outside the window, and a members-only ticket order authorized by a future company grant. The first test run also exposed a missing `joined_at` in the new synthetic fixture; after repairing the fixture, the current-grant control passed while the intended denials failed.

The shared grant validity predicate now accepts aliased membership columns. Portal directory candidates, company seat overview/invitation/acceptance, company public plan badges and ticket purchase company eligibility use it. Publication, historic null/null grants and existing eligible statuses are unchanged. Five focused files passed **45/45**, including eight disposable PostgreSQL cases (`membership-grant-benefits`, `ticket-eligibility-postgres`). This is local code/DB evidence, not staging or production evidence.

## Continuation — disabled grant capability and correction controls

The company grant tests failed first because all company targets were rejected, including explicitly enabled synthetic requests. The UI tests failed because target fields and the correction selector were absent. The implementation now uses one grant writer for profile/company targets, catalog seat limits, exclusive ownership, transaction locks and audit; the company feature flag is rechecked when the worker executes. The bulk grant form at `/admin/members/grants` uses Hong Kong date parsing and the existing durable batch preview. No policy or environment flag was enabled outside disposable tests.

Executed: grant service/batch/unit set **12/12** passed; final UI, company flag-revocation and profile-correction PostgreSQL set **15/15** passed; repository/action/translation boundary set **137/137** passed. The latter emits existing ICU `year` fixture warnings but reports no failed tests. Typecheck then passed after correcting a JSX delimiter and a map key type. Visible-string audit passed (280 TSX files). Full repository gates and authenticated browser verification are still required for the eventual release candidate.

## T12 queue verification — continuation

Three real PostgreSQL tests first failed on the missing read capability, then passed: two applications for one person remain distinct through tied-timestamp pagination; the latest attempt is linked by the exact membership; persisted completed applications leave the payment queue even when membership state is stale; staff-only reads, literal search and filter-scoped cursor rejection hold. The rendered table test failed before implementation and then passed, proving the Chinese Member 360 link uses the applicant profile ID and displays separate application/membership/billing identities. The table plus discovered admin page boundary suite passed **5/5**. Typecheck and the 283-file visible-string audit passed. Full lint passed with 64 warnings; its one newly introduced unused cursor-variable warning was removed afterward. Authenticated browser acceptance remains unrun.

## Incremental migration check — continuation

- `tests/unit/migration-journal-order.test.ts`: observed red on 0048 (1790457600000 < 0047's 1790474400000), then green after correction to 1790476200000.
- `RUN_POSTGRES_INTEGRATION=1 npx vitest run tests/integration/audit-migration-upgrade.test.ts`: both PostgreSQL cases passed (39.8s). A temporary historical journal demonstrated the missing grant column after an imports-only deployment. Correct metadata applied the remaining migrations twice; the historical null grant stayed indefinite and the old insert shape still worked.
- Database: disposable loopback pgvector PostgreSQL 16, synthetic profiles only. Repository journal remained corrected during the historical reproduction. Automatic approval review had rejected a proposed persistent working-tree mutation; the accepted reproduction used temporary migration files against the isolated fixture.

## T16 communication continuation verification

- Local Vitest: seven focused files, 92 tests passed, including six real PostgreSQL scenarios for exact company renewal scope, changed renewal data, consent/locale changes, shared contacts, approved template checks and campaign review freezing. Separate email render tests passed nine cases and added four bilingual snapshots. The email and WhatsApp runners first failed the missing-recheck tests; their fixed focused run passed 31 tests. The review test first showed an unfinished source batch could enter review, then passed after the transaction guard.
- After replacing per-recipient preview reads with the shared bulk facts projection: bulk-communication-eligibility and communication-audit-load passed all seven cases. 5,000 synthetic profiles were eligible, six SQL statements, 7,362.82 ms on this loaded Windows machine, zero campaigns created. See evidence/communication-load.json; recorded revision is the parent plus the then-uncommitted communication implementation, not a deployed SHA.
- Typecheck passed after the bulk projection. String audit passed 285 TSX files. ESLint passed with zero errors and 63 existing warnings. No provider, shared database or real recipient was used. Authenticated browser, approved WhatsApp locale templates and synthetic provider receipts remain staging gates.

## T11/T12/T13 capacity evidence

`RUN_POSTGRES_INTEGRATION=1 RUN_AUDIT_LOAD=1 npx vitest run tests/integration/admin-audit-load.test.ts --maxWorkers=1` passed both cases. The fixture owns a disposable loopback pgvector PostgreSQL 16 container, applies all 49 migrations twice and seeds M1 twice. It never reads a shared DATABASE_URL. Evidence is in `evidence/admin-load.json`, including EXPLAIN ANALYZE/BUFFERS plans.

| Synthetic workload | Observed result |
|---|---|
| 10,000 profiles/memberships; 20 search samples | p50 221.73 ms; p95 603.47 ms |
| Member 360 summary; 20 samples | p50 43.91 ms; p95 423.17 ms |
| 500 attendees; 20 page samples | p50 16.85 ms; p95 48.00 ms; cursor walk returned 500 unique IDs |
| 5,000 locale corrections | preview 1,061.06 ms; execution 212,236.17 ms; exactly 5,000 effects and audits; no pending/running/failed/skipped |
| 100 claims of 50 | p50 1,157.48 ms; p95 6,752.62 ms; maximum 10,387.29 ms |

Environment: Windows, Node v24.18.0, PostgreSQL 16.15, Intel i5-12500 (6 cores/12 logical processors), shared machine with unrelated concurrent work. The report pins parent SHA 12ee2b4c; the committed capacity harness was then uncommitted. These measurements satisfy the proposed local search p95 target; they are neither production capacity nor Hong Kong RUM. No index or hold policy was changed based on these results.

## T17 cache verification

New tests first reproduced repeated news reads (two queries rather than one), the absent framework page-copy cache, and a delayed announcement blocking the main response. The fixed real-Next-cache tests plus existing request-config tests passed 10/10; shell/announcement/homepage/repository boundary passed 55/55. Date hydration, locale/limit separation, failure recovery and immediate tag invalidation are asserted. The cache harness supplies Node AsyncLocalStorage, as Next's runtime does. Typecheck and string audit passed after implementation.

`tests/e2e/public-cache-isolation.spec.ts` adds isolated A/B/guest public reads and a bilingual CMS save/warm-cache invalidation with restoration. It requires explicit isolated acceptance plus existing M2 credentials. No cache isolation browser success is claimed until that environment runs it. The tests do not authorize production copy changes.

## T17 ticket hold assessment

The real PostgreSQL eligibility suite passed 5/5, including five concurrent retries of one ten-seat group attempt: one pending order, exactly ten seats, and the unrelated eleventh-seat attempt rejected. Existing last-seat concurrency and private/grant denials still pass. There is no measured abuse incidence or evidence supporting a tighter household/company pending-hold rule; the existing ten-seat limit and hold/session recovery policy are retained. This is local contention evidence, not a load-derived approval of a new ceiling.

## Continuation capacity, retention and observability results

| Check actually run | Result | Evidence boundary |
|---|---|---|
| Disposable PostgreSQL 16, 5,000-row CSV import, all 49 migrations | 1/1 passed; validation 5,357.80 ms, batch submission 33.59 ms, execution 251,166.88 ms; exactly 5,000 succeeded, zero pending/running/skipped/failed | evidence/import-load.json pins parent 3964b567 plus the then-uncommitted harness; Node 24.18.0, shared Windows machine. No shared DB or provider. |
| Retention and import commit integration | 5/5 passed; dry-run nonmutation, payload scrub, active-run protection, repeat safety, actor denial | Disposable PostgreSQL; cleanup flag enabled only in test process. |
| Response instrumentation, jobs and webhook focused tests | 66/66 passed | Generated request IDs, signed-event lag, safe counters, unchanged auth/retry and logging-failure isolation. |
| Worker tests with installed worker dependencies | 48/48 passed; worker TypeScript passed | Vitest 4.1.10; records terminal failure/recovery and web/worker revision. No worker deployment. |
| Alert evaluator + actual local CLI trigger/recovery | 3/3 unit cases; four trigger and four recovery transitions | Committed sanitized JSON under evidence/. No hosted alert delivery. |
| Isolated authenticated preflight | exit 1: all 16 M2 environment inputs absent | Actual names-only failure; no credentials read/printed and no test DB contacted. |
| Browser batch fixture transaction driver | 1/1 passed in disposable PostgreSQL | 10 claims -> 8 effects/2 failed -> 2 retry claims -> 10 unique effects/audits; stable effect keys. Browser test remains credential-gated. |

The final full suite, build and browser/lab checks are recorded below after completion. Earlier passing commits are historical evidence until the candidate is rerun.

## Final-gate continuation repair log

The first continuation full Vitest run failed: 5,887 passed, 10 failed, 141 skipped (1,708 suites). It exposed stale renewal/invitation request fixtures, an announcement source-text assertion tied to the old layout location, and four missing protected-route owners (grants, communications, application queue and import retention). The fixtures now carry exact membership/Segment IDs; the announcement check renders the streamed header boundary; the explicit protected inventory enumerates all 77 routes with 40 admin pages and 18 jobs. The repaired focused set passed 65/65. A new full run is required after the attendee export continuation.

The first Playwright collection failed because two new files used JSON imports without Node import attributes and the selected external base URL lacked M4B's explicit allowed-origin variable. Both files now use the repository's readFileSync pattern; four cases collect. With the exact loopback allowed origin, the actual full E2E gate ran 19 tests successfully, skipped six, then stopped after three Concierge mock-provider cases returned 500 in the production server lacking their acceptance configuration; 366 did not run. This is a failed gate. The production-server public subset then passed 22 cases and skipped two login cases (47 seconds), including en/zh, 390/768/1440px, FAQ/navigation and axe. No authenticated acceptance is claimed.

The strict browser-report CLI accepted a synthetic two-pass report and rejected the same report with one skip. The isolated batch driver refused to run without its explicit isolation/paused-worker attestation. These are guard checks, not browser acceptance.

Attendee export tests first rejected the absent operation, then passed the real artifact/owner/expiry/changed-preview/flag-revocation cases. A new 500-row fixture initially failed on ambiguous uuid/text binding, which was corrected with an explicit UUID cast. The final export suite passed 3/3; migration-upgrade and existing member-export suites passed another 3/3. The new evidence/attendee-export-load.json records one 500-row artifact: submit 6.93 ms, preview 95.81 ms, worker execution 119.43 ms and download 12.71 ms. All 50 migrations were applied only to disposable PostgreSQL. The report pins df71a3b2 plus the then-uncommitted export capability.

## Candidate gates — 2026-09-27

Application candidate: `092e73bb25cd9799902beacd9855fd484dfde48f`. The subsequent `1185c782` changes only Lighthouse URL ordering: the reusable browser kept NEXT_LOCALE=zh-HK after `/zh` and silently redirected later unprefixed English checks. A real Lighthouse run reproduced it; English routes now precede Chinese routes. The existing Preview-session harness passed 9/9; direct config inventory/order validation and focused ESLint passed. No application code changed after the production build below.

| Actual gate | Result | Limits |
|---|---|---|
| `npm run audit:strings` | pass; 287 TSX files | Both message bundles retain parity checks. |
| `npm run lint` | pass; 0 errors, 63 warnings | Existing warnings retained. The initial repeat found temporary Chrome extension files under .tmp; generated artifacts are now ignored by Git, ESLint and TypeScript. |
| `npm run typecheck`; `npx drizzle-kit check` | pass | Schema metadata check is not a shared migration. |
| `npm run build` | pass; 263 generated pages | Production compile on Windows/Node 24.18.0, without provider/test credentials. |
| `npm audit --omit=dev --audit-level=high` | pass; 1 low, 7 moderate, no high | No dependency auto-upgrade. |
| Full local `npm test -- --maxWorkers=2 --reporter=json --outputFile=.tmp/audit-release/vitest-frozen.json` | **failed**; 5,900 passed, 2 failed, 145 skipped, 1,714 suites | `wt-pages/partners-page` and `wt-pages/programs-editions` each failed at about 20 seconds while build/browser work overlapped. JSON reports STACK_TRACE_ERROR; durations match the configured timeout. This failed local run is retained even when focused/CI reruns pass. |
| GitHub CI at `092e73bb`, then `1185c782` | **pass**: checks, both test shards and required quality | Ubuntu/Node 22. Workflow runs the actual full sharded Vitest suite plus strings/lint/types/build/dependency audit. Credential skips are not staging acceptance. Latest code CI: https://github.com/YNWAforever/hkwtia/actions/runs/36312575612. |
| Latest local production public browser subset | 22 passed, 2 login tests skipped; 35.2 s | Both locales, 390/768/1440px, navigation/FAQ/selected axe. The build ran on loopback:3148. Authenticated login and mutations remain unverified. |
| Full local Playwright gate | **failed**; 19 passed, 3 failed, 6 intentional skips, 366 not run | Concierge mock-provider route returned 500 without acceptance-server configuration. The max-failures stop left the rest unexecuted. JSON combines intentional skips/unexecuted as 372; neither is a pass. |
| Vercel Preview at `092e73bb` | deployment success; app acceptance blocked | https://hkwtia-8zvcx1ha8-ynwaforevers-projects.vercel.app redirects to vercel.com with title Login – Vercel. No protection was disabled and no authenticated app content was inspected. |

The local raw JSON/logs are under ignored `.tmp/audit-release/`; final-gates.json records compact counts and source report hashes. There was no shared migration, provider send, payment/refund, production cleanup or production deployment. The source branch is reviewable; staging is not accepted and production is not released.

The two local timeout files were rerun without code changes using `npx vitest run tests/unit/wt-pages/partners-page.test.tsx tests/unit/wt-pages/programs-editions.test.tsx --maxWorkers=1 --reporter=verbose`: **2 files / 9 tests passed**, 33.80 seconds total. The previously failing render cases took 1,385 ms and 1,395 ms. Together with both green CI shards, this supports load-related timeouts; it does not rewrite the earlier failed local gate.

## Candidate Lighthouse lab

Executed `npm run test:lighthouse -- --config=.tmp/audit-release/lighthouse-matched.config.json`: **exit 1**, 30 valid reports, three per URL, all final URLs matched. The repository assertion failed on `/zh` performance (0.83). The median scores for four Chinese routes are below 0.90; these remain an open performance gate. Accessibility is 0.96–1.00, SEO 1.00 and CLS zero in the recorded medians. No RUM pass is claimed.

| Route | Median performance | LCP ms | TBT ms | CLS | Accessibility | SEO |
|---|---:|---:|---:|---:|---:|---:|
| / | 0.94 | 2593.72 | 202.00 | 0 | 1.00 | 1.00 |
| /membership | 0.97 | 2417.11 | 87.03 | 0 | 1.00 | 1.00 |
| /events | 0.96 | 2673.87 | 73.50 | 0 | 1.00 | 1.00 |
| /programmes | 0.93 | 2935.32 | 162.50 | 0 | 0.96 | 1.00 |
| /partners | 0.94 | 2581.41 | 166.00 | 0 | 1.00 | 1.00 |
| /zh | 0.83 | 2667.68 | 507.49 | 0 | 1.00 | 1.00 |
| /zh/membership | 0.88 | 2594.35 | 386.32 | 0 | 1.00 | 1.00 |
| /zh/events | 0.88 | 2522.37 | 376.45 | 0 | 1.00 | 1.00 |
| /zh/programmes | 0.89 | 2786.80 | 309.81 | 0 | 0.96 | 1.00 |
| /zh/partners | 0.97 | 2447.08 | 142.63 | 0 | 1.00 | 1.00 |

Environment: production Next build at `http://localhost:3000`, Windows/Node 24.18.0, Intel i5-12500, dedicated Playwright Chromium 1228 profile with extensions disabled, Lighthouse mobile simulated network/CPU settings saved in `evidence/lighthouse-local.json`. Collection overlapped the end of the full local unit run and other work on the shared host; Lighthouse reported slow-CPU calibration warnings. No Auth, database-backed public content or provider configuration was supplied. These are local lab observations, not Hong Kong user performance or a before/after baseline. The Chinese homepage trace showed roughly twice the style/layout work of the sampled English trace; this observation does not establish its cause. Re-profile the reviewed bilingual content on an isolated staging host before a performance release claim.

Reproduction corrections: Windows Chrome-launcher cleanup first failed with EPERM, so collection used a separately launched, hidden headless Chrome over its local debugging port. Shared locale cookies then redirected English URLs; `1185c782` orders English first. Finally, port 3148 differed from the build’s NEXT_PUBLIC_SITE_URL fallback (localhost:3000), which falsely failed canonical checks. The final run used matching port 3000 and a fresh profile. No canonical application code, threshold or production setting was changed to obtain a pass. All outputs used filesystem upload; no report/session cookie was sent to public artifact storage.

For a repeat, build and serve with matching NEXT_PUBLIC_SITE_URL/APP_URL and browser origin, use three runs per URL in the committed locale order, a fresh profile, and filesystem-only LHCI output. The sanitized exact local collection config is `evidence/lighthouse-local.config.json`; its debugging port requires an operator-owned headless Chrome. Use a new private profile and disable extensions. Do not reuse any authenticated production session.

Compact evidence: `evidence/final-gates.json` records command results, skips and source report hashes; `evidence/lighthouse-local.json` contains every run, medians, device settings, warnings and raw report hashes. Raw reports remain in ignored `.tmp/audit-release/`. The release runbook and decisions retain every policy/environment gate.

## Approved continuation: Preview and rendering regressions

At application SHA 2b77fb871ff54006b0d51222caba730fd936b174, the first protected Preview public walk produced 21 passes, one failure and two skips. The failing English home was actually Chinese because the saved protection session also contained NEXT_LOCALE=zh-HK. The cookie serializer regression reproduced that boundary (1 failed, 9 passed), then passed 10/10 after the fix. With only the protection cookie retained, the actual public walk passed 22 cases and skipped the two locally gated Auth cases (2.0 minutes). English route tests now explicitly assert their language.

A separate real Preview browser run exercised both public login screens: HTTP 200, billing continuation, join/support links and rejection of /admin as a member continuation all passed in both locales. No login email was submitted, and no member session or mutation was used. PLAYWRIGHT_PUBLIC_AUTH=true makes these same existing tests run in the next remote public suite without supplying server secrets locally.

Before the rendering fix, the new browser regression failed because a distant home heading was already fully rendered (checkVisibility with contentVisibilityAuto returned true). The paired layout probe and new regression use real pages, not mocked HTML. Focus/fragment/print, the final build and repeated Lighthouse results are recorded in the subsequent continuation evidence. The first build attempt after extracting the serializer failed on its missing .d.mts export; that declaration was added before the repeated build. No failed attempt is a release pass.

## Real isolated Neon/Auth browser acceptance (approved continuation)

The new Neon branch br-lingering-unit-azxl75s5 in hkwtia-m2-preview was migrated through 0050 with the repository migration runner and seeded with guarded synthetic M1/M2 data. Five real Auth password identities were mapped to existing test roles. Local Next at localhost:3011 used only that branch. No production database, real recipient or live payment provider was used. See evidence/isolated-neon-environment.json and evidence/isolated-browser.json for environment, per-case outcomes and report hashes.

| Actual focused run | Result | Diagnosis / scope |
|---|---|---|
| Initial member selection browser attempts | failed/stopped | Real next-intl ICU errors broke checkbox labels; 1f6296c0 fixes raw count/name templates. A real formatter regression failed in both locales before the fix. A subsequent test selector incorrectly required an exact label around a select containing option text; corrected by selecting the batch combobox. |
| isolated-journeys-third | 11 passed, 1 failed, zero skips | Both locales: batch 8-success/2-failure and retry-of-2, member search/detail/purchases/return, 390px guest check-in, join start/second-tab resume; A/B/guest cache and bilingual CMS warm-cache invalidation passed. Chinese event case collided with the preceding English title; fixture titles now include their unique slug. |
| isolated-import-event-rsvp | 2 failed, 4 not run | Temporary malformed JSON during an uncommitted translation edit caused compile/auth failures. Both bundles were repaired and parsed before rerun. |
| isolated-import-event-rsvp-recheck | 7 passed, 2 failed, 2 skipped, 1 not run | Both four-mode event journeys and both import workflows passed. Import assertions include 1 create/1 update/1 duplicate/1 invalid, exact eligible selection, before/incoming labels, two effects/audits and zero memberships. Print failed because selector specificity overrode the print rule; RSVP discovery skipped when the first six events were external fixtures. |
| isolated-grant-rsvp-rendering | 2 timed out, 8 not run | Cold dev compilation consumed the first grant test; five real identity sessions exceeded the original 180-second bound. The five-role test now has a bounded 420-second timeout. |
| isolated-grant-rsvp-rendering-recheck | 6 passed, 4 failed | All bilingual focus/fragment/print cases passed after 33b5e4b9. Grant duplicate test needed to refill the React-reset form; RSVP test used the wrong translation path. Harness corrected, with an explicit fixture slug and typed bundle. |
| isolated-grant-rsvp-final | 4 passed, zero skips; 2.7 minutes | Both locales: five-role grant boundary, finite window, repeat refusal, exactly one grant/audit; empty RSVP validation/focus and aborted action response preserving inputs. |
| Final focused unit set | 4 files / 15 tests passed | Real bilingual member/import translator, isolated runtime mapping, M2 browser contract, and artifact-upload guard. The project mapping test first failed on an unrelated inherited Neon project; it now maps the explicit test project. The upload guard first failed on the broad test-results path; authenticated CI now uploads only its result JSON. |

There are 24 distinct passing browser cases across these focused runs. Failed attempts are retained; this is not a claim that the full browser matrix passed. At that checkpoint the payment matrix lacked STRIPE_TEST_SECRET_KEY and a pending fixture; the later real Stripe test evidence below supersedes that credential gate. Company/bulk grant activation, delivery providers, hosted worker/alerts and RUM remain separate gates.

## Final provider, browser and clean-runner performance evidence

Application revision: 69eba85fe01a501a30560223e8f0ae8ff5a1fd40. CI passed at https://github.com/YNWAforever/hkwtia/actions/runs/36324520965; median Lighthouse passed at https://github.com/YNWAforever/hkwtia/actions/runs/36324522776. The prior 24f0d39a run failed typecheck because the Lighthouse declaration omitted aggregationMethod; 69eba85f adds that declaration. Vercel's matching deployment is READY. These are code/public-lab gates, not complete staging acceptance.

| Actual continuation check | Result | Environment / limitation |
|---|---|---|
| CSP header + image policy unit suites | 2 files / 308 tests passed | Native Stripe redirect regression first failed; exact provider origins only. |
| Membership recovery, native form and ticket recovery browser set | 5 passed, 1 English ticket timeout | Real isolated Neon/Auth, local Next; both locale membership recovery and JavaScript-disabled Stripe redirects passed. |
| English ticket focused rerun | 1 passed, zero skips | Exact INVALID response and retained buyer/attendee values; server limiter remains active behind a trusted loopback test proxy. Chinese ticket had passed in the preceding set. |
| Genuine Stripe test payment | exit0 | Decline kept the same attempt processing; public test 3DS challenge completed; provider reports complete/paid/livemode=false. No real funds. |
| Held signed webhook release and identical replay | exit0 | Completion processing before release, active via browser polling afterwards; checkout.session.completed and invoice.paid each returned200 processed; replay returned200 duplicate. Independent DB read: both jobs completed, attempt_count1 and exactly one audit each. |
| Completion after webhook already committed | 2 locale cases passed | Fresh real Auth browser contexts render active immediately, with zero status polls before active. |
| Public rendering browser suite | 8 passed, zero skips | Focus/fragment/print plus both streamed-shell cases. Shell cases first failed with footer inside the first viewport. |
| Lighthouse median aggregation regression | 11 passed | New default-median case first failed. Actual config now uses median for all assertions. |
| M2 reset unit suite | 9 passed | Operational date case first failed with no dated updates; only exact synthetic IDs shift. |
| Latest local strings/lint/typecheck | all exit0 | 287 TSX; lint0 errors/65 warnings; Windows Node24.18.0. |

Stripe evidence: evidence/stripe-test-acceptance.json pins real event/session IDs, database facts, original reproduction source hash and raw log hash. The supplied key is absent from committed files. Old Preview price IDs returned resource_missing in the supplied test account; the isolated prices match existing seed amounts and HKD annual interval. The live provider methods were card/Link only, so asynchronous-method acceptance remains unverified. The sanitized reproduction is scripts/verify-audit-stripe-checkout.mjs; syntax and focused ESLint pass after removing noisy logs. The initial harness failures (button labels, challenge selector and currency interaction) remain in local logs; they are not passing application checks.

The first clean Linux run (08930b5f, workflow36322351834) was green under optimistic aggregation but homepage medians were0.89 with CLS0.149/0.162. It did not satisfy the required median result. After the viewport reserve, final Ubuntu/Node22 production-build reports contain three measurements for each of ten routes. All medians pass, CLS is0 and SEO is1 on every route. Raw report hashes and individual measurements are in evidence/lighthouse-linux-before-stream-reserve.json and evidence/lighthouse-linux-final.json.

| Route | Median performance | LCP ms | Accessibility |
|---|---:|---:|---:|
| / | 0.96 | 2489.40 | 1.00 |
| /membership | 0.98 | 2243.94 | 0.96 |
| /events | 0.96 | 2624.67 | 1.00 |
| /programmes | 0.96 | 2769.17 | 0.96 |
| /partners | 0.97 | 2443.41 | 1.00 |
| /zh | 0.97 | 2398.68 | 1.00 |
| /zh/membership | 0.98 | 2233.83 | 0.96 |
| /zh/events | 0.96 | 2640.17 | 1.00 |
| /zh/programmes | 0.96 | 2765.83 | 0.96 |
| /zh/partners | 0.98 | 2268.08 | 1.00 |

This provider-free local lab does not establish same-region RUM, hosted database latency or a production release. Earlier failures and skips above remain part of the record.

## Final CRM acceptance

Commit1a703edb fixes the dated browser fixture and current CSV/login contracts. The full real-Auth suite passed **11/11, zero skips/failures/flakes, 5.4minutes** on localhost:3011 with a fresh hkwtia_m2_audit database on the isolated Neon branch. All50 migrations and exactly30 M2 profiles were seeded; five existing synthetic Auth IDs were mapped. It covers anonymous404, public/login continuation, Member360 note, exact segment/CSV rows and idempotent campaign queueing, ordered at-risk members, exact report totals, one check-in engagement, one approval audit, selected admin axe, Chinese recovery copy and anonymous/member/company-admin denial across all enumerated admin routes.

Failed attempts are retained in evidence/crm-browser.json with raw report hashes. The mixed acceptance DB report had extra current active revenue. The fresh DB then exposed a stale browser attendance denominator: July31 includes a July25 fixture event (3/8=37.5%), whereas the integration test explicitly freezes July20 (3/6=50%). Report logic and policy were unchanged. A repeated focused reset unit run passes9/9 and focused lint passes with zero warnings.

## Additional ticket routing regression

A real Stripe-test HKD75 payment for three synthetic seats settled paid through its genuine signed checkout event. The issued pass then returned404: the locale proxy excluded dotted capability paths. tests/unit/signed-ticket-route-matcher.test.ts uses the installed Next matcher and real signPassToken output. Before the fix:4 failed/9 passed (all en/zh pass/check-in paths excluded). After four exact route exceptions: the matcher plus existing proxy tests pass22/22. Static/API paths remain excluded; normal locale rewriting and existing Auth exchange remain covered. The provider walk continues below; this partial paid attempt alone does not prove refund acceptance.

## Final ticket provider and refund regression evidence

Application SHA `1e4f6246ac42f3dd0249acad2be949aaf94a6aa6`. The actual fresh reproduction exited0: a synthetic public three-seat order charged HKD75 through genuine Stripe TEST Checkout, its original signed checkout event settled paid, three seats existed and the signed pass returned200. English confirmation cancel left the order paid; Chinese confirmation committed one succeeded full refund. Both locale attendee lists removed the seats and both pass URLs returned404. Replaying the original signed checkout event left the order refunded with exactly one provider refund, one refund audit and one refund notice. Both webhook responses say processed; the assertions prove idempotent effects.

The previously accepted-provider/local-audit-rollback order was inspected before recovery. Provider state showed exactly one succeeded HKD75 refund. The staff action reconciled the local transaction; a stale second submit reported already refunded. That browser harness failed because its alert selector also matched Next's empty announcer. A separate read-only check passed both locale revoked-pass/absent-seat assertions, the unchanged one provider refund, one m2-staff-01 profile-linked audit and one notice. This is documented recovery evidence, not a claim that the failed harness passed.

| Executed check | Result | Boundary |
|---|---|---|
| Signed-route red regression | 4 failed / 9 passed before fix | Real signPassToken and installed Next matcher; all four localized routes exposed the defect. |
| Signed-route and existing proxy green regression | 22 passed | Static/API exclusions, locale rewrite and Auth exchange remain covered. |
| Refund red unit + real PostgreSQL regression | 4 failed / 16 passed | Auth ID versus application-profile FK reproduced. |
| First refund green attempt | 29 passed / 1 failed | Minimal fixture omitted event_refund_reason; fixture repaired, no production schema change. |
| Final refund focused gate | 3 files / 30 passed, zero failed/skipped | Unit/core/email plus 2 disposable PostgreSQL 16 transaction/recovery cases; RUN_POSTGRES_INTEGRATION=1. |
| Fresh genuine ticket payment/refund/replay | exit0 | Real isolated Neon/Auth, local web, genuine Stripe test card and signatures; test email transport. |
| Recovery read-only consequences | exit0 | Provider, DB and both locale browser consequences; earlier selector failure retained. |

Sanitized evidence: evidence/ticket-stripe-refund.json and evidence/refund-recovery.json, including source/log SHA256 hashes. Reproduction: scripts/verify-audit-ticket-refund.mjs (Node24 --conditions=react-server). The formatted copy changes only diagnostic logging/import location and adds a production-mode refusal; syntax and focused lint pass. Raw screenshots, signed URLs, payloads, credentials and sessions remain ignored locally. No real recipient delivery or production release is claimed.

## Final application CI and hosted public Preview

The actual CI run for `1e4f6246ac42f3dd0249acad2be949aaf94a6aa6` passed: https://github.com/YNWAforever/hkwtia/actions/runs/36328316486. Both full shards passed **5,927 tests**, with **147 skipped** (689 files passed, 55 skipped). Checks and the required quality job passed. The production-dependency audit reports one low/ten moderate/zero high/zero critical vulnerabilities; dev-inclusive install output is a separate population. CI skips do not count as DB/browser/provider acceptance. Raw log hash and summaries are in evidence/ci-final-application.json.

The exact application Preview https://hkwtia-p7vk6461f-ynwaforevers-projects.vercel.app is READY. The actual protected read-only run of core-pages, public-navigation and public-rendering passed **32/32, zero skips/failures/flakes, 178.4seconds**. It includes English/Chinese content and links, 390/768/1440px fit, selected axe checks, both public login shells, keyboard reveal, fragments, print and streamed-shell layout reserve. It used a protection-only cookie and no member identity or database mutation. evidence/public-preview-final.json records every case and the raw report hash. This is hosted public acceptance; authenticated business journeys used local web with the isolated hosted DB/Auth and remain separate from a complete hosted worker deployment.

## Final local gates and handoff boundary

At the final application revision (with only the guarded reproduction script added in b74a2109), all actual local gates returned0: `npm run audit:strings` (287 TSX files), `npm run lint` (0 errors, 63 warnings), `npm run typecheck`, and `npm run build` (production compile/static generation). The owned local dev process was stopped first; no private provider/test environment was injected into the build. Exact log/report hashes are in evidence/release-gates-final.json. The root checkout's unrelated AGENTS.md modification and untracked work were preserved. Only the isolated worktree's explicit implementation/evidence paths were committed.

Code: T00 classifications and all unblocked T01–T18 implementation are on the reviewable feature branch; each finding retains its individual remaining proof/policy gate. Isolated acceptance: selected operational/CRM/batch/import/grant journeys and genuine Stripe test membership/ticket/refund paths passed with the exact scope above. Hosted staging: public Preview passed32/32; complete authenticated hosted web/worker/provider-sink acceptance remains open. Production: no migration, cleanup, publication/promotion, real payment/refund or real-member message. PR #94 is open for review; the external automated code review was skipped for service usage, which is not review approval.


## Authorized production rollout update — 2026-09-28

The user subsequently authorized all migrations 0037–0051. After a successful isolated production-copy rehearsal and recovery snapshot `snap-blue-mud-aojc25bd`, the repository migration command applied the sequence to `fragrant-mountain-25240574` / `br-noisy-glitter-ao2npd77` / `neondb`. Read-only verification confirms ledger 0051, no pending migration/hash mismatch, required constraints, and unchanged checked row counts. Both live directory locales now show the normal empty state instead of unavailable. [Execution, receipts, screenshots and rollback limits](../hkwtia-final-2026-09-27/acceptance.md). This supersedes earlier statements that production schema is unmigrated; it does not mark provider/worker/flag/policy gates complete.

## Partner-logo verified release slice — 2026-10-01 HKT

PR105 source/dependencies passed CI36755125547: 716 files / 6097 tests passed, 65 files / 171 tests skipped; actual lint/typecheck/strings/build and high-severity Production dependency gate passed. Clean Production-configured source e7fa4add built 267 pages. Stage12/12 and canonical12/12 actual browser cases passed before import: bilingual home/directory/anonymous-admin across desktop/mobile, zero page/console errors/overflow. Canonical provider readback matches dpl_DLFixAkkcNmpMCUTu3BY98hTDstQ/e7fa4add. Expected missing-operator import guard exited1 before writes; this is not a successful import. [Detailed evidence/commands](../../integration/partner-logo-production-release-2026-10-01.md). No new payment/Auth/email/worker acceptance is claimed.

### Production import / provider gate — 2026-10-01 HKT

The user selected the existing unique superadmin. Actual Production import created79 unpublished/unconfirmed partners and79 audit rows; all79 R2 hashes/dimensions passed. Rerun created0/skipped79. Unrelated counts remain2 profiles/3 companies/0 memberships/0 billing attempts. The deployed media route still returns404; current handler with actual Production DB and verified R2 config returns200/checksum-match locally. Automatic approval review rejected persistent Production R2 credential transfer, citing earlier Preview-only transfer scope. No secret patch/redeployment/publication occurred; explicit3-key Production transfer approval is pending. [Exact execution/gate](../../integration/partner-logo-production-release-2026-10-01.md). No skipped/unrun browser test is claimed complete.

## Completed Production partner-logo release — 2026-10-01 HKT

The requester explicitly authorized the existing three R2 values to Vercel Production and same-source redeployment, resolving the earlier automatic-review gate. Canonical hkwtia.vercel.app now serves e7fa4add / dpl_GYj8pTrvHxSZRDszXnVnCtkDS8rV. Exactly79 approved logos are published:58 supporting/15 regional/6 media, with79 creation +79 update +79 publication audits under the existing unique stored superadmin. All79 deployed image checks passed; prepublication12/12 and postpublication immutable8/8 + anonymous canonical8/8 browser cases passed. Independent SQL confirms ledger51 and unchanged unrelated counts; no profile/role change, migration, new flag/worker, payment/refund or member send occurred.

This supersedes only the logo slice's earlier import/config/publication-pending status. Broader audit findings,171 skipped CI tests, lower dependency findings, provider/policy/runtime gates and unperformed Production rollback/Preview teardown remain explicitly limited. Current web rollback first unpublishes the exact recorded79 IDs; retain data/audits/objects. [Actual release identity, commands, screenshots and ordered rollback](../../integration/partner-logo-production-release-2026-10-01.md).
