# T14C exact commands and scope

Worktree: `C:/Users/laich/.codex/worktrees/full-remediation-20261001/hkwtia`, branch `codex/event-payment-recovery-20261003`. Source fe92e533; helper a08b877e. No Production effects.

```powershell
$env:RUN_POSTGRES_INTEGRATION="1"
node node_modules/vitest/vitest.mjs run tests/integration/full-fix-event-payment.test.ts tests/integration/audit-full-ticket-lifecycle.test.ts tests/integration/ticket-eligibility-postgres.test.ts tests/unit/event-orders-repository.test.ts tests/unit/event-orders-sql.test.ts tests/unit/ticket-webhook.test.ts tests/unit/ticket-pass-email.test.ts tests/unit/ticket-checkout-core.test.ts tests/unit/ticket-checkout-recovery.test.ts tests/unit/ticket-checkout-actions.test.ts tests/unit/ticket-checkout-action-recovery.test.ts tests/unit/ticket-checkout-recovery-route.test.ts tests/unit/ticket-checkout-form.test.tsx
npm.cmd run lint
npm.cmd run audit:strings
npm.cmd run typecheck
npm.cmd run build
npm.cmd test -- --maxWorkers=2
$env:T14C_NATIVE="true"
node --env-file=.env.local scripts/verify-full-ticket-provider.mjs
node --env-file=.env.local .playwright/full-fix-t14c-preview-runtime.mjs
node --check scripts/verify-full-ticket-provider.mjs
node node_modules/eslint/bin/eslint.js scripts/verify-full-ticket-provider.mjs tests/e2e/full-fix-events.spec.ts
```

Actual bug reintroduction: prior source replaced only owned changed files, actual PG six and route two target failures observed, original bytes restored in finally, all11 PG /17 route cases passed. Safe mutation receipts record byte equality.

Local full skips are guarded optional DB/provider/live suites, not acceptance passes. Relevant actual PG23 ran with disposable loopback Postgres16. Native four ran against actual built Next, shared limiter and isolated Auth. Stripe cards use official TEST fixtures; signed events held and forwarded by owned loopback CLI relay. Outbox test sink is not real provider delivery. Details and log hashes: verification.json, attempts.json, log-receipts.json.
