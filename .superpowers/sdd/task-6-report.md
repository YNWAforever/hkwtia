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
