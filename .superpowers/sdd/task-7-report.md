# Task 7 report: signed, idempotent Stripe webhook lifecycle

## Scope

- Added raw-body Stripe signature verification at `POST /api/stripe/webhook`.
- Normalized the five M1 Stripe lifecycle event types with strict membership, application, plan, customer, subscription, checkout-session, and client-reference correlation.
- Added one atomic repository transaction for job claiming, membership/attempt locking, lifecycle transition, audit append, and job completion.
- Added transient failure recording with redacted error summaries and deterministic invalid-event rejection.

## Review hardening

- Checkout activation locks the exact active `billing_attempts` row with `FOR UPDATE` before completing it.
- Membership locking precedes the latest Stripe lifecycle audit lookup, serializing concurrent webhook ordering.
- An event older than the latest committed Stripe audit bypasses only the current-status transition gate.
- A correlated stale event writes one `stripe.webhook.ignored_stale` audit and completes its job without mutating membership or billing-attempt rows.
- A stale event with mismatched ownership/correlation is rejected and the transaction rolls back.
- An exact event replay is returned as `duplicate` and cannot append a second audit.

## TDD evidence

- RED: repository transaction test failed because `locked_attempt AS` and the second `FOR UPDATE` were absent.
- RED: stale-event tests exposed that the prior branch still updated membership `updated_at` and applied the lifecycle status gate before stale detection.
- RED: the final serialization assertion failed until `latest_event` depended on `locked_membership`.
- GREEN: `npm.cmd test -- tests/unit/webhook-repository-transaction.test.ts tests/unit/webhook-service.test.ts tests/unit/webhook-route.test.ts` — 3 files, 22 tests passed.

## Fresh final verification

- `npm.cmd test` — 34 files, 149 tests passed.
- `npm.cmd run lint` — passed.
- `npm.cmd run typecheck` — passed.
- `npm.cmd run audit:strings` — passed; 51 TSX files scanned.
- `npm.cmd run build` — Next.js 16.2.10 production build passed; TypeScript and 49 static pages completed; `/api/stripe/webhook` emitted as a dynamic route.
- `git diff --check` and `git diff --cached --check` — passed before commit.

## Non-blocking baseline warning

## Transaction-isolation review fix

- Replaced the data-modifying CTE with explicit statements inside one `READ COMMITTED` database transaction.
- Statement order is claim/reclaim job, lock and correlate membership, read the latest lifecycle audit using a fresh statement snapshot, lock the exact checkout attempt, validate status, update each target at most once, append audit, then complete the job separately.
- Exact concurrent replay blocks at the unique job claim and returns `duplicate` without membership, attempt, or audit mutation after the winner commits.
- Transaction rollback removes a new processing claim when validation or mutation fails.
- The outside failure recorder inserts `failed` only when absent and updates only an existing `failed` row; it increments `attempt_count`, redacts the error, and cannot downgrade `processing` or `completed` after an ambiguous commit/network result.
- Lifecycle ordering is total and deterministic on `(stripeCreated, eventId)`; a lower or equal tuple is stale, including reverse arrival of contradictory same-second events.

### Follow-up TDD evidence

- RED: the sequential suite initially had 5 expected failures out of 6 because the implementation consumed one statement and lacked fresh snapshots, equal-second ordering, rollback scripting, and the safe failure recorder.
- GREEN: `npm.cmd test -- tests/unit/webhook-repository-sequential.test.ts tests/unit/webhook-service.test.ts tests/unit/webhook-route.test.ts` - 3 files, 22 tests passed.
- The obsolete one-statement regex suite was replaced by scripted results that model statement boundaries, rollback, stale no-op, replay, exact attempt locking, and separate job completion.

### Isolated PostgreSQL evidence

- Docker daemon and cached `postgres:16-alpine` were available, so a gated two-connection test was added at `tests/unit/webhook-postgres-concurrency.test.ts`.
- `RUN_POSTGRES_INTEGRATION=1 npm.cmd test -- tests/unit/webhook-postgres-concurrency.test.ts` - 1 test passed.
- The waiter blocked on the membership row lock, then its next `READ COMMITTED` statement saw the winner audit `100:evt_z`.
- The test used an ephemeral local container and two independent `psql` connections; no live Neon or production database was used.

### Post-fix verification

- The build reports the existing stale `caniuse-lite` data warning (13 months old); it does not fail the build and is unrelated to Task 7.
