# M2 Task 2 report

## Summary
Implemented strict profile-backed authenticated actors, staff/admin authorization, profile identity resolution with best-effort last-login updates, and repository-only portal database reads. Added the production import boundary test and ESLint restriction.

## Files changed
- Actor/auth: `lib/membership/lifecycle.ts`, `lib/auth/actor.ts`
- Repositories: `lib/db/repos/common.ts`, `lib/db/repos/profile-identities.ts`, `lib/db/repos/portal-content.ts`, `lib/db/repos/index.ts`
- Portal/boundary: `lib/portal/queries.ts`, `lib/portal/content.ts`, `lib/portal/seats.ts`, `eslint.config.js`
- Compatibility: member-only repository guards and required `profileId` test fixtures/assertions
- Boundary compatibility: authorization-only imports moved in `lib/portal/commands.ts` and `lib/billing/webhook-service.ts`

## RED
Command: `npx.cmd vitest run tests/unit/actor-authorization.test.ts tests/unit/admin-repository-authorization.test.ts tests/unit/repository-boundary.test.ts --reporter=dot`

Result: expected failure - 3 files failed, 6 tests failed, 3 passed. Failures proved missing profileId/staff resolution, absent `requireAdmin`, and direct database/common imports outside repositories.

## GREEN and regression verification
- Focused suite: PASS - 5 files, 24 tests.
- `npm.cmd run typecheck`: PASS.
- `npm.cmd run lint`: PASS.
- `npm.cmd test`: PASS - 47 files / 222 tests; 2 skipped integration tests.
- `npm.cmd run build`: PASS in 54.5 seconds; 67 static pages generated. Only the existing Browserslist data-staleness notice appeared.

## Commit
Feature commit: `9891246`.

## Self-review
- `sessionToActor()` is async and resolves role/profileId from the application profile resolver.
- `getActor()` uses the real repository by default and treats last-login write failures as non-authentication failures.
- `requireAdmin()` and `requireAdminActor()` are present.
- Portal directory, company-role, and seat-overview reads reside in `lib/db/repos/portal-content.ts`.
- Production direct imports of the DB client/common module are prohibited outside repositories by ESLint and the boundary test.
- Staff actors are explicitly denied member-only repository scopes.
- Every semantic production/test diff was inspected; garbled fixture text and unrelated encoding artifacts were removed before staging.

## Risks/issues
- The linked-worktree sandbox repeatedly returned `apply deny-read ACLs`, including for `apply_patch`. Per the brief, a narrow elevated PowerShell fallback was used for Task 2 files.
- The fallback briefly introduced false-dirty UTF-8 BOM/EOL noise throughout `tests/`. It was detected and removed before staging; no hash-identical noise is included in the commit.
