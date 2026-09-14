# Task 8 Report: Engagement scoring and approval expiration

## Outcome

DONE

Task 8 adds pure 180-day decayed engagement scoring with a 28-day trend, a system-only batched score runner and conflict upsert, plus a system-only approval expiry runner whose pending-row transition, audit event, and deduplicated staff task are committed atomically behind a `FOR UPDATE SKIP LOCKED` claim.

No schema migration was needed. Existing `engagement_scores`, `approvals`, `audit_events`, and `staff_tasks` contracts support the implementation.

## Baseline

Before Task 8 production edits:

```powershell
npm.cmd test
```

Result: PASS; 127 files passed, 9 environment-gated files skipped; 659 tests passed, 25 skipped.

## Exact TDD evidence

Initial RED, after adding only the three required tests:

```powershell
npm.cmd test -- tests/unit/engagement-scoring.test.ts tests/unit/engagement-score-runner.test.ts tests/unit/approvals-expirer.test.ts
```

Result: FAIL; all 3 suites failed at import resolution because `@/lib/engagement/scoring`, `@/lib/automation/engagement-score-runner`, and `@/lib/automation/approvals-expirer` did not exist. No tests were collected.

Required-suite GREEN after the first implementation:

```powershell
npm.cmd test -- tests/unit/engagement-scoring.test.ts tests/unit/engagement-score-runner.test.ts tests/unit/approvals-expirer.test.ts
```

Result: PASS; 3 files passed; 21/21 tests passed.

Precision RED exposed premature trend rounding:

```powershell
npm.cmd test -- tests/unit/engagement-trend-precision.test.ts
```

Result: FAIL; 1/1 test failed because subtracting already-rounded scores returned `0.88` instead of the exact-score difference rounded once to `0.89`.

Precision GREEN:

```powershell
npm.cmd test -- tests/unit/engagement-trend-precision.test.ts tests/unit/engagement-scoring.test.ts
```

Result: PASS; 2 files passed; 11/11 tests passed.

Requesterless-approval RED demonstrated that an approval could otherwise be expired without its required staff task:

```powershell
npm.cmd test -- tests/unit/approval-expiry-orphan.test.ts
```

Result: FAIL; 1/1 test failed because the expiry update did not yet exclude a claimed row whose requester profile had been deleted.

Requesterless-approval GREEN:

```powershell
npm.cmd test -- tests/unit/approval-expiry-orphan.test.ts
```

Result: PASS; 1/1 test passed. Such rows remain pending and are reported with the sanitized `MISSING_REQUESTER_PROFILE` code.

Claim-order RED demonstrated that requesterless rows could occupy a limited claim batch and starve later taskable approvals:

```powershell
npm.cmd test -- tests/unit/approval-expiry-orphan-ordering.test.ts
```

Result: FAIL; 1/1 test failed because the claim ordered only by request time and ID.

Claim-order GREEN with adjacent expiry invariants:

```powershell
npm.cmd test -- tests/unit/approval-expiry-orphan-ordering.test.ts tests/unit/approval-expiry-orphan.test.ts tests/unit/approvals-expirer.test.ts
```

Result: PASS; 3 files passed; 7/7 tests passed. Taskable approvals now sort before requesterless rows prior to `LIMIT`.

## Implementation

