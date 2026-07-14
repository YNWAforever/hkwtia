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
- `lib/db/repos/{common,profiles,companies,memberships,applications,jobs,audit-events,index,fakes}.ts`: actor-first repository predicates and deterministic fake repositories.
- `tests/unit/{actor-authorization,repository-scope}.test.ts`, `tests/helpers/fakes.ts`: self/cross-company authorization and webhook idempotency coverage.
- `tests/neon-auth-server.ts`, `vitest.config.ts`: deterministic unit-test stub for the Next server entrypoint.

## Self-review

- Actor checks are performed before member/system-sensitive operations; company and membership reads/writes include actor predicates.
- Webhook jobs require `systemActor('stripe-webhook')`; `runKey` uniqueness returns `duplicate` only for the Postgres unique violation code.
- Anonymous reads are limited to explicitly directory-visible profiles/companies; anonymous writes and private records are denied.
- All test data uses in-memory fakes; no Neon or Stripe resources are contacted.
- No M0 routes or later portal/join behavior was added.

## Concerns

- The local unit suite aliases `@neondatabase/auth/next/server` to a tiny test stub because the installed Next ESM package cannot resolve its bare `next/headers` dependency under Vitest. Production code still uses the installed Neon Auth server entrypoint.
- The development fallback secret/base URL is intentionally non-production; `serverEnv()` still rejects missing values when `NODE_ENV=production`.
