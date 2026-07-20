# Task 8 Report: Repository-backed events and idempotent check-in

## Outcome

DONE_WITH_CONCERNS

Task 8 replaces the static production event source with Actor-first database repositories, serialized member registration, audited event management, idempotent attendance check-in, localized public/member/admin Server Components, and real admin not-found boundaries.

## Exact TDD evidence

Initial RED, before production edits:

```powershell
npx.cmd vitest run tests/unit/admin-events.test.ts tests/unit/event-check-in.test.ts tests/unit/public-event-repository.test.ts --reporter=dot
```

Result: 3 failed suites and no collected tests. Vite reported the expected missing modules `@/lib/db/repos/events` and `@/lib/admin/events`.

Focused GREEN after implementation and the repository-layer refactor:

```powershell
npx.cmd vitest run tests/unit/admin-events.test.ts tests/unit/event-check-in.test.ts tests/unit/public-event-repository.test.ts --reporter=dot --maxWorkers=2 --minWorkers=1
```

Result: 3 files passed; 8/8 tests passed in 24.70 seconds.

Brief regression GREEN:

```powershell
npx.cmd vitest run tests/unit/admin-events.test.ts tests/unit/event-check-in.test.ts tests/unit/public-event-repository.test.ts tests/unit/content-contract.test.ts tests/unit/detail-pages.test.ts tests/unit/portal-content-scope.test.ts --reporter=dot --maxWorkers=2 --minWorkers=1
```

Result: exit 0 for all six files.

## Files

- Added `lib/db/repos/events.ts` and `lib/db/repos/event-check-in.ts`
- Added `lib/admin/events.ts`
- Added `components/admin/event-form.tsx` and `components/admin/attendee-table.tsx`
- Added admin event list/create and detail/update/check-in routes under `app/[locale]/(admin)/admin/events-mgmt`
- Replaced public event list/detail and member portal event reads with repository-backed runtime reads
- Updated `lib/portal/content.ts`, `components/admin/admin-nav.tsx`, and both locale bundles
- Added the three Task 8 unit files and updated the explicit portal-reader injection contract test

## Verification

- `npm.cmd run typecheck`: PASS
- `npm.cmd run lint`: PASS
- `npm.cmd run audit:strings`: PASS; 85 TSX files scanned
- `npm.cmd test -- --reporter=dot --maxWorkers=4 --minWorkers=2`: PASS; 77 files passed, 3 skipped; 347 tests passed, 4 skipped
- `npm.cmd run build`: PASS; repository-backed public/member/admin event routes are dynamic
- First build was a useful RED: static `/en/events` attempted production environment initialization. Marking both repository-backed public event routes `force-dynamic` resolved it.
- `git diff --check`: PASS, with expected Windows LF/CRLF notices only
- UTF-8 BOM scan across 18 changed files: PASS
- Node UTF-8 parse of both locale JSON files: PASS

## Self-review

- Authorization is Actor-first. Admin mutations and check-in require admin before Zod parsing or database work; registration requires a member and always uses `actor.profileId`.
- Public reads return only published, non-member events. Member reads return published events. Admin reads and mutations require admin.
- Create, update, registration, and check-in audit records share the same transaction as their mutations. Check-in also inserts the engagement fact in that transaction.
- Registration locks the event row before counting confirmed registrations, so concurrent capacity decisions serialize. Existing registered/waitlisted rows return stable idempotent dispositions.
- Check-in locks the composite registration row. An existing `checkedInAt` returns `already_checked_in`; the first mutation marks attendance and inserts exactly one engagement fact with stable `registrationKey` metadata.
- Public and portal production readers have no fallback to `content/events.ts`; test readers remain explicit injected dependencies.
- Dynamic IDs and slugs are Zod-validated. Missing or malformed admin event IDs produce a real Next.js 404. Server Components remain the default and no PII is logged.

## Concern and evidence gap

- Capacity and check-in concurrency are implemented with PostgreSQL `FOR UPDATE` locks and have deterministic injected transaction coverage, but Task 8 did not add a fresh real-Postgres concurrency run. The reviewed Task 7 local Postgres harness was not reused because this task's schema already had focused contract coverage and all non-production gates were green. A follow-up integration test should race two registrations for the last seat and two check-ins for one registration against an isolated local PostgreSQL database.
- The build retains the existing stale `caniuse-lite` warning; Task 8 changed no dependency manifests.

## Tool fallback

The linked Windows worktree repeatedly caused `apply_patch` to fail with `helper_unknown_error: apply deny-read ACLs`. After attempting `apply_patch` first, edits were restricted to the exact Task 8 files and written as BOM-free UTF-8. Final BOM, diff, lint, typecheck, test, string-audit, JSON, and build gates passed.
