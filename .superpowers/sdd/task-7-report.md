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

- The build reports the existing stale `caniuse-lite` data warning (13 months old); it does not fail the build and is unrelated to Task 7.
