# Task 1 report: runtime configuration and database foundation

## Files changed

- `lib/config/env.ts`: typed server/public environment contracts with production credential validation and local site URL fallback.
- `lib/db/client.ts`: server-side Neon HTTP and Drizzle client; connection values are never logged.
- `drizzle.config.ts`: PostgreSQL Drizzle Kit configuration using `DATABASE_URL`.
- `scripts/db-migrate.ts`: migration command runner with safe missing-credential errors and no credential output.
- `scripts/db-seed.ts`: explicit seed command contract pending schema seed rows.
- `package.json`, `package-lock.json`: Drizzle, Neon serverless/Auth, Stripe, and Drizzle Kit dependencies; database npm commands no longer use the retired placeholder.
- `.env.example`, `AGENTS.md`: runtime variable names and database command guidance.
- `tests/unit/env-contract.test.ts`, `tests/unit/db-script-contract.test.ts`: focused environment and command contracts.

## RED evidence

Command:

```text
npm.cmd test -- tests/unit/env-contract.test.ts tests/unit/db-script-contract.test.ts
```

The expected RED state was observed: Vitest could not resolve `@/lib/config/env`, and the database command assertions reported the existing `node scripts/not-available.mjs db:migrate M1` and `db:seed M1` placeholders instead of the Drizzle/seed commands.

## GREEN evidence

Focused command:

```text
npm.cmd test -- tests/unit/env-contract.test.ts tests/unit/db-script-contract.test.ts
```

Result: 2 test files passed, 6 tests passed.

Additional verification:

```text
npm.cmd run lint       # passed
npm.cmd run typecheck  # passed
npm.cmd test           # 11 files, 19 tests passed
```

## Self-review

- Production parsing validates all six server-only values and reports variable names only; it never includes credential values in errors or logs.
- Public configuration exposes only `NEXT_PUBLIC_SITE_URL`, with the existing localhost fallback preserved.
- The database client is server-side by module placement and does not log or serialize its connection string.
- English/Traditional Chinese message bundles and M0 route behavior were not changed.

## Concerns

- The seed command intentionally has no schema rows yet; Task 2/Task 11 will add the migration-backed seed implementation.
- `drizzle-kit migrate` will require the schema introduced by Task 2 before it can apply a real migration.
- Existing npm installation regenerated a large `package-lock.json` dependency graph while adding the requested packages.

## Fixes after review

- Updated `AGENTS.md` Stack, Commands, and Changelog entries to document the M1 Neon/Drizzle runtime and the current Windows-safe database command wiring. `db:seed` remains an explicit no-op until Task 11 adds schema-backed seed rows.
- Added explicit `import "server-only";` boundaries to `lib/config/env.ts` and `lib/db/client.ts`, plus the direct `server-only` dependency required by those imports. Vitest uses a test-only shim so the server boundary remains enforced in application code without breaking unit-test imports.
- Wired `db:migrate` through `scripts/db-migrate.ts`; the wrapper selects `drizzle-kit.cmd` on Windows and `drizzle-kit` elsewhere. The reviewer's unused-script concern is therefore resolved without expanding seed scope.

Verification after fixes:

```text
npm.cmd test -- tests/unit/env-contract.test.ts tests/unit/db-script-contract.test.ts
> hkwtia-platform@0.0.0 test
> vitest run tests/unit/env-contract.test.ts tests/unit/db-script-contract.test.ts
Test Files  2 passed (2)
Tests       6 passed (6)

npm.cmd test
> hkwtia-platform@0.0.0 test
> vitest run
Test Files  11 passed (11)
Tests       19 passed (19)

npm.cmd run lint
> hkwtia-platform@0.0.0 lint
> eslint .

npm.cmd run typecheck
> hkwtia-platform@0.0.0 typecheck
> tsc --noEmit
```
