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
- No isolated `DATABASE_URL_TEST` or Stripe test variables in this shell. Do not run migrations, seeds or paid flows against unknown hosts.
- Browser acceptance needs a local/preview server and test identities. The public alias's deployed SHA is unverified.
- `npm run test:e2e` and focused browser journeys must be run and recorded before handoff.


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

Migration 0046 is not applied to staging/production. `ADMIN_BATCH_ENABLED` remains false. No staff-authenticated browser or 5000-item load run has been performed. Full suite/build and prior DB/browser gates remain for T18.
## T14 member import evidence

| Date | Environment | Command | Result | Scope and limit |
|---|---|---|---|---|
| 2026-09-27 | feature worktree | Focused CSV/import validation, match, service, upload-route and wizard Vitest | pass; 24 tests including 2 wizard cases | BOM, quoted newline, Chinese, duplicate/invalid fields, XLSX formula/external-link rejection, actor/flag checks and conflict-row selection. Mocks except parser. |
| 2026-09-27 | disposable PostgreSQL 16 via Docker | `RUN_POSTGRES_INTEGRATION=1 npx vitest run tests/integration/member-import-commit.test.ts tests/integration/admin-batch-snapshot.test.ts tests/integration/admin-batch-concurrency.test.ts tests/integration/member-filter-selection.test.ts` | exit 0; 4 files, 8 tests passed, then 3 import tests passed after the preview-snapshot change | Migration 0047, actor-owned staging, exact-ID/contact conflicts, same-file run reuse, confirmed batch commit, prior batch/filter regressions. No shared data. |
| 2026-09-27 | feature worktree | `npm run typecheck`; `npm run audit:strings`; `npx drizzle-kit check`; focused ESLint; `npm audit --omit=dev --audit-level=high` | exit 0; 277 TSX scanned; audit reports 8 low/moderate paths | Type, copy, migration, new-source lint and no high npm audit advisory. Full suite/lint/build remain for T18. |

Current and incoming row values are displayed in the bilingual preview; exact-ID version change after preview skips without profile mutation or import audit. No staff-authenticated browser, real upload proxy, 5000-row load, approved retention deletion or staging deployment was exercised. Migration 0047 and both flags remain unapplied/disabled outside disposable tests.
