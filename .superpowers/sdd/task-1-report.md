# Task 1 Report: M6 schema, contracts, and migration

## Changed files

- `lib/db/schema-core.ts`
  - Added the cohort status, application stage, and landing-partner MOU enums.
  - Added `cohorts`, `cohort_applications`, and `landing_partners` with the required foreign keys, indexes, and additive checks.
  - Added the non-null `showcase_listings.gone_global` projection with a `false` default.
- `lib/launchpad/contracts.ts`
  - Added bounded, strict Zod contracts for cohort applications, stages, public cohorts, and safe public partners.
  - Added `parseCohortStage` and `parseCohortApplicationInput` parsing helpers.
- `drizzle/0015_m6_launch_pad.sql`
- `drizzle/meta/0015_snapshot.json`
- `drizzle/meta/_journal.json`
  - Generated from the M6 schema; the final journal tag is `0015_m6_launch_pad`.
- `tests/unit/m6-schema-contract.test.ts`
- `tests/unit/m6-contracts.test.ts`
  - Added schema/migration metadata and contract behavior coverage.
- `tests/unit/m5-admin-review.test.tsx`
  - Added `goneGlobal: false` to an existing typed Showcase fixture, required by the additive non-null schema column.

## Test-first evidence

1. Wrote both M6 test files before changing the schema or adding contracts.
2. Initial exact RED command:

```powershell
npm.cmd test -- tests/unit/m6-schema-contract.test.ts tests/unit/m6-contracts.test.ts
```

It initially could not locate `vitest` because this newly created worktree had no `node_modules`. I created a local junction to the existing M5 worktree dependency directory; no dependency versions or remote resources changed.

3. Re-ran the same RED command. It failed as intended because the M6 enum/table exports and migration files were absent, and `@/lib/launchpad/contracts` could not resolve.

4. Generated migration metadata after the schema implementation:

```powershell
npx.cmd drizzle-kit generate --name m6_launch_pad
```

5. Final focused verification:

```powershell
npm.cmd test -- tests/unit/m6-schema-contract.test.ts tests/unit/m6-contracts.test.ts
```

Result: `2 passed` test files; `6 passed` tests.

6. Strict typing verification:

```powershell
npm.cmd run typecheck
```

Result: passed. The first run correctly identified the existing M5 typed fixture omission; it passed after the fixture was updated for the new required column.

## Self-review

- Confirmed all migration changes are additive and no prior migration was edited.
- Confirmed the generated migration creates the three enums/tables, both application foreign keys, named unique application scope, explicit public indexes, and `gone_global` default.
- Confirmed the generated snapshot and journal agree with migration tag `0015_m6_launch_pad`.
- Confirmed `git diff --check` reports no whitespace errors (only existing Windows line-ending warnings).
- No Production/shared environment or database was accessed.

## Commit

`feat: add M6 launch pad schema and contracts`

## Concerns

- The isolated worktree depends on a local ignored `node_modules` junction for test execution because it did not initially contain dependencies. The source and committed migration artifacts are self-contained.
