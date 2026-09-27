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

## Outstanding gates

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
| Bulk/import | No pre-existing full browser spec; disposable PostgreSQL integration covers batch/import/grant transactions | Synthetic staff browser, 5,000-row load, two workers and safe test recipients remain. |
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
