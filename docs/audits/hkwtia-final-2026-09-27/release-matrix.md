# Release matrix and rollout / rollback gate

Observed 2026-09-28 Asia/Hong_Kong. This is a review package, not a deployment record. Feature branch `codex/final-login-admin-20260928` starts at PR #94 merge `fe22b49ed9828dd0cfad536273df5960ed90ca66`; latest application commit `cb88d7e8`, latest test commit `7e776e46`. See [acceptance.md](acceptance.md) and [baseline.md](baseline.md).

| Surface | Observed revision/state | Evidence | Gate |
|---|---|---|---|
| Production alias `hkwtia.vercel.app` | READY deployment `dpl_EFqZ8W4W3ANKLMXoNHCQ9EdAT4tt`, web SHA `fe22b49e` at baseline | Read-only Vercel/API and public browser GET | Feature branch is not on alias; recheck exact SHA before promotion. |
| Separately inspected Neon candidate | Migration ledger last id 36; grant columns, checkout recovery, import and batch tables absent | Read-only metadata and zero-row SQL | Alias binding is unverified. Review additive 0037–0051 sequence only after mapping the real target. |
| Isolated acceptance Neon | Project `solitary-wave-52860119`, branch `br-lingering-unit-azxl75s5`; migration ledger 0051 after this guarded rehearsal, expiring 2026-10-04 | Exact project/URL/host guard, synthetic identities | Ledger and both new auth bucket constraints verified read-only after migration; confirm exact Preview binding and never substitute production URL. |
| Local web | Source through `cb88d7e8` on localhost:3127 | Unit, build, guarded Chromium | Local acceptance is not hosted staging. |
| Hosted Preview web | READY isolated branch deployment `dpl_5EmKWLHAV8U9FuMdjFaHT9s1iMLp`, web Git SHA `3f181768`, stable branch alias | Synthetic admin 5/5; synthetic batch history 1/1 with cleanup; read-only bilingual directory 6/6; member list/detail HTTP 200 | Branch-scoped `neondb` is at ledger 0051. Google, email, Stripe and worker effects remain open; recheck final PR SHA after documentation/test commits. |
| Worker/cron | Production and Preview worker SHA unknown | No matched revision/lease proof | Record worker SHA, schedule, last success, oldest pending, dead letters and uncertain outcomes before effects. |
| Flags | Branch Preview explicitly keeps Google, admin batch, attendee export, cancellation notices and live WozTell disabled; email delivery test mode | Branch-scoped Vercel override metadata and guarded acceptance | Open each capability individually only after its schema, web, worker, provider and policy gates. |
| Neon Auth/Google | Isolated Auth branch trusts the stable Preview alias; shared Google provider metadata exists | Trusted-domain listing; no browser callback receipt | Use a synthetic Google account for callback/linking before enabling Google. |
| Email/magic link | Source/UI and limits tested; test-mode delivery configured, receipt unknown | No test-inbox receipt | Verify isolated recipient, delivery, expiry, resend and cross-device callback; no live member sends. |
| Stripe/payment | Branch Preview has test-mode credentials/Price IDs; PR #94 has historical provider evidence | No fresh branch checkout/webhook/refund receipt | Repeat guarded test-mode checkout/refund/replay with a fresh synthetic pending membership on exact Preview. |

## Preflight and release sequence

1. Compare reviewed PR SHA with Preview web SHA and worker source. Branch Preview is now bound to the approved isolated `neondb` at ledger 0051 with synthetic Auth/test-provider configuration and effectful flags off. Reconfirm the exact deployment snapshot and branch scope before provider tests. Production alias binding remains unknown; the separately inspected candidate at ledger 0036 is not a confirmed target. Vercel Production lists an encrypted `DATABASE_URL` entry but does not expose its host.
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

1. Vercel→Neon binding for the production alias; determine its actual ledger before a reviewed migration plan and separate production authorization. The candidate at 0036 is not a confirmed binding.
2. Branch Preview web `dpl_5EmKWLHAV8U9FuMdjFaHT9s1iMLp` is READY at SHA `3f181768` with isolated `neondb` ledger 0051. Synthetic admin 5/5, synthetic batch history 1/1 with cleanup, and read-only bilingual directory 6/6 passed. Worker SHA and hosted provider paths remain unverified. Recheck the final PR SHA after later test/document commits.
3. Google trusted callback and synthetic provider round trip; test-inbox magic-link receipt/expiry and cross-device recovery.
4. Matching Stripe test webhook secret/Price IDs and fresh isolated pending membership; provider-backed checkout/refund acceptance. Real email/WhatsApp receipts and hosted worker schedule.
5. Association-owner factual/legal and membership policy approval. Proposed defaults in the plan are not association policy.

## Exact branch Preview binding after approval

The earlier read-only checkpoint at SHA `d419eccf` found Preview main ledger 0006 and a directory `schema_missing` error; it remains historical evidence of the mismatch. An initial branch-scoped credential upload was rejected by automatic approval review and made no environment change. The user then explicitly authorized transfer of guarded isolated Neon DB/Auth and matching test-provider credentials to Vercel project `hkwtia`, scoped only to branch `codex/final-login-admin-20260928`. That branch override is now in place. The first PowerShell-piped and `--value` attempts were replaced using exact CLI standard input after CRLF and Windows `&channel_binding` handling were detected; no secret was printed. The effective database is `neondb` on the isolated Neon branch at ledger 0051, not Preview main or the same-branch `hkwtia_m2_audit` database.

The stable branch Preview alias and the READY deployment `dpl_5EmKWLHAV8U9FuMdjFaHT9s1iMLp` at web SHA `3f181768` have synthetic admin and public directory evidence in [acceptance.md](acceptance.md). Google, magic-link receipt, Stripe round trip and hosted worker effects have no fresh provider receipts. Production alias binding is still unproven. No production migration, promotion, real send, payment/refund or membership grant was performed under this approval.