- `scoreEngagement(events, asOf)` applies `min(100, max(0, sum(points * 0.97^weeksAgo)))` using fractional weeks, includes the exact 180-day boundary, excludes events after each evaluation instant, and stores score and trend at two decimals.
- Trend subtracts the exact current and prior values before rounding. The prior value is independently evaluated at `asOf - 28 days` with its own 180-day window.
- `recomputeEngagementScores(actor, asOf)` accepts only the `automation-cron` system actor, pages deterministic profile-ID batches, loads only profile IDs plus event points/timestamps across the required 208-day union window, and upserts each profile without loading personal fields.
- Score-runner failures are bounded and summarized only with stable non-sensitive codes. Invalid profile facts and individual upsert failures do not stop the remaining profiles.
- `expireStaleApprovals(actor, asOf)` accepts only the `automation-cron` system actor and expires pending approvals at the inclusive `requested_at <= asOf - 72h` boundary.
- Each approval batch uses one transaction and one data-modifying CTE statement. It claims with `FOR UPDATE SKIP LOCKED`, updates only still-pending taskable rows, inserts the system audit, and inserts a stable deduplicated staff task from the exact updated-row set.
- Audit request IDs and staff-task dedupe keys are `approval-expiry:<approvalId>`. Audit metadata is limited to `{reason: "pending_timeout"}`.
- Requesterless approvals remain pending rather than committing a taskless expiry. Null-last claim ordering prevents those rows from starving valid approvals.

## Contract interpretation

The plan's illustrative 26-week fixture lists `{score: 0, trend: 0}`, but the governing trend rule says to calculate the prior score independently at `asOf - 28 days`. A 182-day-old event is outside the current window but only 154 days old at the prior instant, so the implemented and tested result for 10 points is `{score: 0, trend: -5.12}`. This follows the explicit rolling-window and future-event-exclusion requirements.

## Final verification

Expanded Task 8 and compatibility suite:

```powershell
npm.cmd test -- tests/unit/engagement-scoring.test.ts tests/unit/engagement-trend-precision.test.ts tests/unit/engagement-score-runner.test.ts tests/unit/approvals-expirer.test.ts tests/unit/approval-expiry-orphan.test.ts tests/unit/approval-expiry-orphan-ordering.test.ts tests/unit/engagement-repository.test.ts tests/unit/approval-service.test.ts tests/unit/approval-authorization.test.ts tests/unit/automation-repository-authorization.test.ts tests/unit/dunning-lapse-repository.test.ts tests/unit/at-risk-repository-boundary.test.ts
```

Result: PASS; 12 files passed; 65/65 tests passed.

Environment-gated Postgres collection:

```powershell
npm.cmd test -- tests/integration/task8-automations-postgres.test.ts
```

Result: collected successfully; 1 file and 1 test skipped because `DATABASE_URL_TEST` is absent. The test is ready to exercise the exact 72-hour boundary and two concurrent `SKIP LOCKED` runners against the current migrated Postgres schema, but no live-database pass is claimed.

Static and full regression verification:

- `npm.cmd run typecheck`: PASS.
- `npm.cmd run lint`: PASS.
- `git diff --check`: PASS, with expected Windows LF/CRLF notices only.
- `npm.cmd test`: PASS; 133 files passed, 10 environment-gated files skipped; 683 tests passed, 26 skipped.

## Self-review

- Code-graph review found `scoreEngagement` is consumed only by the new score runner; both job runners are new entry points. Separate repository factories preserve the existing engagement and admin-approval interfaces.
- Repository boundaries require a system actor; runner boundaries narrow this to the cron source before any database access.
- Scoring queries select no email, phone, display name, auth user ID, metadata, company, or membership fields.
- Caught database errors are not returned or logged. Summaries contain counts and allowlisted codes only.
- The expiry mutation, audit, and task share one statement and transaction, so a side-effect failure rolls back the claim and status transition.
- Existing Task 1-3 report edits were present before this task, were preserved, and are excluded from the Task 8 commit. The progress ledger was intentionally not modified.

## Remaining verification note

The Postgres concurrency and exact-boundary integration case remains unexecuted until an isolated `DATABASE_URL_TEST` is supplied. Unit SQL-shape tests, compatibility tests, typecheck, lint, and the full non-DB suite are green.

## Tool fallback

The linked Windows worktree caused `apply_patch` updates of existing files to fail with `helper_unknown_error: apply deny-read ACLs`. New files were created with `apply_patch`; existing-file changes were applied only after resolving and verifying exact absolute paths inside the Task 8 worktree, using complete-file replacement or exact mechanical substitution. Final diff and verification gates passed.
