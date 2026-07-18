# Task 1 report: M2 schema and sequential migration

## Summary

Implemented the M2 Admin CRM Drizzle schema, inferred row types, and sequential `0005_worried_kang.sql` migration. The migration is additive and safely backfills `profiles.auth_user_id` from the existing M1 `profiles.id` key before enforcing `NOT NULL` and uniqueness. Existing M1 profile creation paths map that same identity to the new field.

## Files changed

- `lib/db/schema-core.ts`
- `lib/db/repos/profiles.ts`
- `lib/db/repos/seats.ts`
- `drizzle/0005_worried_kang.sql`
- `drizzle/meta/0005_snapshot.json`
- `drizzle/meta/_journal.json`
- `tests/unit/m2-schema-contract.test.ts`
- `tests/integration/migration.test.ts`
- `tests/unit/repository-production-security.test.ts`

## RED

Command:

```powershell
npx.cmd vitest run tests/unit/m2-schema-contract.test.ts --reporter=dot
```

Result: failed as expected: 2 tests failed. The `profiles` table lacked `auth_user_id`, `email`, `role`, `last_login_at`, `consent_marketing`, and `interests`; the ten M2 table exports were `undefined`, producing `getTableConfig`'s expected missing-table error.

## GREEN and refactor verification

```powershell
npx.cmd vitest run tests/unit/m2-schema-contract.test.ts --reporter=dot
# PASS: 1 file, 2 tests

npx.cmd drizzle-kit generate --config=drizzle.config.ts
# PASS: generated drizzle/0005_worried_kang.sql

npx.cmd vitest run tests/unit/m2-schema-contract.test.ts tests/integration/migration.test.ts --reporter=dot
# PASS: 1 file/2 tests; migration integration test skipped because DATABASE_URL_TEST is absent

npm.cmd run typecheck
# PASS

npm.cmd run lint
# PASS

npm.cmd test
# PASS: 45 files/218 tests; 2 skipped because database environment variables are absent

npm.cmd run build
# PASS: Next.js production build
```

The first full suite run exposed one proxy-row test fixture whose ordered `profiles` columns no longer matched the expanded schema (`value.map is not a function` on `interests`). Updated that fixture with the new selected profile columns, reran the focused failing test (17 passed), then reran the complete suite successfully.

## Commit SHA

`011e49f` — `feat: add M2 admin CRM schema`

## Self-review findings

- The contract test is exactly scoped to the requested profile identity fields and ten CRM tables.
- All requested enums, columns, tables, indexes, foreign keys, composite key, and select types are present in `schema-core.ts`.
- `0005_worried_kang.sql` follows `0004_outgoing_vermin.sql`; migrations `0001` through `0004` were untouched.
- The `auth_user_id` migration sequence is nullable add, M1-key backfill, `NOT NULL`, then unique constraint; all other changes are additive.
- The guarded migration test runs `db:migrate` twice and verifies all ten M2 tables without printing `DATABASE_URL_TEST`.
- The new `authUserId` requirement is preserved for M1 repository inserts by setting it from their existing stable profile ID.

## Risks and remaining issues

- `DATABASE_URL_TEST` was not available locally, so the migration integration test was correctly skipped; its query and idempotence assertions are covered but require the isolated Neon test database for live execution.
- The build emitted an existing non-blocking Browserslist `caniuse-lite` staleness notice.
- `apply_patch` repeatedly failed to read both this linked worktree and temporary copies due the Windows sandbox helper's deny-read ACL error. With workspace-owner authorization, the exact Task 1 files were edited using a narrow elevated PowerShell transform/copy fallback; every resulting diff was inspected with `git diff --check` and focused diffs before verification.
