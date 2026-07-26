# M3 Task 7 report - idempotent journey and campaign runners

## Status and scope

Implemented `runJourneyBatch` and `runCampaignBatch` with durable delivery reservations, retry handling, claim-token fencing, current eligibility checks, and stable provider idempotency keys. Added the minimum campaign-recipient processing lease schema and generated migration required for atomic claims. Added an atomic D14 dunning lapse primitive that transitions canonical `past_due -> expired`, writes a sanitized stable audit identity, creates one staff task, and enrolls the deterministic win-back instance in the same transaction.

Review hardening makes permanent-failure task creation and terminal transition one claim-token-fenced transaction, makes audited staff retry write a durable parent marker so the runner lazily reopens only an error-fenced channel that remains eligible at execution time, and supports the existing M2 `membership_renewal` campaign source without widening arbitrary-template access.

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

Second re-review RED command:

```powershell
npm.cmd test -- tests/unit/task7-second-rereview.test.ts
```

Result before production changes: exit 1; 8/8 tests failed for the intended gaps: two stale-worker false-task races, four missing transactional repository contracts, audited admin retry unable to reopen the permanent delivery, and the seeded `membership_renewal` source rejected.

Final lazy-retry review RED command:

```powershell
npm.cmd test -- tests/unit/task7-lazy-admin-retry.test.ts
```

Result before the lazy-retry production change: exit 1; 7/8 tests failed for the intended eager-reopen, retry-claim-source, eligibility-preservation, and eligible lazy-fence gaps. The ordinary stale permanent-failure no-resend preservation test already passed.

## Implemented behavior

- Journey claims use the existing atomic `FOR UPDATE SKIP LOCKED` repository and every transition carries the exact `claimedAt` fencing token.
- Day-7 alternatives are evaluated from current context; marketing requires current consent and no active marketing email suppression, while transactional delivery remains eligible.
- A delivery row is durably reserved before provider send. Provider retries reuse the exact stable journey or campaign delivery key.
- Reserving an existing failed delivery leaves it terminal. Audited staff retry schedules and audits only the parent with `admin_retry_authorized`; the claim source remains `retry` even after stale reclaim. After current channel eligibility is rechecked, only an eligible failed channel uses the existing error-fenced retry transition and increments its durable attempt. Ineligible channels stay failed, while ordinary stale recovery remains provider-silent.
- A provider-success/log-completion crash reschedules the journey; reclaim reuses the same delivery row and provider idempotency key, then completes without creating a second log.
- Retryable failures use the shared 5/25-minute policy. Attempt three and permanent provider failures transition the claimed journey/campaign recipient and insert one deduplicated staff task in the same transaction; a stale claim creates no task and a task-write error rolls back the terminal transition.
- D90 always delivers and creates a stable low-engagement task only below the approved threshold.
- D14 unresolved dunning locks the membership and atomically transitions `past_due -> expired`, inserts `membership.lapsed_by_dunning` with request identity `dunning-lapse:<journeyStateId>`, creates one task, and inserts win-back D7/D21/D60 rows under `termination:lapse:<journeyStateId>`. Retrying an already committed matching episode repairs only missing idempotent side effects.
- Renewal D-14 creates no WhatsApp reservation or provider request without current opt-in and a nonblank number.
- Campaign claims include queued and expired-processing recipients, increment attempts, set a bounded lease, and fence all transitions by `claimedAt`.
- Campaign delivery rechecks current consent/suppression, accepts only the frozen source identities `renewal-reminder`, `member-update`, and the existing M2 value `membership_renewal`, maps them to the approved `campaign_generic` renderer/log identity, and preserves locale and variables. Unknown source identities fail safely before rendering, reservation, or provider delivery.
- Campaigns complete only when no queued/processing recipients remain, including empty or already-terminal campaigns found by the claim sweep.

## Schema and migration

Generated:

- `drizzle/0008_m3_campaign_recipient_leases.sql`
- `drizzle/meta/0008_snapshot.json`
- journal entry `idx: 8`

The additive migration adds only campaign recipient `processing`, `attempt_count`, `claimed_at`, `claim_expires_at`, `error_code`, and the `(status, claim_expires_at)` due index. It stores no message body or provider response.

## Second re-review implementation

- `journeys.markFailed` and `campaignRecipients.markRecipientFailed` now fence the terminal update by the exact claim token before inserting the stable task with `ON CONFLICT DO NOTHING`, all inside one database transaction.
- Runners receive the task disposition from that transaction; they no longer perform a separate permanent-failure task write.
- Authorized `journeys.retryFailed` now reschedules only the failed parent with `admin_retry_authorized` and writes the existing audit event in one transaction. `claimDue` carries that marker into `claimSource: retry` for scheduled and expired-processing claims; each runner lazily calls the existing error-fenced delivery retry only after current channel eligibility passes.
- The strict source map adds only `membership_renewal -> campaign_generic`. No schema or migration change was needed for either review follow-up; the durable retry authorization uses the existing sanitized `journey_state.error_code`.

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

- Second re-review focused file - RED 0/8, then GREEN 8/8.
- Final lazy-retry focused file - RED 1/8 preservation tests passed with 7 intended failures, then GREEN 8/8.
- Final focused compatibility suite - exit 0; 4 files passed and 36/36 tests passed.
- `tests/integration/automation-runners-postgres.test.ts` - collected successfully; its 5 real Postgres tests were skipped locally because `DATABASE_URL_TEST` is unset. The updated case proves ordinary failed rows remain unclaimable/provider-silent, audited admin retry sets the durable parent marker and one audit without mutating the delivery, and the real retry-source runner then performs exactly one fenced delivery attempt and provider call.
- `npm.cmd run lint` - exit 0, no warnings or errors.
- `npm.cmd run typecheck` - exit 0.
- `npm.cmd test` - exit 0; 126 files passed and 9 environment-gated files skipped; 646 tests passed and 25 skipped.
- `git diff --check` - exit 0; only line-ending notices were emitted.

## Self-review and remaining concerns

The final diff was reviewed against Task 7 for plan alignment, authorization, claim fencing, durable idempotency, retry/crash windows, PII-safe errors/audit metadata, migration compatibility, frozen campaign data, and empty/partial campaign completion. No Critical or Important issue remains from that self-review.

The 25 skipped tests are database-gated integration tests because this worktree has no live `DATABASE_URL_TEST`; the expanded real-runner Postgres suite was collected but could not execute live. The generated migration, SQL shape, runner behavior, and adapter idempotency contracts are covered locally, but this review fix did not apply migration 0008 to a live database or issue live Resend/WOZTELL sends. Provider-side duplicate suppression therefore still depends on the already-tested adapters honoring the stable idempotency key.

The pre-existing dirty `.superpowers/sdd/task-1-report.md`, `task-2-report.md`, and `task-3-report.md` files were preserved and excluded from this task.
