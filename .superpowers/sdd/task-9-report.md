# Task 9 Report: Secure idempotent automation job routes

## Outcome

DONE

Task 9 adds five POST-only automation endpoints protected by constant-time Bearer verification, UTC bucketed job claims, duplicate suppression, failed-run reclaim, bounded sanitized responses, and production service wiring for journeys, campaigns, renewal reconciliation, engagement scoring, approval expiry, and worker failure alerts.

## Exact TDD evidence

Initial RED after adding the three required test files:

```powershell
npm.cmd test -- tests/unit/job-auth.test.ts tests/unit/job-handler.test.ts tests/unit/job-routes.test.ts
```

Result: FAIL; 3 suites failed during import resolution because `@/lib/jobs/auth`, `@/lib/jobs/handler`, and the job route modules did not exist. No tests were collected.

Bearer and generic handler GREEN:

```powershell
npm.cmd test -- tests/unit/job-auth.test.ts tests/unit/job-handler.test.ts
```

Result: PASS; 2 files passed; 31/31 tests passed.

First complete route GREEN:

```powershell
npm.cmd test -- tests/unit/job-auth.test.ts tests/unit/job-handler.test.ts tests/unit/job-routes.test.ts
```

Result: PASS; 3 files passed; 58/58 tests passed.

Self-review added two focused production-correctness tests. Recorded RED:

```powershell
npm.cmd test -- tests/unit/job-routes.test.ts
```

Result: FAIL; 2/29 tests failed. The journey wrapper returned before the companion campaign engine settled, and campaign context discarded the current `zh-HK` locale.

Focused GREEN after using settled batch composition and preserving current locale:

```powershell
npm.cmd test -- tests/unit/job-routes.test.ts
```

Result: PASS; 1 file passed; 29/29 tests passed.

## Implementation

- `verifyCronBearer` rejects missing, malformed, wrong-length, wrong-value, or blank-configured secrets and compares SHA-256 digests with `timingSafeEqual`.
- `createJobPost` is POST-only, captures one explicit clock instant, derives UTC hourly or daily run keys, claims through `jobsRepository`, skips duplicates, and completes or fails with the `automation-cron` actor.
- Success summaries retain only bounded numeric and boolean counters. Failures and request errors return stable codes without provider errors, secrets, response bodies, recipient addresses, or other personal data.
- Scheduled job claiming is one atomic `INSERT ... ON CONFLICT ... WHERE state = 'failed' RETURNING` statement. Processing and completed rows remain duplicates; failed rows are safely reclaimed with incremented attempts.
- The hourly journey route starts both due journey and frozen campaign engines, waits for both to settle, and fails generically if either engine fails. Repository delivery claims and stable provider idempotency keys make the retry resumable.
- Renewal, engagement-score, and approval-expirer routes invoke their existing system services with the same captured `now`. Actor contracts were widened only to the existing `AutomationRepositoryActor` union so Stripe and cron system sources stay type-safe.
- Current journey and campaign context is loaded through a cron-only repository. Queries select only required profile, membership, consent, suppression, locale, and scoring facts.
- Worker alerts accept only strict bounded JSON shaped as `{job, scheduledTime, attemptCount, errorCode}`. Job and error values are allowlisted, timestamps are canonicalized to UTC, and the run key is a SHA-256 digest with no raw fields.
- Worker-alert recipients are queried on every invocation from current `staff`, `exco`, and `superadmin` profiles. Only normalized email addresses are selected; Stripe, member, and staff actors are rejected before database access.
- Alert email is branded and transactional. Per-recipient provider idempotency keys contain only the alert digest and a recipient-address digest, while responses expose counts only.
- All five route modules export `POST` and no `GET`.

## Final verification

Focused Task 9 plus renewal compatibility:

```powershell
npm.cmd test -- tests/unit/job-auth.test.ts tests/unit/job-handler.test.ts tests/unit/job-routes.test.ts tests/unit/journey-enrollment.test.ts
```

Result: PASS; 4 files passed; 78/78 tests passed.

Static verification:

- `npm.cmd run typecheck`: PASS, no diagnostics.
- `npm.cmd run lint`: PASS, no errors or warnings.
- `git diff --check`: PASS; expected Windows LF/CRLF notices only.

Full regression verification:

```powershell
npm.cmd test
```

Result: PASS; 136 files passed and 10 environment-gated files skipped; 743 tests passed and 26 skipped.

## Self-review

- Authentication is evaluated before clock, body parsing, claims, environment-dependent runner work, or database access.
- Worker request bodies are stream-read with a 4 KiB ceiling even when `Content-Length` is absent or misleading.
- Custom alert run keys are canonical digests, so retry identity is stable across equivalent timezone representations and does not reveal job names, timestamps, or error codes.
- Both journey-side engines are launched and awaited before the wrapper settles. A companion engine cannot continue after the wrapper has already marked the shared hourly job failed.
- Marketing unsubscribe links use signed expiring tokens and retain the current profile locale.
- Staff lookup, context lookup, scheduled job mutations, and existing automation services enforce the cron system actor before data access.
- No console logging was added. Caught exceptions are not serialized into HTTP bodies or persisted as raw job errors.
- Pre-existing Task 1-3 report edits were preserved and excluded from this task. The progress ledger was intentionally not modified.

## Remaining verification note

The full suite collected but skipped 26 database/environment-gated tests because their isolated test services were not configured. No live PostgreSQL result is claimed. Focused repository SQL-shape tests, all non-gated tests, typecheck, and lint are green.

## Tool fallback

The linked Windows worktree allowed new files through `apply_patch` but denied updates to existing files with `helper_unknown_error: apply deny-read ACLs`. Existing-file changes used exact unified diffs applied by Git after verifying paths inside the Task 9 worktree. Final scope and whitespace checks passed.
