# Task 6 Report - Stripe checkout, Billing Portal, and receipts

## RED

- Command: `npm.cmd test -- tests/unit/checkout-service.test.ts tests/unit/stripe-adapter.test.ts`
- Result: exit 1; 2 test files failed during collection, 0 tests ran.
- Expected failures:
  - Failed to resolve `@/lib/billing/checkout-service`.
  - Failed to resolve `@/lib/billing/stripe`.
- Reason: the Task 6 adapter and services did not exist.

## GREEN

- Focused: `npm.cmd test -- tests/unit/checkout-service.test.ts tests/unit/stripe-adapter.test.ts`
  - PASS: 2 files, 10 tests.
- Full regression: `npm.cmd test`
  - PASS: 25 files, 95 tests.
- Lint: `npm.cmd run lint`
  - PASS.
- Typecheck: `npm.cmd run typecheck`
  - PASS.

## Security and scope self-review

- Checkout uses stable `membership-checkout:<membership-id>:initial` idempotency and `client_reference_id`.
- Metadata contains only opaque application/membership IDs and stable plan code; test fixtures assert user email and private memo never reach service results or checkout requests.
- Checkout creation never calls membership update and never activates a paid membership.
- Membership lookup remains actor-scoped; personal billing requires the owner and company billing requires owner/admin role.
- Billing Portal and receipt listing fail closed without a matching Stripe customer.
- The Stripe invoice adapter exposes only invoice ID, created timestamp, amount paid, currency, status, and hosted invoice URL. Receipt mapping converts timestamp deterministically and normalizes currency.
- Webhook lifecycle was not implemented.
- Build was not required because Task 6 adds isolated server modules and an unmounted presentational component; the full unit, lint, and type gates cover the integration surface.

## Review-fix follow-up

The following supersedes the initial idempotency/build notes above.

### RED

- Billing repository tests failed because `lib/db/repos/billing-attempts` was missing.
- Join billing page tests failed collection because checkout and complete route modules were missing.
- Checkout URL tests failed after adding the locale argument; environment tests failed because typed Stripe price IDs were absent.
- Integrated typecheck failed until the checkout fixture supplied persisted attempts and DB-backed billing access.

### GREEN

- Persisted-attempt/security focused gate: 4 files, 40 tests passed.
- Locale route/environment focused gate: 3 files, 19 tests passed.
- Integrated billing/security/routes/environment gate: 6 files, 33 tests passed after the scoped fake correction.
- Full Vitest: 28 files, 114 tests passed.
- Lint: passed.
- Typecheck: passed.
- Visible-string audit: passed, 51 TSX files scanned.
- Production build: passed with non-secret placeholder environment; 48 static pages generated and both localized join billing routes present.
- Playwright join authentication: 3 tests passed in Chromium.

### Final security and recovery evidence

- Idempotency keys are persisted per membership attempt, not fixed for membership lifetime.
- Active-attempt price changes fail closed; explicit abandoned/expired recovery atomically creates a new numbered attempt.
- Stripe Session ID and URL are persisted and recovered; a concurrent attach loser reloads the database winner.
- Billing Portal and receipts authorize company owners/admins through active `company_members` rows, never optional actor role claims.
- Checkout and completion pages derive pending state through actor-scoped membership/application reads; browser return never activates membership.
- Webhook lifecycle remains excluded for Task 7.

## Serialized recovery CAS review fix

### RED / review failure

- Final Task 6 review found that recovery ended whichever attempt was active and derived the next number from aggregate state without a caller precondition. A stale or duplicate recovery request could therefore replace a newer attempt.
- The prior recovery path then re-entered the general claim flow, so Stripe attachment was not bound to the exact replacement attempt returned by recovery.
- Checkout-attempt repository methods admitted a system actor even though these are member-initiated mutations.
- Regression coverage was added for duplicate recovery-token replay, stale compare-and-swap rejection, membership-row locking and update-before-insert ordering, member-only mutation, service preconditions before mutation, and exact-attempt session attachment.

### GREEN / final verification (2026-07-16)

- Focused CAS and recovery service:
  - Command: `npm.cmd test -- tests/unit/billing-recovery-cas.test.ts tests/unit/checkout-recovery-service.test.ts`
  - PASS: 2 files, 9 tests.
- Full regression:
  - Command: `npm.cmd test`
  - PASS: 30 files, 122 tests.
- Lint:
  - Command: `npm.cmd run lint`
  - PASS: exit 0.
- Typecheck:
  - Command: `npm.cmd run typecheck`
  - PASS: exit 0.
- Visible-string audit:
  - Command: `npm.cmd run audit:strings`
  - PASS: 51 TSX files scanned.
- Production build:
  - Command: `npm.cmd run build` with non-secret placeholder values for all required production environment variables.
  - PASS: compiled and typechecked; 48 static pages generated; localized join checkout and complete routes present.
- Relevant browser flow:
  - Command: `npm.cmd run test:e2e -- tests/e2e/join-auth.spec.ts --project=chromium`
  - PASS: 3 tests in Chromium.
- Migration consistency:
  - Command: `npx.cmd drizzle-kit generate`
  - PASS: 10 tables inspected; no schema changes and nothing additional to migrate.
  - `0004_snapshot.json.prevId` matches the 0003 snapshot ID; migration 0004 adds the nullable recovery token and the matching partial unique membership/token index.
- Diff integrity:
  - `git diff --check` passed; no `.rej` artifacts exist.
  - `next-env.d.ts` build noise was restored after verification.
  - No live Neon or production database was contacted.

### Failure resolution and scope

- Recovery now locks the authorized membership row, replays the persisted replacement by `recoveryRequestId`, compares `expectedCurrentAttemptId`, ends only that active row, and inserts the numbered replacement in one ordered transaction.
- Stripe creation and attach use the exact returned attempt and its persisted idempotency key; a failed attach reloads that exact attempt rather than whichever attempt is active.
- Membership/payment preconditions run before attempt mutation, company access requires an active owner/admin membership, and checkout-attempt APIs reject anonymous and system actors.
- The schema, migration, repository, service, and tests remain within Task 6; webhook processing, job claims, and membership activation remain Task 7 scope.
