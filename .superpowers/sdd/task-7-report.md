# M3 Task 7 report - idempotent journey and campaign runners

## Status and scope

Implemented `runJourneyBatch` and `runCampaignBatch` with durable delivery reservations, retry handling, claim-token fencing, current eligibility checks, and stable provider idempotency keys. Added the minimum campaign-recipient processing lease schema and generated migration required for atomic claims. Added an atomic D14 dunning lapse primitive that transitions canonical `past_due -> expired`, writes a sanitized stable audit identity, creates one staff task, and enrolls the deterministic win-back instance in the same transaction.

This task did not add HTTP job routes, renewal/scoring/approval runners, admin UI, Worker code, or any `progress.md` change.

## RED evidence

The required runner command was run before the runner modules existed:

```powershell
npm.cmd test -- tests/unit/journey-runner.test.ts tests/unit/campaign-delivery.test.ts tests/integration/journey-delivery-idempotency.test.ts
```

Result: exit 1; all 3 suites failed during collection because `journey-runner` and `campaign-runner` were missing, with 0 tests collected.

Additional test-first gaps were recorded before their production changes:

- `npm.cmd test -- tests/unit/campaign-recipient-lease-schema.test.ts` - 2/2 failed because the enum lacked `processing` and no migration/journal entry 8 existed.
- `npm.cmd test -- tests/unit/delivery-retry-idempotency.test.ts` - 2/2 failed because a failed delivery was only selected, not reopened, and a repeated terminal completion threw `INVALID_DELIVERY_TRANSITION`.
- `npm.cmd test -- tests/unit/dunning-lapse-repository.test.ts` - 3/3 failed because `createDunningLapseRepository` did not exist.
- `npm.cmd test -- tests/unit/campaign-delivery.test.ts` after adding the idle-campaign case - 1/6 failed because the claim sweep did not yet complete campaigns with no queued/processing recipients.

## Implemented behavior

- Journey claims use the existing atomic `FOR UPDATE SKIP LOCKED` repository and every transition carries the exact `claimedAt` fencing token.
- Day-7 alternatives are evaluated from current context; marketing requires current consent and no active marketing email suppression, while transactional delivery remains eligible.
- A delivery row is durably reserved before provider send. Provider retries reuse the exact stable journey or campaign delivery key.
- Reserving an existing failed delivery leaves it terminal. Only an explicit, error-fenced retry transition reopens retryable failures and increments the durable delivery attempt; stale crash recovery replays the sanitized committed disposition without another provider call.
- A provider-success/log-completion crash reschedules the journey; reclaim reuses the same delivery row and provider idempotency key, then completes without creating a second log.
- Retryable failures use the shared 5/25-minute policy. Attempt three and permanent provider failures create one deduplicated staff task before marking either the journey or campaign recipient terminal.
- D90 always delivers and creates a stable low-engagement task only below the approved threshold.
- D14 unresolved dunning locks the membership and atomically transitions `past_due -> expired`, inserts `membership.lapsed_by_dunning` with request identity `dunning-lapse:<journeyStateId>`, creates one task, and inserts win-back D7/D21/D60 rows under `termination:lapse:<journeyStateId>`. Retrying an already committed matching episode repairs only missing idempotent side effects.
- Renewal D-14 creates no WhatsApp reservation or provider request without current opt-in and a nonblank number.
- Campaign claims include queued and expired-processing recipients, increment attempts, set a bounded lease, and fence all transitions by `claimedAt`.
- Campaign delivery rechecks current consent/suppression, accepts only the frozen source identities `renewal-reminder` and `member-update`, maps both to the approved `campaign_generic` renderer/log identity, and preserves locale and variables. Unknown source identities fail safely before rendering, reservation, or provider delivery.
- Campaigns complete only when no queued/processing recipients remain, including empty or already-terminal campaigns found by the claim sweep.

## Schema and migration

Generated:

- `drizzle/0008_m3_campaign_recipient_leases.sql`
- `drizzle/meta/0008_snapshot.json`
- journal entry `idx: 8`

The additive migration adds only campaign recipient `processing`, `attempt_count`, `claimed_at`, `claim_expires_at`, `error_code`, and the `(status, claim_expires_at)` due index. It stores no message body or provider response.

## Final verification

Exact Task 7 plan command:

```powershell
npm.cmd test -- tests/unit/journey-runner.test.ts tests/unit/campaign-delivery.test.ts tests/integration/journey-delivery-idempotency.test.ts
```

Result: exit 0; 3 files passed, 15/15 tests passed.

Supporting repository, migration, condition, and stale-lease regression command:

```powershell
npm.cmd test -- tests/unit/journey-conditions.test.ts tests/unit/delivery-retry-idempotency.test.ts tests/unit/dunning-lapse-repository.test.ts tests/unit/campaign-recipient-lease-schema.test.ts tests/unit/journey-repository.test.ts
```

Result: exit 0; 5 files passed, 28/28 tests passed.

Additional verification:

- Focused review suite - exit 0; 6 files passed and the `DATABASE_URL_TEST`-gated file skipped; 32 tests passed and 4 skipped.
- `tests/integration/automation-runners-postgres.test.ts` - collected successfully; its 4 real Postgres tests were skipped locally because `DATABASE_URL_TEST` is unset. The gated cases use the production runners and real journey, campaign-recipient, delivery, and staff-task repositories to prove concurrent single claim/provider/log behavior, campaign template mapping, uniqueness, lease fencing, and transaction rollback.
- `npm.cmd run lint` - exit 0, no warnings or errors.
- `npm.cmd run typecheck` - exit 0.
- `npm.cmd test` - exit 0; 124 files passed and 9 environment-gated files skipped; 630 tests passed and 24 skipped.
- `git diff --check` - exit 0; only line-ending notices were emitted.

## Self-review and remaining concerns

The final diff was reviewed against Task 7 for plan alignment, authorization, claim fencing, durable idempotency, retry/crash windows, PII-safe errors/audit metadata, migration compatibility, frozen campaign data, and empty/partial campaign completion. No Critical or Important issue remains from that self-review.

The 24 skipped tests are database-gated integration tests because this worktree has no live `DATABASE_URL_TEST`; the new real-runner Postgres suite was collected but could not execute live. The generated migration, SQL shape, runner behavior, and adapter idempotency contracts are covered locally, but this review fix did not apply migration 0008 to a live database or issue live Resend/WOZTELL sends. Provider-side duplicate suppression therefore still depends on the already-tested adapters honoring the stable idempotency key.

The pre-existing dirty `.superpowers/sdd/task-1-report.md`, `task-2-report.md`, and `task-3-report.md` files were preserved and excluded from this task.
