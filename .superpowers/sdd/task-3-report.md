# Task 3 report — actor authorization, Neon Auth, and repositories

## RED

Command:

```text
npm.cmd test -- tests/unit/actor-authorization.test.ts tests/unit/repository-scope.test.ts
```

Result before implementation: exit 1. Vitest could not resolve `@/lib/auth/actor` and `@/lib/db/repos/fakes`; both implementation boundaries were absent. This is the expected missing-feature failure.

## GREEN

Focused command:

```text
npm.cmd test -- tests/unit/actor-authorization.test.ts tests/unit/repository-scope.test.ts
```

Result after implementation: exit 0, 2 test files and 10 tests passed.

Full unit command:

```text
npm.cmd test -- --reporter=dot
```

Result: exit 0, 15 test files and 39 tests passed.

Static checks:

```text
npm.cmd run lint       # exit 0, no warnings
npm.cmd run typecheck  # exit 0
git diff --check       # exit 0
```

Repository boundary check found only a type-only/dynamic import of `lib/db/client` in `lib/db/repos/common.ts`; no repository statically imports the client. Runtime schema imports use `lib/db/server-schema`.

## Files

- `lib/auth/server.ts`: server-only Neon Auth singleton, explicit env-backed base URL/cookie secret, `getSession`, and `NeonSession` type.
- `lib/auth/actor.ts`: session-to-member conversion, `getActor`, `requireActor`, and the constrained Stripe webhook system actor.
- `app/api/auth/[...path]/route.ts`: Neon Auth catch-all handlers.
- `lib/db/repos/{common,profiles,companies,memberships,applications,jobs,audit-events,index}.ts`: actor-first repository predicates and server-only runtime boundaries.
- `tests/helpers/{fakes,repository-fakes}.ts`, `tests/unit/{actor-authorization,repository-scope}.test.ts`: self/cross-company authorization and webhook idempotency coverage; deterministic fakes stay test-only.
- `tests/neon-auth-server.ts`, `vitest.config.ts`: deterministic unit-test stub for the Next server entrypoint.

## Self-review

- Actor checks are performed before member/system-sensitive operations; company and membership reads/writes include actor predicates.
- Webhook jobs require `systemActor('stripe-webhook')`; `runKey` uniqueness returns `duplicate` only for the Postgres unique violation code.
- Anonymous reads are limited to explicitly directory-visible profiles/companies; anonymous writes and private records are denied.
- All test data uses in-memory fakes; no Neon or Stripe resources are contacted.
- No M0 routes or later portal/join behavior was added.

## Concerns

- The local unit suite aliases `@neondatabase/auth/next/server` to a tiny test stub because the installed Next ESM package cannot resolve its bare `next/headers` dependency under Vitest. Production code still uses the installed Neon Auth server entrypoint.
- The development fallback secret/base URL is intentionally non-production. During `next build`, `NEXT_PHASE=phase-production-build` uses non-production parsing so route modules remain importable; a running production server still calls `serverEnv()` and rejects missing values.

## Review fixes (2026-07-14)

RED evidence before fixes:

```text
npm.cmd test -- tests/unit/repository-mutation-scope.test.ts
```

Result: exit 1; all 3 new regression tests failed because fake repositories had no company/application mutation methods and memberships had no guarded update.

GREEN evidence after fixes:

```text
npm.cmd test -- tests/unit/repository-scope.test.ts tests/unit/repository-mutation-scope.test.ts tests/unit/actor-authorization.test.ts
```

Result: exit 0, 3 files and 13 tests passed. The new coverage proves system company removal is ID-scoped and member membership/application tenant reassignment is rejected.

```text
npm.cmd test -- --reporter=dot  # exit 0, 16 files and 42 tests passed
npm.cmd run lint                # exit 0, no warnings
npm.cmd run typecheck           # exit 0
git diff --check                # exit 0
```

Review corrections: deterministic fakes now live only under `tests/helpers/repository-fakes.ts`; every runtime repository entrypoint, including `index.ts`, is server-only; system company predicates retain the requested ID; update types omit tenant-target fields and runtime guards reject casted reassignment attempts; auth uses env values with only generated non-production values (no checked-in credentials), while production runtime `serverEnv()` validation remains strict and build-time imports remain viable.
Build viability evidence:

```text
$env:NODE_ENV=production
Remove-Item Env:DATABASE_URL,Env:NEON_AUTH_BASE_URL,Env:NEON_AUTH_COOKIE_SECRET,Env:STRIPE_SECRET_KEY,Env:STRIPE_WEBHOOK_SECRET,Env:APP_URL
npm.cmd run build  # exit 0
```

Next build sets `NEXT_PHASE=phase-production-build`, so auth imports use generated non-production configuration during static analysis; production runtime imports still call strict `serverEnv()`.
## Follow-up hygiene (2026-07-15)

