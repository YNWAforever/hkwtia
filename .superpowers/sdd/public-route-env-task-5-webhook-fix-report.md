Status
- Completed Task 5 webhook import-isolation fix.

Files changed
- `app/api/stripe/webhook/route.ts`
- `tests/unit/webhook-route.test.ts`

Commands and results
- `npm.cmd test -- tests/unit/webhook-route.test.ts`
  - sandbox run: blocked before execution by esbuild startup access-denied (`Cannot read directory "../../.."`, `Could not resolve "...\\vitest.config.ts"`).
  - outside-sandbox pre-fix run: failed 1/4 tests with `Missing required production environment variables: NEON_AUTH_BASE_URL, NEON_AUTH_COOKIE_SECRET`.
  - outside-sandbox post-fix run: passed 4/4 tests.
- `npm.cmd run typecheck`
  - outside-sandbox: passed.
  - rerun after final test adjustment: passed.
- `npm.cmd test -- tests/unit/env-contract.test.ts tests/unit/public-environment-isolation.test.ts tests/unit/auth-server-runtime.test.ts tests/unit/resend-transport.test.ts tests/unit/checkout-service.test.ts tests/unit/job-routes.test.ts tests/unit/webhook-route.test.ts`
  - outside-sandbox: passed 7/7 files, 88/88 tests.
- `git diff --check -- app/api/stripe/webhook/route.ts tests/unit/webhook-route.test.ts`
  - passed; only line-ending conversion warnings were reported by Git for future CRLF normalization.

Self-review
- Replaced the Stripe webhook route's runtime `systemActor` import with a local `Actor`-typed system actor literal, preserving the same `kind`, `userId`, and `source` values expected by `requireSystem`.
- Preserved existing webhook POST behavior, billing env access, Stripe signature validation, `WebhookInputError` handling, and `processStripeEvent` usage.
- Tightened the production import test so its billing-service mock no longer re-imports the real webhook service and accidentally pulls auth through unrelated billing/job dependencies; the test still verifies that the production route can initialize and process a verified webhook with only billing env configured.

Concerns
- No functional concerns in scope.
- Git emitted LF->CRLF warnings for the two edited files; no whitespace or diff-check failure resulted.

Exact commit SHA
- `e8dc18208a4828ef7900b49ea96be5f8f027da8a`
