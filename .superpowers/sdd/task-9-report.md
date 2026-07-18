# Task 9 - Transactional company seat management

## RED

- Focused seat tests initially failed because lib/db/repos/seats.ts did not exist.
- Focused scenarios cover pending capacity, normalized email mismatch, duplicate acceptance, last-owner protection, owner/admin policy, concurrent acceptance, duplicate invite idempotency, stale-target role authorization, and pending-invite revocation.

## GREEN

- Focused unit: tests/unit/seat-service.test.ts - 10/10 passed.
- Focused integration double: tests/integration/seat-capacity.test.ts - 1/1 passed via vitest.integration.config.ts; it proves serialized one-success/one-capacity-error behavior with an in-memory transaction double. A real Neon/Postgres concurrency run remains environment-dependent.
- Full Vitest: npm.cmd run test - 202 passed, 1 skipped.
- Lint: npm.cmd run lint - passed.
- Typecheck: npm.cmd run typecheck - passed.
- Visible-string audit: npm.cmd run audit:strings - passed (61 TSX files scanned).
- Production build: npm.cmd run build - passed; includes /[locale]/portal/company/seats and /[locale]/portal/company/seats/accept.
- Playwright: tests/e2e/seat-management.spec.ts - 2/2 anonymous localized protection checks passed against the configured dev server. The local proxy omitted nested request headers, so the smoke accepts the documented /portal continuation fallback; nested seat continuation is covered by unit navigation/auth tests.

## Implementation evidence

- lib/db/repos/seats.ts uses SHA-256 invitation digests, normalized emails, actor-first authorization, company row locking with FOR UPDATE, active plus pending capacity checks, duplicate pending-invite reuse, fresh locked target checks, pending-invite revocation, unique-membership conflict handling, and last-owner/role policy guards.
- The invite action uses Neon Auth magic-link delivery with a tokenized /portal/company/seats/accept callback; acceptance verifies the authenticated actor email, ensures a first-time profile row inside the transaction, and then inserts the company member row.
- portal/company/seats renders bilingual protected seat management with localized invite, role-change including owner-only owner controls, revoke, cancel-invite, capacity, pending, and generic error UI.
