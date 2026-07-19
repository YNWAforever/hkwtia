# Task 6 Report - Immutable campaign queue

## Files

- `lib/admin/campaigns.ts`
- `lib/db/repos/campaigns.ts`
- `app/[locale]/(admin)/admin/segments/page.tsx`
- `components/admin/segment-results.tsx`
- `messages/en.json`
- `messages/zh-HK.json`
- `tests/unit/campaign-queue.test.ts`
- `tests/unit/campaign-no-delivery.test.ts`

## RED

- `npx.cmd vitest run tests/unit/campaign-queue.test.ts tests/unit/campaign-no-delivery.test.ts --reporter=dot`
- Expected failure captured: campaign modules did not exist; import resolution and source-file reads failed.

## GREEN

- Focused queue/no-delivery/messages: 3 files, 5 tests passed.
- Typecheck: passed.
- Full Vitest: 66 files, 285 tests passed; 2 skipped.
- Lint: passed.
- Visible-string audit: passed (79 TSX files).
- Production build: passed; `/[locale]/admin/segments` is dynamic.
- UTF-8 Node JSON parsing and BOM checks: passed.

## Self-review

- Queue validates input with Zod and rechecks admin authorization.
- The saved segment is ownership-scoped by `profileId`.
- Campaign, frozen recipients, and `campaign.queued` audit record share one transaction.
- Idempotency uses the unique campaign key and conflict handling; an existing key returns its existing recipient count without inserting recipients.
- Snapshot rows retain profile ID, email, profile locale, and template variables while excluding absent emails, no marketing consent, and suppressed profiles.
- There is no external delivery call or provider dependency; M3 retains delivery ownership.
- Audit metadata stores recipient count only, not emails or variables.

## Risks and tool fallback

- The linked-worktree ACL denied `apply_patch` reads. The authorized narrow BOM-free fallback was used only for Task 6 tests, UI, and message files after the failure was captured.
- The campaign audience query intentionally mirrors the reviewed strict saved-segment predicate. The small export refactor needed to import that private compiler was outside Task 6's listed files and blocked by the same ACL constraint; keep the two predicates synchronized in future segment changes.
- `npm audit --audit-level=high` remains a baseline dependency issue: 26 findings, including one critical through the existing Neon Auth/Better Auth dependency chain. No package changes were made.

## Concurrency proof follow-up - 2026-07-19

### RED

- The first harness run exposed an invalid fake campaign UUID; that fixture error was corrected and was not accepted as the concurrency RED.
- `npx.cmd vitest run tests/unit/campaign-queue.test.ts --reporter=dot`
- Expected concurrency RED: 1 failed and 10 passed. The barrier-backed fake failed at `CONCURRENT_ON_CONFLICT_NOT_IMPLEMENTED` after both transactions had missed the initial campaign lookup, with the stack continuing through the production repository `createCampaign` and `queueCampaign` paths.

### GREEN

- The fake now models PostgreSQL `INSERT ... ON CONFLICT DO NOTHING`: the losing insert waits for the owning transaction, returns no inserted row after the winner commits, and then observes the winner under the next READ COMMITTED statement snapshot.
- Focused campaign queue: 1 file and 11 tests passed.
- Focused Task 5/6 suite: 6 files and 32 tests passed.
- Typecheck and lint passed.
- Full Vitest: 66 files passed and 2 skipped; 293 tests passed and 2 skipped.
- Production build passed; the existing stale `caniuse-lite` warning remains informational.
- Diff check passed and the modified test is BOM-free.

### Concurrency assertions and PostgreSQL semantics

- Both production `queueCampaign` calls use a repository created by `createCampaignsRepository`, both initial idempotency lookups are proven misses, and exactly one unique-constraint conflict is handled by `ON CONFLICT DO NOTHING`.
- Results contain exactly one `created` and one `existing` disposition for the same campaign and recipient count.
- The committed store contains one campaign, one immutable recipient snapshot, and one `campaign.queued` audit record. The losing transaction commits zero staged campaigns, recipients, and audit records.
- No production fix was required. The current `ON CONFLICT DO NOTHING` path does not abort the transaction. A raw SQLSTATE `23505` would abort a PostgreSQL transaction, so recovery after a future plain insert must happen outside the rolled-back transaction or within an explicit savepoint; querying for the winner inside the aborted transaction would be invalid.
