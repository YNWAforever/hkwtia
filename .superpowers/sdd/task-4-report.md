# M3 Task 4 report - lifecycle journey enrollment

## Status

Implemented idempotent lifecycle and renewal enrollment from current membership state. Stripe lifecycle rows are inserted through an executor-aware helper inside the existing non-stale webhook transaction; Community activation enrolls immediately through a system-only journey repository dependency, with reconciliation as the repair path.

## Authoritative identity decisions

- Onboarding uses `activation:<membershipId>`.
- Webhook dunning uses `payment:<Stripe eventId>` and anchors to `eventCreated`.
- Webhook cancellation uses `termination:<Stripe eventId>` and anchors to `eventCreated`.
- Lifecycle reconciliation reads the latest `stripe.webhook.processed` membership audit whose metadata status matches the current state, then reuses its request ID and Stripe-created/transition time. Rows without that authoritative audit are skipped with `MISSING_LIFECYCLE_AUDIT`; no wall-clock or membership-only identity is invented.
- Renewal uses `period:<billingPeriodEnd ISO>` and anchors every step to the billing-period end.
- `expired` represents the current schema's lapsed terminal state. A future manual D14 lapse identity remains Task 7 scope.

## RED evidence

Corrected lifecycle RED command, run before production modules:

```text
npm.cmd test -- tests/unit/journey-enrollment.test.ts tests/unit/webhook-service.test.ts tests/unit/join-service.test.ts
```

Exit code: `1`.

```text
FAIL tests/unit/journey-enrollment.test.ts
Failed to resolve import "@/lib/automation/enrollment"

FAIL tests/unit/join-service.test.ts
expected [] to contain onboarding welcome enrollment

Test Files 2 failed | 1 passed (3)
Tests 1 failed | 19 passed (20)
```

Eligibility-filter RED, captured before filtering reconciliation candidates:

```text
npm.cmd test -- tests/unit/journey-enrollment.test.ts
```

Exit code: `1`; 2 tests failed and 4 passed. The failures proved pending memberships incorrectly counted as lifecycle errors and free memberships without a billing period incorrectly counted as renewal errors.

## GREEN evidence

Final lifecycle/webhook command:

```text
npm.cmd test -- tests/unit/journey-enrollment.test.ts tests/unit/webhook-service.test.ts tests/unit/join-service.test.ts tests/unit/webhook-postgres-concurrency.test.ts tests/unit/webhook-repository-sequential.test.ts
```

Exit code: `0`.

```text
Test Files 4 passed | 1 skipped (5)
Tests 33 passed | 1 skipped (34)
```

The skipped PostgreSQL webhook concurrency file is gated by `RUN_POSTGRES_INTEGRATION=1`; that flag is absent. `DATABASE_URL_TEST` is also absent. These are skips, not passes.

Static verification:

```text
npm.cmd run typecheck
```

Exit code: `0`.

```text
npm.cmd exec eslint -- lib/automation/enrollment.ts lib/automation/renewal-runner.ts lib/db/repos/jobs.ts lib/membership/onboarding.ts tests/unit/journey-enrollment.test.ts tests/unit/join-service.test.ts tests/unit/webhook-service.test.ts tests/unit/webhook-postgres-concurrency.test.ts tests/unit/webhook-repository-sequential.test.ts
```

Exit code: `0`, with no errors or warnings.

## Full root suite

Command:

```text
npm.cmd test -- --reporter=dot
```

Exit code: `0`.

```text
Test Files 109 passed | 8 skipped (117)
Tests 529 passed | 20 skipped (549)
Duration 81.05s
```

## Files changed

- `lib/automation/enrollment.ts`
- `lib/automation/renewal-runner.ts`
- `lib/db/repos/jobs.ts`
- `lib/membership/onboarding.ts`
- `tests/unit/journey-enrollment.test.ts`
- `tests/unit/join-service.test.ts`
- `tests/unit/webhook-service.test.ts`
- `tests/unit/webhook-postgres-concurrency.test.ts`
- `tests/unit/webhook-repository-sequential.test.ts`

The sequential webhook test was necessarily updated because successful non-stale transactions now contain one additional bulk journey-state insert.

## Self-review

