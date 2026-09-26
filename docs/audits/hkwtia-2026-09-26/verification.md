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

- Full suite baseline has one existing CLI import failure. The fix and rerun remain required.
- No isolated `DATABASE_URL_TEST` or Stripe test variables in this shell. Do not run migrations, seeds or paid flows against unknown hosts.
- Browser acceptance needs a local/preview server and test identities. The public alias's deployed SHA is unverified.
- `npm run test:e2e` and focused browser journeys must be run and recorded before handoff.
