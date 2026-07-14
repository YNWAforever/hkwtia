# Task 4 report — plan catalog, validation, and join orchestration

## RED

Command:

```text
npm.cmd test -- tests/unit/join-service.test.ts tests/unit/join-schema.test.ts
```

Result before implementation: exit 1. Vitest could not resolve the new
`@/lib/membership/join-schema` and `@/lib/membership/join-service` modules, so
both focused suites failed during collection with zero tests. This is the
expected missing-feature failure.

## GREEN

Focused command:

```text
npm.cmd test -- tests/unit/join-service.test.ts tests/unit/join-schema.test.ts
```

Result after implementation: exit 0, 2 test files and 7 tests passed. The
tests cover stable plan metadata, invalid plan validation, nullable draft ids,
refresh-safe application reuse, community activation, paid checkout-command
branching, and patron review branching without a Stripe call.

Full unit command:

```text
npm.cmd test -- --reporter=dot
```

Result: exit 0, 18 test files and 49 tests passed.

Static checks:

```text
npm.cmd run lint       # exit 0, no warnings
npm.cmd run typecheck  # exit 0
git diff --check       # exit 0
```

## Files

- `lib/membership/plans.ts`: stable `PLAN_CODES`, immutable plan catalog, and
  invalid-code guard through `getPlan`.
- `lib/membership/join-schema.ts`: Zod plan, draft, profile, company, and
  complete-application schemas plus inferred input types.
- `lib/membership/join-service.ts`: actor-scoped start/resume orchestration;
  anonymous plan selection returns a continuation id without persisting PII,
  while member drafts are created/reused through the applications repository.
- `lib/membership/onboarding.ts`: actor-scoped application completion and
  domain decisions for community, paid, and patron plans. Paid plans create a
  pending-payment membership and return a typed checkout command; no Stripe SDK
  or Checkout Session is created here.
- `tests/unit/join-schema.test.ts`, `tests/unit/join-service.test.ts`: focused
  contract and branch coverage with deterministic in-memory adapters.

## Self-review

- All new runtime modules are server-only and import no Stripe SDK, secrets, or
  PII-bearing logging.
- Existing actor-first repositories remain the persistence boundary; test
  adapters are confined to the unit test file.
- Repeated `applicationId` starts read the existing actor-scoped application,
  verify the selected plan, and return the persisted step without creating a
  second draft.
- Paid membership remains `pending_payment`; the returned command contains only
  opaque ids and the plan code for Task 6.
- Community activates through the membership repository domain path; patron is
  represented as `pending_review` and never reaches checkout.

## Concerns

- Anonymous plan selection returns an in-memory continuation id because the
  existing application schema requires an authenticated applicant; the next
  auth/join task must exchange that continuation for a persisted member draft.
- Static plan metadata intentionally leaves Stripe price references null; Task
  6 should resolve configured test-mode prices without adding secrets here.
- The completion service accepts optional repository adapters for deterministic
  tests; production callers should use the default actor-scoped repositories.
