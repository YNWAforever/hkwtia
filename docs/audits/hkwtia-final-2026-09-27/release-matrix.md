# Release matrix and rollout / rollback gate

Observed 2026-09-28 Asia/Hong_Kong. This is a review package, not a deployment record. Feature branch `codex/final-login-admin-20260928` starts at PR #94 merge `fe22b49ed9828dd0cfad536273df5960ed90ca66`; latest application commit `cb88d7e8`, latest test commit `86377dcc`. See [acceptance.md](acceptance.md) and [baseline.md](baseline.md).

| Surface | Observed revision/state | Evidence | Gate |
|---|---|---|---|
| Production alias `hkwtia.vercel.app` | READY deployment `dpl_EFqZ8W4W3ANKLMXoNHCQ9EdAT4tt`, web SHA `fe22b49e` at baseline | Read-only Vercel/API and public browser GET | Feature branch is not on alias; recheck exact SHA before promotion. |
| Inspected production Neon branch | Migration ledger last id 36; grant columns, checkout recovery, import and batch tables absent | Read-only metadata and zero-row SQL | Confirm this is alias's DB binding; review additive 0037–0051 sequence before a separately authorized production migration. |
| Isolated acceptance Neon | Project `solitary-wave-52860119`, branch `br-lingering-unit-azxl75s5`; migration ledger 0051 after this guarded rehearsal, expiring 2026-10-04 | Exact project/URL/host guard, synthetic identities | Ledger and both new auth bucket constraints verified read-only after migration; confirm exact Preview binding and never substitute production URL. |
| Local web | Source through `cb88d7e8` on localhost:3127 | Unit, build, guarded Chromium | Local acceptance is not hosted staging. |
| Hosted Preview web | No exact URL/SHA verified at this record | No completed deployment | Deploy feature PR to protected Preview; record URL, SHA, DB binding, flags and screenshots. |
| Worker/cron | Production and Preview worker SHA unknown | No matched revision/lease proof | Record worker SHA, schedule, last success, oldest pending, dead letters and uncertain outcomes before effects. |
| Flags | Source defaults `AUTH_GOOGLE_ENABLED=false`, `ADMIN_BATCH_ENABLED=false`, `EVENT_ATTENDEE_EXPORT_ENABLED=false`, `EVENT_CANCELLATION_NOTICES_ENABLED=false`; deployed values unknown | `.env.example` and code only | Inspect exact target; open individually after relevant schema/web/worker/provider/policy gates. |
| Neon Auth/Google | Shared Google provider listed on isolated branch; localhost omitted from trusted origins | Provider metadata only | Add exact protected Preview origin/callback and prove synthetic account/linking before enabling. |
| Email/magic link | Source/UI and limits tested; provider receipt unknown | No test-inbox receipt | Verify approved isolated recipient, delivery, expiry, resend and cross-device callback; no live member sends. |
| Stripe/payment | PR #94 holds historical test-mode evidence; no new round trip on this branch | No current webhook/price-ID/receipt proof | With matching test secret, webhook secret, test Price IDs and fresh synthetic pending membership, repeat guarded test-mode checkout/refund/replay on exact Preview. |

## Preflight and release sequence

1. Compare reviewed PR SHA with Preview web SHA and worker source. Confirm protected Preview→Neon project/branch, Auth origin, test sinks, Stripe test-mode IDs and deployed flags without printing credentials. Confirm migration ledger and column/constraint inventory. The inspected production branch at 0036 needs the full missing chain, not only an isolated 0048 repair; new 0051 follows 0050.
2. Rehearse pending additive migrations on disposable/isolated upgrade-path DB with old/new web compatibility. Preserve payment idempotency, outbox keys, historical indefinite grants and batch states. Repeat focused PostgreSQL and synthetic browser acceptance. Obtain target-specific authorization only after prerequisites are concrete.
3. Apply compatible additive schema **before** new web. Deploy exact reviewed web SHA with effectful flags off. Record URL, SHA, DB ledger/host class and public/staff smoke. Deploy compatible worker/cron next with delivery and new batch effects paused; verify leases, queue age, dead letters and provider reconciliation.
4. On protected Preview, repeat bilingual public entry, Google callback, real magic-link receipt/expiry/retry, denied access after role removal, onboarding/Join/resume/renewal, admin search/history/detail, batch preview/partial recovery and directory multi-page navigation with synthetic actors. Use existing Stripe test-mode runbook for checkout, decline/3DS, webhook replay and refund, recording provider receipts separately from UI. Use approved test sinks only. A skipped provider case stays open.
5. Review factual/legal homepage copy, membership prices and `past_due`/refund/consent policy with association owners. Enable each flag only after its schema, web, worker, provider and policy gate passes. Observe directory error references, queue age, uncertain batch states and approved aggregate performance/RUM before any production promotion. Production migration, live sends/payments/grants and promotion require separate specific authorization.

## Rollback and reconciliation

- Close effectful flags and pause new worker claims first. Record in-flight IDs and provider status. Do not retry uncertain sends, payments, refunds or grants until provider and local records are reconciled under existing idempotency keys.
- Roll web and worker back only to revisions compatible with the additive schema. Keep 0037–0051 tables/columns and all audit, outbox, order, billing, grant, batch and consent history. Do not drop schema or delete rows as a rollback.
- Directory/login regression: rollback compatible web after confirming DB state; preserve request-reference logs. Worker rollback must respect batch operation compatibility. An accepted external effect is never resent simply because its local settle is uncertain.
- Production is released only when exact alias web SHA, DB ledger, worker SHA, flags and provider environment are observed after promotion. Code fixed, local/isolated verified, hosted staging verified and production released are separate claims.

## Outstanding gates

1. Vercel→Neon binding for the production alias; reviewed migration plan from 0036 to 0051 and separate production authorization.
2. Protected Preview deployment with exact web/worker SHAs, isolated DB ledger and flag values.
3. Google trusted callback and synthetic provider round trip; test-inbox magic-link receipt/expiry and cross-device recovery.
4. Matching Stripe test webhook secret/Price IDs and fresh isolated pending membership; provider-backed checkout/refund acceptance. Real email/WhatsApp receipts and hosted worker schedule.
5. Association-owner factual/legal and membership policy approval. Proposed defaults in the plan are not association policy.
