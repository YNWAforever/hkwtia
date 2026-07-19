# Task 7 Report: Engagement timelines and at-risk queue

## Outcome

DONE_WITH_CONCERNS

Implementation commit: `8faac6c` (`feat: add engagement and at-risk operations`)

Task 7 adds bounded, audited engagement-event writes; staff-only newest-first timelines; Stripe renewal facts with outer event idempotency and transactionally serialized renewal ordinals; the shared at-risk rule and SQL equivalent; and a bilingual Server Component admin queue.

## Files

- Added `lib/db/repos/engagement.ts`
- Added `lib/admin/at-risk.ts`
- Updated `lib/billing/webhook-service.ts`
- Updated `lib/db/repos/jobs.ts`
- Added `components/admin/at-risk-table.tsx`
- Added `app/[locale]/(admin)/admin/at-risk/page.tsx`
- Updated `messages/en.json` and `messages/zh-HK.json`
- Added `tests/unit/engagement-repository.test.ts` and `tests/unit/at-risk.test.ts`
- Updated focused webhook and admin presentation tests

## TDD evidence

Initial RED command:

```powershell
npx.cmd vitest run tests/unit/engagement-repository.test.ts tests/unit/at-risk.test.ts --reporter=dot
```

It failed because `@/lib/db/repos/engagement` and `@/lib/admin/at-risk` did not exist. Subsequent narrow RED tests demonstrated each behavior before its implementation: missing renewal facts/ordinals, missing at-risk presentation, forged system-actor rejection, atomic writer audit/rollback, period-stable ordinals, localized tier/status/date output, and malformed renewal-period rejection.

Final focused GREEN command:

```powershell
npx.cmd vitest run tests/unit/engagement-repository.test.ts tests/unit/at-risk.test.ts tests/unit/webhook-service.test.ts tests/unit/webhook-repository-sequential.test.ts tests/unit/admin-presentational.test.tsx tests/unit/messages.test.ts --reporter=dot
```

Result: 6 files passed, 41 tests passed.

## Verification

- `npm.cmd run typecheck`: PASS
- `npm.cmd run lint`: PASS
- `npm.cmd test -- --reporter=dot`: PASS on the independent authoritative rerun, 74 files and 328 tests passed, 2 skipped
- An earlier full run had one unrelated `auth-server-runtime.test.ts` 5-second load timeout; its isolated rerun passed 7/7 before the clean full rerun
- `npm.cmd run build`: PASS; Next.js generated 75 static pages and recognized `/[locale]/admin/at-risk` as dynamic
- `git diff --check` and staged `git diff --cached --check`: PASS
- Task 7 production string audit: PASS; no debug statements, conflict markers, TODO/FIXME/HACK markers, or likely embedded credential strings
- UTF-8 BOM scan across all changed files: PASS
- Node UTF-8 parse of both locale JSON files: PASS
- No dependency manifests or lockfiles changed

## Self-review

- Authorization is Actor-first at runtime. Engagement appends accept only a validated admin or exact system actor; timeline and at-risk reads require admin before input parsing or adapter work.
- Engagement input is strict Zod with a bounded event enum and safe integer points. Event and audit writes share one injected/default transaction, and audit metadata excludes PII and secrets.
- Stripe `subscription_cycle` invoices alone create renewal facts. Renewal periods must have valid increasing bounds before repository mutation. The existing job claim is the outer replay guard.
- Membership row locking serializes renewal ordinal calculation. Failed and paid events for the same billing period reuse the same ordinal; the next distinct period increments it. Facts use the canonical member profile ID and Stripe event creation time.
- At-risk eligibility uses the shared constants and exact inclusive instant window: active or past due, score below 20, and renewal from 0 through 60 days. SQL applies the equivalent predicate and deterministic renewal/profile ordering.
- The admin route is a Server Component with a safe localized error. Tier, status, date, evidence, empty state, and actions are localized; links target Member 360, its note fragment, and campaign segments.

## Concerns and evidence gaps

- This task used deterministic repository adapters and SQL-shape/transaction tests, but did not run against live Neon/Postgres or live Stripe. Production lock contention and database constraint behavior therefore remain integration-test evidence gaps.
- `npm.cmd audit --omit=dev` currently reports 18 transitive dependency advisories (1 critical, 6 high, 11 moderate), including Better Auth through `@neondatabase/auth` plus existing build-tool packages. Task 7 changed no dependencies; remediating these may require coordinated breaking upgrades and is outside this task.
- The build emits the existing stale `caniuse-lite` data warning.

## Tooling note

The linked Windows worktree intermittently rejected `apply_patch` with `helper_unknown_error: apply deny-read ACLs`. After each such failure, edits were limited to the exact Task 7 file and written as BOM-free UTF-8; the final BOM and diff checks passed.
