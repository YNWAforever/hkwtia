# Task 7 Report: Engagement timelines and at-risk queue

## Outcome

DONE

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

- Original evidence gap, closed by the review follow-up below: this task initially used deterministic repository adapters and SQL-shape/transaction tests without a real Postgres run.
- `npm.cmd audit --omit=dev` currently reports 18 transitive dependency advisories (1 critical, 6 high, 11 moderate), including Better Auth through `@neondatabase/auth` plus existing build-tool packages. Task 7 changed no dependencies; remediating these may require coordinated breaking upgrades and is outside this task.
- The build emits the existing stale `caniuse-lite` data warning.

## Tooling note

The linked Windows worktree intermittently rejected `apply_patch` with `helper_unknown_error: apply deny-read ACLs`. After each such failure, edits were limited to the exact Task 7 file and written as BOM-free UTF-8; the final BOM and diff checks passed.

## Review follow-up (2026-07-20)

Review outcome: **DONE**

Implementation commit: `6035e8e` (`fix: harden task 7 review boundaries`)

The blocking review findings are resolved. Renewal metadata now has event-discriminated runtime validation; legacy renewal ordinals are guarded before integer conversion; the raw webhook transaction uses PostgreSQL-valid unqualified write targets; and the at-risk campaign action preserves an exact non-PII profile identity through the strict shared segment compiler used by preview, export, and campaign audience selection.

### Codebase graph evidence

The codebase-memory graph was refreshed before editing. Traces confirmed that `segmentPredicates()` is the sole compiler seam shared by segment preview/export and campaign audience selection, while `appendEngagementEvent()` and `jobsRepository.processWebhookLifecycle()` are the renewal write paths. The fixes were therefore made at those shared boundaries rather than duplicated in routes or UI handlers.

### Exact TDD evidence

Renewal validation RED:

```powershell
npx.cmd vitest run tests/unit/engagement-repository.test.ts --reporter=dot
```

Result before implementation: 1 file failed; 10 tests failed and 5 passed. Missing/invalid membership IDs and periods, reversed/equal periods, zero/fractional ordinals, renewal-key masquerading, oversized metadata, and non-JSON metadata all reached the write adapter.

Segment/campaign/SQL RED:

```powershell
npx.cmd vitest run tests/unit/segment-schema.test.ts tests/unit/segment-query.test.ts tests/unit/admin-presentational.test.tsx tests/unit/campaign-draft-url.test.ts tests/unit/webhook-repository-sequential.test.ts --reporter=dot
```

Result before implementation: 4 files failed and 1 passed; 6 tests failed and 19 passed. The strict schema rejected `profileId`, preview could not carry exact identity, both locales dropped at-risk campaign context, and renewal ordinal SQL lacked legacy-data guards. The campaign draft URL test already passed, proving repeated query preservation independently.

Actual PostgreSQL RED:

```powershell
$env:RUN_POSTGRES_INTEGRATION='1'; npx.cmd vitest run tests/unit/task7-postgres-integration.test.ts --reporter=dot
```

Result before implementation: 1 file failed; 2/2 tests failed. The at-risk/default repository path reached the strict route parser and failed on unsupported `profileId`. The production jobs path exposed PostgreSQL-invalid qualified conflict/write targets before it could reach the poisoned legacy ordinal. Subsequent real-database runs exposed and drove correction of every qualified raw `INSERT` column list and `UPDATE SET` target in the same transaction.

Consolidated focused GREEN:

```powershell
npx.cmd vitest run tests/unit/engagement-repository.test.ts tests/unit/segment-schema.test.ts tests/unit/segment-query.test.ts tests/unit/admin-presentational.test.tsx tests/unit/campaign-draft-url.test.ts tests/unit/campaign-queue-form.test.tsx tests/unit/campaign-queue.test.ts tests/unit/webhook-repository-sequential.test.ts --reporter=dot --maxWorkers=1 --minWorkers=1
```

Result: 8 files passed; 54/54 tests passed.

Actual PostgreSQL GREEN:

```powershell
$env:RUN_POSTGRES_INTEGRATION='1'; npx.cmd vitest run tests/unit/task7-postgres-integration.test.ts --reporter=verbose --maxWorkers=1 --minWorkers=1
```

Result: 1 file passed; 2/2 tests passed against an ephemeral local `postgres:16-alpine` container. Evidence covers score 19/20 and renewal -1ms/0/60d/+1ms boundaries, deterministic at-risk ordering, exact profile preview/campaign audience, concurrent exact replay (`processed` plus `duplicate`), poisoned legacy JSON, failed-to-paid facts sharing ordinal 1, and the next period using ordinal 2. Independent `docker ps -a --filter name=hkwtia-task7-` checks confirmed cleanup after RED and GREEN runs.

### Final verification

- `npm.cmd run typecheck`: PASS
- `npm.cmd run lint`: PASS
- `npm.cmd test -- --reporter=dot --maxWorkers=4 --minWorkers=2`: PASS; 74 files passed, 3 skipped; 339 tests passed, 4 skipped
- The first one-worker full-suite attempt produced no test verdict and timed out after cross-repository scheduler contention delayed its worker; its worktree-owned orphan was removed before the authoritative four-worker GREEN rerun
- `npm.cmd run build`: PASS; Next.js compiled, TypeScript passed, generated 75 static pages, and retained the dynamic admin routes
- `git diff --check` and staged `git diff --cached --check`: PASS (only expected Windows LF/CRLF notices)
- UTF-8 BOM scan across all 14 code/test files: PASS
- Conflict/debug/TODO marker audit across all 14 code/test files: PASS
- Dependency manifest/lockfile diff: PASS; no dependency files changed
- Ephemeral Task 7 Docker cleanup: PASS
- The build retains the existing stale `caniuse-lite` warning; it is unrelated to this change

### Final self-review

- Access control remains actor-first: staff/system validation still precedes engagement parsing or adapter work, and segment/campaign repositories retain admin enforcement.
- Idempotency and rollback remain atomic. The real PostgreSQL test proves one job row and one mutation/audit sequence under concurrent exact replay, while existing injected-transaction tests retain audit rollback coverage.
- Renewal facts require a UUID membership ID, increasing ISO periods, and a positive bounded integer ordinal. Other event metadata is bounded JSON and cannot use renewal-reserved keys.
- The defensive ordinal query ignores malformed legacy JSON before `::int`, reuses an ordinal within one billing period, and increments only for a later period.
- At-risk semantics remain exact and inclusive at 0 and 60 days, exclusive below 0 and above 60 days, with score strictly below 20 and deterministic renewal/profile ordering.
- Campaign links contain only profile ID, membership status, score bound, and renewal-day context; no email, secret, or new PII-bearing selector was added. The strict route schema rejects unknown keys.
- The exact profile ID condition is compiled once by `segmentPredicates()` and therefore applies consistently to preview, export, and queued campaign audiences.
- Both English and Traditional Chinese at-risk renders preserve the contextual campaign link. No visible localized copy changed.
