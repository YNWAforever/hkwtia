# Task 8 Report: Repository-backed events and idempotent check-in

## Outcome

DONE

Task 8 replaces the static production event source with Actor-first database repositories, serialized member registration, audited event management, idempotent attendance check-in, localized public/member/admin Server Components, and real not-found boundaries. Review hardening now also enforces eligible membership at the repository and transaction boundaries, restores full event-detail SEO, returns safe localized action states, validates resulting event periods, and proves concurrency against disposable PostgreSQL 16.

## Exact TDD evidence

Initial RED, before the first production implementation:

```powershell
npx.cmd vitest run tests/unit/admin-events.test.ts tests/unit/event-check-in.test.ts tests/unit/public-event-repository.test.ts --reporter=dot
```

Result: three failed suites; the expected event repository and admin event modules did not exist.

Review RED, before review fixes:

```powershell
npx.cmd vitest run tests/unit/admin-events.test.ts tests/unit/public-event-repository.test.ts tests/unit/event-detail-seo.test.ts tests/unit/event-action-state.test.ts --reporter=dot --maxWorkers=2 --minWorkers=1
```

Result: four files failed, with 6 failed and 4 passed tests. The failures demonstrated inactive-member access, malformed-slug exceptions, missing resulting-period validation, missing shared SEO/JSON-LD wiring, and missing safe action-state helpers.

Focused and required regression GREEN:

```powershell
npx.cmd vitest run tests/unit/admin-events.test.ts tests/unit/event-check-in.test.ts tests/unit/public-event-repository.test.ts tests/unit/event-detail-seo.test.ts tests/unit/event-action-state.test.ts tests/unit/content-contract.test.ts tests/unit/detail-pages.test.ts tests/unit/portal-content-scope.test.ts --reporter=verbose --maxWorkers=2 --minWorkers=1
```

Result: 8 files passed; 25/25 tests passed.

Gated real-PostgreSQL race GREEN:

```powershell
$env:RUN_POSTGRES_INTEGRATION='1'
npx.cmd vitest run tests/unit/task8-postgres-integration.test.ts --reporter=verbose --maxWorkers=1 --minWorkers=1
```

Result: 1 file passed; 1/1 test passed. Two concurrent registrations for a capacity-one event produced exactly one `registered` and one `waitlist`. Two concurrent check-ins produced one `checked_in`, one `already_checked_in`, exactly one attendance engagement fact, and exactly one audit event. The test starts and removes a disposable `postgres:16-alpine` container and never reads a production database URL.

## Review fixes

- Member event lists reject inactive memberships before reading rows. RSVP rechecks an eligible direct or company membership inside the same locked transaction as the capacity decision.
- Public repository-backed event detail pages use localized database data with `buildPageMetadata`, canonical/hreflang, Open Graph, Twitter, and `buildEventData` JSON-LD.
- Create, update, check-in, and RSVP actions return localized generic success/error states through `aria-live`; validation errors are field-linked and preserve only the event form's allowlisted non-sensitive values.
- Event updates validate the resulting persisted period after merging partial input with the locked current row. Malformed public slugs return a safe not-found result.
- Attendee statuses, dates, pending labels, and admin event titles are localized.
## Second re-review: Server Action serialization and Hong Kong event time

Serialization RED, before production edits:

```powershell
npx.cmd vitest run tests/unit/event-server-action-serialization.test.ts --reporter=verbose --maxWorkers=1 --minWorkers=1
```

Result: 1 file failed; 4/4 tests failed. The admin create, update, and check-in actions plus member RSVP action each called the captured next-intl translator from inside a client-bound inline Server Action.

Datetime RED, before the helper existed:

```powershell
npx.cmd vitest run tests/unit/event-hong-kong-datetime.test.ts --reporter=verbose --maxWorkers=1 --minWorkers=1
```

Result: the suite failed to resolve the intended `@/lib/admin/event-form-input` conversion seam. Its behavioral cases specify winter, summer, and year-boundary round trips plus `18:00` Hong Kong form input persisting as `10:00Z`.

Focused GREEN after the minimal fixes:

```powershell
npx.cmd vitest run tests/unit/event-server-action-serialization.test.ts tests/unit/event-hong-kong-datetime.test.ts tests/unit/admin-events.test.ts tests/unit/event-check-in.test.ts tests/unit/public-event-repository.test.ts tests/unit/event-detail-seo.test.ts tests/unit/event-action-state.test.ts tests/unit/content-contract.test.ts tests/unit/detail-pages.test.ts tests/unit/portal-content-scope.test.ts --reporter=verbose --maxWorkers=2 --minWorkers=1
```

Result: 10 files passed; 33/33 tests passed. Action messages are resolved to plain serializable objects before action definitions. Admin form values now parse and format explicitly in `Asia/Hong_Kong`, independent of the process timezone.

## Verification

- `npm.cmd run typecheck`: PASS
- `npm.cmd run lint`: PASS
- `npm.cmd run audit:strings`: PASS; 86 TSX files scanned
- `npm.cmd test -- --reporter=dot --maxWorkers=4 --minWorkers=2`: PASS; 81 files passed, 4 skipped; 363 tests passed, 5 skipped
- `npm.cmd run build`: PASS; repository-backed public/member/admin event routes are dynamic
- `$env:TZ='America/New_York'; npx.cmd vitest run tests/unit/event-hong-kong-datetime.test.ts ...`: PASS; 4/4 tests, proving process-timezone independence
- Node UTF-8 parse of both locale JSON files: PASS
- `git diff --check`: PASS, with expected Windows LF/CRLF notices only
- UTF-8 BOM scan across all changed and untracked files: PASS
- Task-scoped error/PII scan: PASS; no raw caught error, action payload, or profile/event identifier is surfaced to action-state messages
- Disposable Task 8 container cleanup check: PASS

## Self-review

- Authorization is Actor-first. Admin mutations and check-in require admin before Zod parsing or database work; member listing and registration require a member before data access.
- Active membership is a data boundary, not only a route guard. Registration checks it inside the serialized transaction to close time-of-check/time-of-use drift.
- Create, update, registration, and check-in audit records share the same transaction as their mutations. Check-in also inserts the engagement fact in that transaction.
- Registration locks the event row before counting confirmed registrations. Check-in locks the composite registration row; repeat check-in returns an idempotent disposition without another engagement or audit.
- Public and portal production readers have no fallback to static event content. Test readers remain explicit injected dependencies.
- Dynamic IDs and slugs are Zod-validated. Missing or malformed routes produce real Next.js not-found behavior, and no PII is logged.

## Remaining baseline note

The build retains the existing stale `caniuse-lite` warning. Task 8 changed no dependency manifests.

## Tool fallback

The linked Windows worktree repeatedly caused `apply_patch` to fail with `helper_unknown_error: apply deny-read ACLs`. After attempting `apply_patch` first, edits were restricted to the exact Task 8 files and written as BOM-free UTF-8. Final BOM, diff, lint, typecheck, test, string-audit, JSON, PostgreSQL, and build gates passed.
