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

## Blocking review fix: profile identity ownership and repository authorization

### Findings addressed
- Migrated all profile-owned repository/service foreign keys, scopes, and writes from authentication `userId` to application `profileId`: profiles, applications, companies, memberships, billing attempts, onboarding/join, portal dashboard/profile, seats, and audit events.
- Retained `actor.userId` only for the true authentication mapping written to `profiles.auth_user_id`. System-created profile fallback continues using the explicit input ID because system actors have no authentication user ID.
- Changed `portalContentRepository.getCompanyRole()` and `listDirectory()` to accept `Actor` and enforce member authorization at runtime before any database access.
- Extended repository-boundary discovery to both `.ts` and `.tsx` files.

### Review RED
Command: `npx.cmd vitest run tests/unit/profile-identity-boundaries.test.ts tests/unit/profile-identity-repository.test.ts tests/unit/profile-identity-billing.test.ts tests/unit/portal-content-runtime-authorization.test.ts tests/unit/repository-boundary.test.ts --reporter=dot`

Result before production fixes: expected failure - 5 files failed, 11 tests failed, 1 passed. Failures showed auth IDs reaching portal/onboarding/billing scopes, distinct-ID seat ownership being rejected, profile repository guards rejecting the application profile ID, portal repository methods reaching database initialization for anonymous/staff actors, and `.tsx` discovery returning no files.

### Review GREEN and regression verification
- Focused review suite: PASS - 5 files / 12 tests.
- `npm.cmd run typecheck`: PASS.
- `npm.cmd run lint`: PASS.
- `npm.cmd test`: PASS - 51 files / 233 tests; 2 skipped integration tests.
- `npm.cmd run build`: PASS; compiled in 6.1 seconds, TypeScript completed in 10.7 seconds, and 67 static pages were generated. Only the existing Browserslist data-staleness notice appeared.

### Review commit and self-review
- Fix commit: `bb94b80` (`fix: use profile identity for member ownership`).
- A broader aliased-actor audit confirmed the only remaining production `actor.userId` uses write `profiles.auth_user_id`; all member/profile database ownership paths use `actor.profileId`.
- Every staged semantic diff was inspected. `git diff --check` passed, all changed/new files were BOM-free, and no unrelated or hash-identical encoding noise was staged.