- Removed the extra blank line at EOF in `lib/db/repos/common.ts`.
- `npm.cmd test -- --reporter=dot tests/unit/actor-authorization.test.ts tests/unit/repository-scope.test.ts tests/unit/repository-mutation-scope.test.ts`: exit 0, 3 files and 13 tests passed.
- `git diff --check`: exit 0.
## Admin shell and member list update (2026-07-19)

### Summary

Implemented the staff-only `/admin` shell and searchable member list. The service validates query input with Zod, requires an admin actor before repository access, and the repository performs case-insensitive server-side profile, email, and company search with a base64url cursor ordered by normalized display name then profile ID.

### Files

- `lib/admin/member-types.ts`
- `lib/admin/members.ts`
- `lib/db/repos/admin-members.ts`
- `components/admin/admin-nav.tsx`
- `components/admin/member-table.tsx`
- `app/[locale]/(admin)/admin/layout.tsx`
- `app/[locale]/(admin)/admin/page.tsx`
- `app/[locale]/(admin)/admin/members/page.tsx`
- `messages/en.json`
- `messages/zh-HK.json`
- `tests/unit/admin-member-list.test.ts`
- `tests/unit/admin-presentational.test.tsx`

### RED/GREEN evidence

- RED: `npx.cmd vitest run tests/unit/admin-member-list.test.ts tests/unit/admin-presentational.test.tsx --reporter=dot` failed as expected with Vite import-resolution errors for the absent `@/lib/admin/members` and `@/components/admin/admin-nav` modules.
- GREEN: `npx.cmd vitest run tests/unit/admin-member-list.test.ts tests/unit/admin-presentational.test.tsx tests/unit/messages.test.ts --reporter=dot` passed: 3 files, 5 tests.
- `npm.cmd run typecheck` passed.
- `npm.cmd run lint` passed.
- `npm.cmd test` passed: 55 files / 240 tests, with 2 environment-gated tests skipped.
- `npm.cmd run build` passed; the only output was the pre-existing Browserslist database freshness advisory.
- `npm.cmd run audit:strings` passed: 73 TSX files scanned.

### Commit

`087833a feat: add protected admin member list`

### Self-review

- The admin layout calls `requireAdminActor()` and turns both `UNAUTHORIZED` and `FORBIDDEN` into `notFound()`.
- All new page and component labels are supplied from the parity-checked `Admin` namespace; the shell remains server-rendered and does not fetch client-side.
- Repository access is behind the service and requires an admin actor both at the service boundary and repository boundary.
- Diff, staged-diff whitespace, status, and BOM checks were completed before the feature commit. All Task 3 files are UTF-8 without a BOM.

### Risks and tool fallback

- The deterministic `ROW_NUMBER()` projection resolves multi-company duplicates, and its representative-company tie-break is documented and tested.
- The linked-worktree sandbox repeatedly returned `helper_unknown_error: apply deny-read ACLs`. After normal reads and an `apply_patch` update attempt failed, only a narrow BOM-free PowerShell fallback was used for identified Task 3 files: reading guidance/target files and editing the two message bundles plus two just-created test files. No tree-wide transformation was performed.

## Review fixes (2026-07-19)

### RED

`npx.cmd vitest run tests/unit/admin-members-repository.test.ts tests/unit/admin-member-page-boundary.test.ts tests/unit/admin-presentational.test.tsx --reporter=dot` exited 1: 3 files failed / 4 tests failed / 5 passed. Expected failures were the missing route-boundary parser, the unprojected repository cursor failure against multi-company rows, and missing localized brand labels.

### GREEN and verification

- Focused review suite: 5 files / 12 tests passed.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed.
- `npm.cmd run audit:strings`: passed, 73 TSX files scanned.
- `npm.cmd test`: 57 files / 247 tests passed; 2 environment-gated tests skipped.
- `npm.cmd run build`: passed. `/[locale]/admin` and `/[locale]/admin/members` are dynamic routes. The only advisory was the stale Browserslist database.

### Review implementation

- `matching_profiles` preserves truthfulness for searches matching any active company before `candidate_rows` chooses a representative. `ROW_NUMBER() OVER (PARTITION BY profile)` selects one row before outer cursor pagination.
- Representative tie-break is membership-status priority (`active`, `past_due`, ending, pending, terminal), then membership ID and company ID. The SQL proxy test simulates multiple company/membership candidates and proves alpha/beta followed by charlie without duplicate or skip.
- The route calls `parseAdminMemberRouteQuery` before authentication/service/repository work. It rejects array-shaped search terms, out-of-range limits, and invalid base64url cursor payloads; service validation remains in place.
- Removed the inaccurate Previous link. Next links retain `q` and carry the opaque cursor.
- Moved the admin brand copy to the parity-checked `Admin.brand` translation key and supplied it to both admin navigation and landing page.

### Tool fallback

The linked-worktree deny-read ACL helper continued to reject normal update reads. After `apply_patch` failed, only identified Task 3 files were changed through narrow BOM-free PowerShell writes; no tree-wide transformation was performed.
