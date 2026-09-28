# HKWTIA 2026-09-29 release matrix and rollback

**Current result: source branch reviewable; Production promotion is not ready.** The 2026-09-29 application SHA `5fb79ec7a3f00d2e658e5e7e5e638b8ffd216726` is on `codex/audit-20260929-login-flow` and its automatic Vercel Preview `dpl_7BZVNYtrHtu3rjQwNfwJ2uZovDnY` is READY at `https://hkwtia-em22z68el-ynwaforevers-projects.vercel.app`. Later evidence-only commits must be identified by their own Preview deployment; they do not retroactively change this application receipt. The Production alias still pointed to READY `dpl_8cr2En9xQhrs5nDpxny9GY3L4stx` when read-only inspected at the start of this round. This branch was not promoted.

| Boundary | Exact release check | This round's evidence / status |
|---|---|---|
| Web | Reviewed PR SHA, matching Preview deployment ID, routes, build and browser receipt | Application `5fb79ec7`, Preview `dpl_7BZVNYtrHtu3rjQwNfwJ2uZovDnY` READY. Local full suite/build passed; Preview protected, so only authenticated CLI HTTP/SSR smokes ran. Browser Preview acceptance blocked. |
| Worker and cron | Source SHA, region, schedule, lease/effect compatibility, last success, queue age and dead letters | No worker source change or deployment in this branch. Deployed worker version/health was not read back this round. No effects were invoked. |
| Database | Explicit target host/branch and ledger 0037–0051, compatible schema/read queries | No new migration in this branch. Earlier 0037–0051 Production application is historical evidence in the 2026-09-27 acceptance record, not a fresh binding/ledger readback. New disposable pgvector PostgreSQL 16 migration succeeded; it was removed. |
| Neon Auth | Exact Preview/Production branch, trusted origins, Google/linking and magic-link policy | Not read back. No synthetic Google callback or test-inbox receipt. Preview's protected page responded, but provider behavior remains unverified. |
| Stripe | Test versus Live mode, active price IDs/currency/interval and webhook endpoint | No new checkout/refund test. Existing payment rules and idempotency were unchanged. Prior PR/branch receipts are historical, not this branch's acceptance. |
| Communications | Test inbox/sandbox, consent, suppression, outbox and worker | No real send or provider receipt. No consent default changed. |
| Flags | `AUTH_GOOGLE_ENABLED`, `ADMIN_BATCH_ENABLED`, `MEMBER_IMPORT_ENABLED`, `MEMBERSHIP_GRANTS_ENABLED`, `MEMBERSHIP_GRANT_BATCH_ENABLED`, `MEMBER_COMMUNICATION_BATCH_ENABLED`, `MEMBER_EXPORT_ENABLED`, `EVENT_ATTENDEE_EXPORT_ENABLED`, `TICKET_RESEND_BATCH_ENABLED` | Values were not read back for this deployment; no flag was changed. Join Google entry remains feature-gated. |
| Browser | Seven widths × two locales, Join/provider continuation, role revocation, queue, batch partial failure, CMS and transaction matrix | Local anonymous login entry 15/15 passed, with DB-error logs; visual-only local capture 3/3. Join console-cleanliness and Auth-dependent admin screenshot had explicit local failures. Preview browser blocked by deployment protection and absent share/session credential. |
| Production | Exact alias web SHA, DB ledger, Auth/worker binding, approved flags and smoke | Existing alias metadata only. No new code, database change or effect was released by this branch. |

## Controlled rollout order

1. Review the branch and its [finding status](finding-status.md) and [verification log](verification.md). Resolve F05 provider/profile root cause with a fresh support reference, then obtain synthetic Google and test-inbox receipts. Confirm F08/F10 association policy before their work; current source deliberately does not choose a policy.
2. Read back the exact Preview Auth, database, provider and flags binding. Run protected Preview Playwright with a scoped protection-only session and synthetic actors: bilingual login/Join/resume, role revocation, pending queue, batch partial failure, CMS unsaved/publish and test-provider transactions. Record exact screenshots and provider receipts. A CLI 200 or a skipped test does not satisfy this gate.
3. Reconfirm Production database host/branch and migration ledger. This branch has **no migration** to apply. Verify current web and worker compatibility with the existing schema, leases, outbox/effect keys and historical grants. Do not run production seed, migration, real payment/refund or member send as part of review.
4. If later authorized for release, deploy the reviewed web SHA with effectful flags unchanged; no worker deployment is required by this source change. Verify anonymous and synthetic read-only Production journeys, then enable only separately approved capabilities after provider, policy and worker gates. Record exact alias deployment, web SHA, DB ledger, worker SHA/region, flag values and times.

## Rollback and reconciliation

- For a web regression, repoint the alias to the previous **schema-compatible** READY web deployment after verifying the exact ID. Do not roll back or drop 0037–0051 merely to revert UI.
- If an effectful capability is later enabled and fails, stop new submissions through its approved flag, let in-flight worker claims settle, inspect provider acceptance and stored idempotency/effect keys, then reconcile before retry. Do not delete batches, outbox, payments, refunds, grants, audit or consent history.
- A web rollback cannot undo an accepted external payment, refund, grant or message. Match worker code to the retained schema before changing worker deployment.

**Claim boundary:** Code fixes and local/isolated checks are recorded in this branch. Staging provider/browser journeys are not verified. Production has not released this branch.