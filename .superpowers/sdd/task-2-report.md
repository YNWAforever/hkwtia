# Task 2 report: membership schema, constraints, and lifecycle rules

Status: complete

## Files changed

- `lib/db/schema.ts`: Drizzle PostgreSQL enums and tables for profiles, companies, company members, seat invitations, plans, applications, memberships, jobs, and audit events. All timestamp columns use `withTimezone: true`; foreign keys, checks, indexes, and unique constraints are defined in the schema.
- `lib/membership/lifecycle.ts`: actor and membership domain types, plan/status literals, membership record shape, and explicit transition policy.
- `drizzle/0001_m1_membership.sql`: generated PostgreSQL migration.
- `drizzle/meta/0001_snapshot.json`, `drizzle/meta/_journal.json`: generated migration metadata aligned to `0001_m1_membership`.
- `tests/unit/membership-lifecycle.test.ts`, `tests/unit/schema-contract.test.ts`: lifecycle and schema contract tests.

## TDD evidence

The required focused RED state was captured with the production modules temporarily moved to a reversible `C:\\tmp` backup:

```text
npm.cmd test -- tests/unit/membership-lifecycle.test.ts tests/unit/schema-contract.test.ts
Exit code: 1
2 failed suites; Vitest could not resolve `@/lib/membership/lifecycle` and `@/lib/db/schema` because the modules were absent.
```

The modules were restored immediately after the RED run.

## Verification

Focused Task 2 tests:

```text
npm.cmd test -- tests/unit/membership-lifecycle.test.ts tests/unit/schema-contract.test.ts
Exit code: 0
2 test files passed, 7 tests passed.
```

Full unit suite:

```text
npm.cmd test
Exit code: 0
13 test files passed, 27 tests passed.
```

Lint and typecheck:

```text
npm.cmd run lint
Exit code: 0

npm.cmd run typecheck
Exit code: 0
```

Drizzle verification:

```text
npx.cmd drizzle-kit check --config drizzle.config.ts
Exit code: 0
Everything's fine.

npx.cmd drizzle-kit generate --config drizzle.config.ts
Exit code: 0
No schema changes, nothing to migrate.
```

Generated SQL inspection confirmed:

- 22 `timestamp with time zone` columns and zero bare `timestamp` columns.
- Unique `jobs.run_key` constraint (`jobs_run_key_unique`).
- Exactly-one target check for `memberships.owner_user_id` versus `memberships.company_id` (`memberships_target_check`).
- Partial unique active company/member index (`company_members_active_company_user_unique`) on `(company_id, user_id)` where `revoked_at IS NULL`.
- 12 foreign-key constraints and the seat-limit check are present.

## Concerns

- The company/member uniqueness is intentionally partial so revoked historical memberships can be retained while only one active row exists for a company/user pair.
- No production database or credentials were accessed or changed.