- Verified active, past-due, cancelled, and expired/lapsed reconciliation; company memberships resolve the application applicant profile.
- Verified duplicate reconciliation and duplicate Community completion produce no duplicate journey rows through the committed journey uniqueness contract.
- Verified null billing-period webhook events still enroll using Stripe event identity; no normalization was hardened incorrectly.
- Verified stale and duplicate webhook paths insert no journey rows, while successful non-stale status mutation, billing-attempt completion, journey insertion, engagement facts, audit, and job completion remain in the same READ COMMITTED transaction.
- The executor-aware insertion uses one bulk `jsonb_to_recordset` statement with `ON CONFLICT DO NOTHING`; it does not open a nested transaction or weaken the Task 3 repository/fencing interfaces.
- Verified free Community activation calls the repository with a system actor. Partial injected test/custom dependency bundles remain isolated from the production database default.
- Renewal ignores normal memberships with a null period and creates exactly four steps once for each non-null period end.
- `.superpowers/sdd/progress.md` was not modified, and no rendering, provider, runner-delivery, or job HTTP route work was added.

## Concerns

The optional real PostgreSQL webhook concurrency test did not execute because `RUN_POSTGRES_INTEGRATION` is false, and `DATABASE_URL_TEST` is absent. Its transaction visibility/atomicity contract is covered by the executable sequential SQL-shape test and the gated PostgreSQL test source, but a real PostgreSQL run remains outstanding.


## Review-fix cycle

All Important review findings were addressed without modifying `.superpowers/sdd/progress.md` or extending Task 4 scope:

- Reconciliation now treats `cancelled`, `canceled`, `expired`, and `lapsed` audit statuses as one terminal family for current cancelled/expired memberships, then selects the latest authoritative processed event by Stripe event time and event ID.
- Audit `metadata.stripeCreated` is validated in its original form. Only a positive safe integer whose epoch converts to a valid JavaScript date is accepted; there is no `Number(...)` coercion and no fallback that can hide malformed metadata.
- The deterministic transaction fake now injects a journey-insert failure after the membership update. It snapshots membership state, commits the staged snapshot only when the transaction callback resolves, and proves the failed callback executes no subsequent audit or job-completion statement.
- The Community test separately captures membership-repository and journey actors, proving membership creation remains the member actor while journey enrollment uses a system actor.

### Review RED evidence

Command:

```text
npm.cmd exec vitest run tests/unit/journey-enrollment.test.ts tests/unit/join-service.test.ts tests/unit/webhook-repository-sequential.test.ts tests/unit/webhook-service.test.ts -- --reporter=dot
```

Exit code: `1`.

```text
Test Files 2 failed | 2 passed (4)
Tests 13 failed | 32 passed (45)
```

The terminal-family regression failed because an expired/lapsed current membership ignored authoritative `cancelled`/`canceled` audits. The table-driven malformed timestamp cases failed because coercible values enrolled journeys; the null case visibly scheduled steps from `1970-01-01T00:00:00.000Z`. The initial rollback assertion also exposed that the earlier latest-audit read and the later processed-audit write must be distinguished by transaction position.

### Review GREEN evidence

Required covering command:

```text
npm.cmd exec vitest run tests/unit/journey-enrollment.test.ts tests/unit/join-service.test.ts tests/unit/webhook-repository-sequential.test.ts tests/unit/webhook-service.test.ts -- --reporter=dot
```

Exit code: `0`.

```text
Test Files 4 passed (4)
Tests 46 passed (46)
Duration 3.53s
```

The rollback test observes seven transaction statements, identifies the journey insert as statement seven, and observes an empty statement list after it. Its fake committed membership snapshot remains `pending_payment`; only the repository's separate sanitized transient-failure write executes outside the rejected transaction. This proves repository control flow and fake snapshot rollback, not real PostgreSQL atomicity.

Static verification:

```text
git diff --check
npm.cmd run typecheck
npm.cmd exec eslint lib/automation/enrollment.ts tests/unit/journey-enrollment.test.ts tests/unit/join-service.test.ts tests/unit/webhook-repository-sequential.test.ts
```

All exited `0`; lint produced no warnings or errors.

Final full-suite command:

```text
npm.cmd test -- --run --reporter=dot
```

Exit code: `0`.

```text
Test Files 109 passed | 8 skipped (117)
Tests 542 passed | 20 skipped (562)
Duration 47.96s
```

### Remaining concern after review fixes

`DATABASE_URL_TEST` remains absent and `RUN_POSTGRES_INTEGRATION` remains unset. The deterministic fake verifies ordering, rejection, absence of later audit/job completion, and snapshot rollback semantics, but a real PostgreSQL transaction rollback run remains skipped and must not be inferred from the SQL-shape fake.
