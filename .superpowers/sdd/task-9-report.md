# Task 9 Report: Secure idempotent automation job routes

## Outcome

DONE

Task 9 provides five POST-only cron endpoints with constant-time Bearer authentication, UTC-bucketed claims, duplicate suppression, failed-run reclaim, exact-attempt settlement fencing, bounded responses, production runner composition, and worker-failure alerts.

## TDD and independent review evidence

Initial Task 9 RED:

```powershell
npm.cmd test -- tests/unit/job-auth.test.ts tests/unit/job-handler.test.ts tests/unit/job-routes.test.ts
```

Result: FAIL during import resolution because the auth, handler, and job route modules did not yet exist.

Initial Task 9 GREEN:

```powershell
npm.cmd test -- tests/unit/job-auth.test.ts tests/unit/job-handler.test.ts tests/unit/job-routes.test.ts
```

Result: PASS; 3 files passed; 58/58 tests passed.

The first self-review recorded two additional failures: the journey wrapper returned before its campaign companion settled, and campaign context discarded the current `zh-HK` locale. Both were fixed and `tests/unit/job-routes.test.ts` passed 29/29.

Independent review RED/GREEN:

- Scheduled-job repository RED: 5/5 tests failed because the injectable cron-only repository and claim-token API did not exist. GREEN: 5/5 after returning the persisted `attempt_count` and fencing settlement.
- Handler RED: 12 passed and 7 failed because the old wrapper omitted the attempt token, mishandled the object duplicate result, ignored false settlement, and returned 500 after lost/stale completion settlement. GREEN: 19/19.
- Production renewal RED: the focused test failed import resolution because the narrow renewal adapter did not exist. GREEN: 2/2 after real production wiring used the cron-only projection and rejected Stripe before database loading.
- Worker-alert starvation RED: the first provider error escaped with address/provider text and prevented later recipients from being attempted. GREEN after settled fan-out, stable recipient idempotency keys, and one generic post-settlement failure.

Final focused review command:

```powershell
npm.cmd test -- tests/unit/job-handler.test.ts tests/unit/scheduled-jobs-repository.test.ts tests/unit/job-routes.test.ts tests/unit/journey-enrollment.test.ts tests/unit/renewal-production-dependencies.test.ts tests/unit/automation-repository-authorization.test.ts
```

Result: PASS; 6 files passed; 80/80 tests passed.

## Implementation

- `verifyCronBearer` rejects missing, malformed, wrong-length, wrong-value, and blank-configured secrets and compares SHA-256 digests with `timingSafeEqual`.
- `createJobPost` is POST-only, captures one clock instant, derives UTC hourly/daily keys, skips duplicates, propagates the persisted attempt token, and settles only its own claim.
- A runner failure plus a successful fail settlement returns sanitized 500. A lost or stale settlement returns bounded `{stale: true}` without overwriting a completed or newer attempt.
- Scheduled claim is one `INSERT ... ON CONFLICT ... WHERE state = 'failed' RETURNING attempt_count`. Complete/fail require the run key, `state = 'processing'`, and the exact attempt count, and return false on zero rows.
- Scheduled claim/complete/fail are runtime cron-only. Stripe webhook lifecycle processing remains a separate Stripe-authorized transaction path.
- Renewal uses a dedicated cron-only adapter selecting only membership ID, resolved owner/applicant profile ID, and billing-period end. Legacy lifecycle readers retain their Stripe-only `Actor` contract without unsafe repository casts.
- The hourly journey route starts and awaits both journey and frozen-campaign engines before settling.
- Worker alerts accept only strict bounded allowlisted JSON and use a digest run key containing no raw request fields.
- Current `staff`, `exco`, and `superadmin` recipients are loaded for each invocation. Only normalized addresses are selected.
- Every alert recipient is attempted with settled semantics. Recipient-specific provider idempotency keys are stable; any partial failure becomes only `WORKER_ALERT_DELIVERY_FAILED` after all attempts.
- Success/failure responses and persisted error codes do not expose secrets, recipient addresses, provider text, message bodies, or raw exceptions.
- All five route modules export `POST` and no `GET`.

## Final verification

- Focused review suite: PASS, 80/80.
- `npm.cmd run typecheck`: PASS, no diagnostics.
- `npm.cmd run lint`: PASS, no diagnostics.
- `npm.cmd run build`: PASS; Next.js 16 production build completed and emitted all five job routes.
- `git diff --check`: PASS; only the expected Windows LF/CRLF normalization notice.

Full regression:

```powershell
npm.cmd test
```

Result: PASS; 138 files passed and 10 environment-gated files skipped; 754 tests passed and 26 skipped.

## Self-review

- Authentication runs before clock, body parsing, claims, runner work, or database access.
- Attempt fencing prevents an old worker from completing or failing a reclaimed attempt.
- If completion commits but its response is lost, fallback failure loses the completed-state fence and the handler returns bounded stale success.
- Processing/completed claims remain duplicates; only failed jobs are reclaimed with a new token.
- Renewal, staff lookup, context lookup, and scheduled mutations enforce the cron actor before data access.
- Worker-alert partial failure cannot starve later recipients, and retries reuse the same per-recipient keys.
- No console logging was added and caught exceptions are never serialized.
- Pre-existing Task 1-3 report edits were preserved and excluded. The progress ledger was intentionally not modified.

## Remaining verification note

The suite skipped 26 database/environment-gated tests because isolated services were not configured. No live PostgreSQL result is claimed; SQL-shape/executor tests, all non-gated tests, typecheck, lint, and the production build are green.

## Tool fallback

The linked Windows worktree allowed new files through `apply_patch` but denied updates to existing files with `helper_unknown_error: apply deny-read ACLs`. Existing-file changes used exact Git-applied unified diffs after path verification. Final scope and whitespace checks passed.
