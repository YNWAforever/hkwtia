# M4C Task 1 report: AI-Ops materialized view

## Status
Implemented the `aiopsMonthlyMetrics` Drizzle materialized view, generated its migration metadata, added the unique month index required for concurrent refresh, and extended schema and migration contracts.

## Changed files
- `lib/db/schema-core.ts`: declared the `aiopsMonthlyMetrics` materialized view with the public scalar metric columns.
- `drizzle/0013_m4c_aiops_metrics.sql`: generated materialized-view migration plus `aiops_monthly_metrics_month_start_unique`.
- `drizzle/meta/0013_snapshot.json`: generated Drizzle snapshot metadata for `public.aiops_monthly_metrics`.
- `drizzle/meta/_journal.json`: generated `0013_m4c_aiops_metrics` journal entry.
- `tests/unit/m4c-schema-contract.test.ts`: new M4C export/migration/metadata/public-column contract.
- `tests/integration/migration.test.ts`: validates populated materialized view and unique index when `DATABASE_URL_TEST` is configured.
- `tests/unit/m4b-schema-contract.test.ts`: changed the legacy assertion from requiring M4B to remain the journal tail to requiring that its migration entry remains present; M4C correctly becomes the tail.

## TDD evidence
RED command:
```powershell
npm.cmd test -- tests/unit/m4c-schema-contract.test.ts
```
RED result: 1 failed test. Expected failure at `expect(view).toBeDefined()` because `aiopsMonthlyMetrics` was not yet exported.

GREEN command:
```powershell
npm.cmd test -- tests/unit/m4c-schema-contract.test.ts tests/unit/m4b-schema-contract.test.ts tests/unit/schema-contract.test.ts
```
GREEN result: 3 test files passed, 14 tests passed.

## Verification
```powershell
npm.cmd run typecheck
```
Result: passed with no TypeScript diagnostics.

```powershell
npm.cmd test -- tests/integration/migration.test.ts
```
Result: 1 test skipped because `DATABASE_URL_TEST` is not configured. The test contains the required `pg_matviews` and `pg_indexes` assertions for a configured database.

```powershell
npm.cmd test -- tests/unit/board-reporter-service.test.ts tests/unit/repository-boundary.test.ts
```
Result: 2 test files passed, 36 tests passed. This independently confirms the only two tests that timed out during the full concurrent suite.

```powershell
npm.cmd test -- --reporter=dot
```
Result: the final low-noise full-suite capture was interrupted after exceeding twice the clean baseline duration of approximately 207 seconds, so it is not treated as a passing full-suite verification. The partial capture showed unrelated default 5-second timeouts in `board-reporter-service` and `repository-boundary`; both passed independently above. This is a verification/infrastructure concern, not attributed to the Task 1 schema/migration changes.

```powershell
git diff --check
```
Result: passed.

## Self-review
- Twelve-month Hong Kong semantics: the view generates the current Hong Kong calendar month plus the preceding eleven months, flags the current month as partial, and derives month boundaries with `Asia/Hong_Kong`.
- Attribution: terminal outcomes use the latest completed concierge run before the conversation month's end; cost uses `started_at`; CSAT uses terminal `completed_at`; renewals use event occurrence in the month.
- Public data shape: the projection exposes only the required scalar aggregate metric columns. The schema contract rejects sensitive/raw identifier and content aliases.
- Concurrent refresh: migration creates the required unique `month_start` index.
- Metadata: the snapshot was generated with Drizzle and includes `public.aiops_monthly_metrics`; the journal ends with `0013_m4c_aiops_metrics`.
## Review-fix wave: database-backed metrics and privacy contracts

### Changes
- Strengthened `tests/unit/m4c-schema-contract.test.ts` to assert the exact 23 approved public column names from both the Drizzle materialized-view declaration and the generated snapshot metadata.
- Added an isolated `DATABASE_URL_TEST`-gated fixture in `tests/integration/migration.test.ts`. It truncates only the test database source rows, seeds deterministic cross-year Hong Kong month fixtures, refreshes the materialized view, then verifies:
  - exactly 12 ordered HKT months spanning a year boundary and true zero-activity rows;
  - deterministic latest terminal attempts;
  - cost attribution by `started_at` and CSAT attribution by `completed_at`;
  - per-membership renewal deduplication and numeric `renewalOrdinal` first-year behavior;
  - null rates for zero denominators; and
  - exact materialized-view columns, scalar PostgreSQL types, and rejection of identifier/content/JSON/array/free-text-like outputs.

### TDD evidence
The stricter unit contract was added before any production/schema adjustment. It passed immediately because the existing Task 1 Drizzle declaration and generated snapshot already had the exact approved 23-column scalar projection, so no production artifact adjustment was warranted.

```powershell
npm.cmd test -- tests/unit/m4c-schema-contract.test.ts
```
Result: 1 test file passed, 2 tests passed.

### Review-fix verification
```powershell
npm.cmd test -- tests/unit/m4c-schema-contract.test.ts tests/unit/m4b-schema-contract.test.ts tests/unit/schema-contract.test.ts
```
Result: 3 test files passed, 15 tests passed.

```powershell
npm.cmd test -- tests/integration/migration.test.ts
```
Result: 1 test file skipped; both integration tests (including the new database-backed fixture) are correctly gated because `DATABASE_URL_TEST` is not configured. No production database was provisioned or touched.

```powershell
npm.cmd run typecheck
```
Result: passed with no TypeScript diagnostics.

```powershell
git diff --check
```
Result: passed.

## Second re-review fix wave: every-month fixture, catalog fidelity, and first response

### Changes
- Corrected the fixture boundaries so the selected oldest reporting month, its own end, and the dashboard's full twelve-month reporting-window end are distinct. The score-1 out-of-window completion now occurs after the full window, not in the current partial month.
- Removed the calendar-year-count assertion so the test works in December as well as every other execution month; it now proves twelve sequential monthly dates directly.
- Extended the catalog assertion for every public view column with exact `numeric_precision`, `numeric_scale`, and `is_nullable` values, alongside the existing exact names and scalar type restrictions. PostgreSQL materialized-view catalog columns are intentionally asserted as nullable (`YES`); logical required fields remain declared non-null in the Drizzle/snapshot contract.
- Added deterministic fixture messages covering first-user selection, assistant ordering, a discrete median (1,000/3,000/10,000ms -> 3,000ms), and a user-only conversation that does not contribute to the response sample.

### Verification
```powershell
npm.cmd test -- tests/unit/m4c-schema-contract.test.ts tests/unit/m4b-schema-contract.test.ts tests/unit/schema-contract.test.ts
```
Result: 3 test files passed, 15 tests passed.

```powershell
npm.cmd test -- tests/integration/migration.test.ts
```
Result: 1 test file skipped; both integration tests are correctly gated because `DATABASE_URL_TEST` is absent. The fixture remains confined to the isolated test-database path; Production was not touched.

```powershell
npm.cmd run typecheck
```
Result: passed with no TypeScript diagnostics.

```powershell
git diff --check
```
Result: passed.

## Final re-review fix: partial-month contract

- The isolated fixture now independently queries the current Hong Kong calendar month and asserts that the materialized view has exactly one `is_partial_month = true` row, that it is the final/current HKT month, and that all preceding eleven rows are false.

```powershell
npm.cmd test -- tests/integration/migration.test.ts
```
Result: 1 test file skipped; both integration tests remain correctly gated because `DATABASE_URL_TEST` is absent.

```powershell
npm.cmd run typecheck
```
Result: passed with no TypeScript diagnostics after correcting the test fixture row type for `current_month`.

```powershell
git diff --check
```
Result: passed.
