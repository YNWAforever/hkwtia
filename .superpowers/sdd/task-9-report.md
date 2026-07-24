# Task 9 implementation report

## Outcome

Implemented the M2 staff-only approval decision console with an Actor-first repository, Zod-validated service and Server Action boundaries, conditional one-time decisions, atomic decision audits, allowlisted payload summaries, bilingual accessible UI, and no payload execution or delivery integration.

## TDD evidence

- Initial RED: `approval-service.test.ts` and `approval-authorization.test.ts` failed to resolve the missing `@/lib/admin/approvals` module (2 failed suites, 0 tests).
- Repository/service GREEN: 2 files, 8 tests passed.
- Action/UI RED: three suites failed to resolve the missing action core, genuine Server Action, and approval list modules.
- Focused GREEN: 6 files, 17 tests passed.
- Focused approval plus authorization/boundary regression: 8 files, 21 tests passed.

## Database evidence

`RUN_POSTGRES_INTEGRATION=1 npx.cmd vitest run tests/unit/task9-postgres-integration.test.ts --reporter=dot`

- 1 file, 1 test passed against disposable PostgreSQL 16.
- Concurrent approve/reject calls through the production Drizzle repository produced exactly one decision and one audit; the loser returned `APPROVAL_ALREADY_DECIDED`.
- A forced audit constraint failure rolled the approval update back to pending with no decision actor or audit.
- The Docker container was removed by the test cleanup. No production or shared database was used.

## Final verification

- Full Vitest: 86 files passed, 5 skipped; 379 tests passed, 6 skipped.
- TypeScript: passed with `npx.cmd tsc --noEmit --pretty false`.
- ESLint: passed.
- Visible-string audit: passed, 88 TSX files scanned.
- Next.js production build: passed; `/[locale]/admin/approvals` is dynamic.
- JSON parsing and EN/ZH message parity: passed.
- Diff whitespace and BOM checks: passed.
- Privacy/no-delivery scan: no logging, Resend import, raw approval payload rendering, or payload executor added.

## Remaining concerns

- Approval creation and deterministic seeded approval fixtures remain intentionally deferred to Task 12/M4 trusted services. Task 9 only lists and decides existing rows.

## Privacy hardening follow-up

An independent review found that legacy or malformed approval rows could still expose an unknown raw action type in the UI and remain directly actionable. The fix replaces permissive summary extraction with strict action-discriminated payload schemas, treats malformed or unsupported rows as non-actionable DTOs, renders only the localized unavailable fallback, disables both decision controls, and revalidates the payload inside the decision transaction before any update. `APPROVAL_UNSUPPORTED` is mapped to the existing safe localized unavailable action state.

- Recorded RED: focused parser/UI suites reported 7 failures and 5 passes before the missing service export and UI gating were wired.
- Focused GREEN: `approval-service.test.ts` plus `approval-list.test.tsx` passed 12 tests; related action/auth/messages suites passed 13 tests.
- Disposable PostgreSQL GREEN: 2 tests proved the original concurrent single-decision/audit and rollback invariants with semantically valid strict fixtures, plus an opaque unsupported row remaining `pending` with no decision actor and zero audit records.
- Prototype-key RED/GREEN: `toString` and `__proto__` reproduced 2 parser crashes before the discriminator was changed to an own-property check; the refreshed focused privacy group passed 20 tests.
- Full Vitest: 86 files passed, 5 skipped; 389 tests passed, 7 skipped.
- TypeScript, ESLint, visible-string audit (88 TSX files), and production build all passed; `/[locale]/admin/approvals` remained dynamic.
- Diff whitespace, UTF-8 BOM, privacy/scope, and disposable-container cleanup checks passed.
