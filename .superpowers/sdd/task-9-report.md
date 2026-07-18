# Task 9 — Transactional company seat management

## RED

- `npm.cmd run test -- --run tests/unit/seat-service.test.ts tests/integration/seat-capacity.test.ts` initially failed because `@/lib/db/repos/seats` did not exist.
- The focused scenarios cover seat-limit enforcement with pending invitations, normalized-email mismatch, duplicate acceptance, last-owner protection, owner/admin policy, and concurrent acceptance.

## GREEN

- Focused unit: `tests/unit/seat-service.test.ts` — 5/5 passed.
- Focused integration: `tests/integration/seat-capacity.test.ts` — 1/1 passed using `vitest.integration.config.ts`; concurrent acceptance produced one success and one `SEAT_LIMIT_REACHED` rejection.
- Full Vitest: `npm.cmd test` — passed.
- Typecheck: `npm.cmd run typecheck` — passed.
- Visible-string audit: `npm.cmd run audit:strings` — passed (60 TSX files scanned).
- Focused ESLint for Task 9 files — passed after fixture typing and unused-import cleanup.

## Implementation evidence

- `lib/db/repos/seats.ts` uses SHA-256 invitation digests, normalized emails, actor-first authorization, company row locking with `FOR UPDATE`, active plus pending capacity checks, unique-membership conflict handling, and last-owner/role policy guards.
- `portal/company/seats` renders bilingual protected seat management with localized invite, role-change, revoke, capacity, pending, and empty-state UI.
- Playwright seat smoke is defined for `/en/portal/company/seats` and `/zh/portal/company/seats`; authenticated DB-backed browser evidence remains environment-dependent.
