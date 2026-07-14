# Task 3 report — actor authorization, Neon Auth, and repositories

## RED

Command:

```text
npm.cmd test -- tests/unit/actor-authorization.test.ts tests/unit/repository-scope.test.ts
```

Result before implementation: exit 1. Vitest could not resolve `@/lib/auth/actor` and `@/lib/db/repos/fakes`; both implementation boundaries were absent. This is the expected missing-feature failure.

## GREEN

Focused command:

```text
npm.cmd test -- tests/unit/actor-authorization.test.ts tests/unit/repository-scope.test.ts
```

Result after implementation: exit 0, 2 test files and 10 tests passed.

Full unit command:

```text
npm.cmd test -- --reporter=dot
```

Result: exit 0, 15 test files and 39 tests passed.

Static checks:

```text
npm.cmd run lint       # exit 0, no warnings
npm.cmd run typecheck  # exit 0
git diff --check       # exit 0
```

Repository boundary check found only a type-only/dynamic import of `lib/db/client` in `lib/db/repos/common.ts`; no repository statically imports the client. Runtime schema imports use `lib/db/server-schema`.

## Files

- `lib/auth/server.ts`: server-only Neon Auth singleton, explicit env-backed base URL/cookie secret, `getSession`, and `NeonSession` type.
- `lib/auth/actor.ts`: session-to-member conversion, `getActor`, `requireActor`, and the constrained Stripe webhook system actor.
- `app/api/auth/[...path]/route.ts`: Neon Auth catch-all handlers.
- `lib/db/repos/{common,profiles,companies,memberships,applications,jobs,audit-events,index}.ts`: actor-first repository predicates and server-only runtime boundaries.
- `tests/helpers/{fakes,repository-fakes}.ts`, `tests/unit/{actor-authorization,repository-scope}.test.ts`: self/cross-company authorization and webhook idempotency coverage; deterministic fakes stay test-only.
- `tests/neon-auth-server.ts`, `vitest.config.ts`: deterministic unit-test stub for the Next server entrypoint.

## Self-review

- Actor checks are performed before member/system-sensitive operations; company and membership reads/writes include actor predicates.
- Webhook jobs require `systemActor('stripe-webhook')`; `runKey` uniqueness returns `duplicate` only for the Postgres unique violation code.
- Anonymous reads are limited to explicitly directory-visible profiles/companies; anonymous writes and private records are denied.
- All test data uses in-memory fakes; no Neon or Stripe resources are contacted.
- No M0 routes or later portal/join behavior was added.

## Concerns

- The local unit suite aliases `@neondatabase/auth/next/server` to a tiny test stub because the installed Next ESM package cannot resolve its bare `next/headers` dependency under Vitest. Production code still uses the installed Neon Auth server entrypoint.
- The development fallback secret/base URL is intentionally non-production. During `next build`, `NEXT_PHASE=phase-production-build` uses non-production parsing so route modules remain importable; a running production server still calls `serverEnv()` and rejects missing values.

## Review fixes (2026-07-14)

RED evidence before fixes:

```text
npm.cmd test -- tests/unit/repository-mutation-scope.test.ts
```

Result: exit 1; all 3 new regression tests failed because fake repositories had no company/application mutation methods and memberships had no guarded update.

GREEN evidence after fixes:

```text
npm.cmd test -- tests/unit/repository-scope.test.ts tests/unit/repository-mutation-scope.test.ts tests/unit/actor-authorization.test.ts
```

Result: exit 0, 3 files and 13 tests passed. The new coverage proves system company removal is ID-scoped and member membership/application tenant reassignment is rejected.

```text
npm.cmd test -- --reporter=dot  # exit 0, 16 files and 42 tests passed
npm.cmd run lint                # exit 0, no warnings
npm.cmd run typecheck           # exit 0
git diff --check                # exit 0
```

Review corrections: deterministic fakes now live only under `tests/helpers/repository-fakes.ts`; every runtime repository entrypoint, including `index.ts`, is server-only; system company predicates retain the requested ID; update types omit tenant-target fields and runtime guards reject casted reassignment attempts; auth uses env values with only generated non-production values (no checked-in credentials), while production runtime `serverEnv()` validation remains strict and build-time imports remain viable.
Build viability evidence:

```text
$env:NODE_ENV=production
Remove-Item Env:DATABASE_URL,Env:NEON_AUTH_BASE_URL,Env:NEON_AUTH_COOKIE_SECRET,Env:STRIPE_SECRET_KEY,Env:STRIPE_WEBHOOK_SECRET,Env:APP_URL
npm.cmd run build  # exit 0
```

Next build sets `NEXT_PHASE=phase-production-build`, so auth imports use generated non-production configuration during static analysis; production runtime imports still call strict `serverEnv()`.
## Follow-up hygiene (2026-07-15)

- Removed the extra blank line at EOF in `lib/db/repos/common.ts`.
- `npm.cmd test -- --reporter=dot tests/unit/actor-authorization.test.ts tests/unit/repository-scope.test.ts tests/unit/repository-mutation-scope.test.ts`: exit 0, 3 files and 13 tests passed.
- `git diff --check`: exit 0.
