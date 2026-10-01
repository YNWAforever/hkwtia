# HKWTIA 2026-09-29 release matrix and rollback

**Current state (2026-09-30 HKT): PR #101/#102 are merged; Production serves `ab568934471cde8aea18f493a5422653c5d719e0`.** The explicitly approved alias promotion completed at 2026-09-29T16:09:38.625Z. [Release receipt, exact commands and screenshots](release-20260930.md) supersede the earlier unreleased-PR #100 state retained in the historical [verification log](verification.md).

| Boundary | Verified state | Remaining gate |
|---|---|---|
| Source | PR #101 merge `290d50c6`; PR #102 merge `ab568934`; reviewed head `86c37d7e` has an identical source tree. Main CI run 36592795616 passed. | No code-completion claim beyond the findings recorded in finding-status.md. |
| Isolated Preview | `dpl_AQVE9QJiQiPRpidi8Rpb9ScFrKTi`, real isolated Neon Auth; 5/5 shell/authorization tests; 16 dashboard destinations; two locales/seven widths; four Axe scans without serious/critical violations. | Google callback, magic-link inbox/expiry/linking, all batch/provider and CMS publish journeys are not verified by this dashboard suite. |
| Production web | `hkwtia.vercel.app` resolves to READY production `dpl_5Xgjk74ximch2aUBugzHgWRfCgon`, SHA `ab568934`; staged and live anonymous smoke each passed 10 checks. | Real-member Google/profile journey is still unverified. |
| Database | Read-only Production ledger count/latest 51 on `fragrant-mountain-25240574` / `br-noisy-glitter-ao2npd77`. Isolated branch ledger also 51. | No migration or seed is required or performed for this release. |
| Worker and cron | No worker source/deployment or schedule change; no effects invoked. | Worker SHA/region, last-success, queue age and dead-letter health were not verified in this round. |
| Neon Auth | Production configuration unchanged. The Preview uses the isolated branch and synthetic sessions. Its two trusted origins were added only to that branch. | F05 needs a correlated Google-to-profile result; F11 WTIA-owned providers, linking and inbox evidence remain open. |
| Stripe and communications | No payment/refund or message test in this round. Preview credentials are test mode; existing Production Stripe mode remains test. Consent, price and idempotency rules unchanged. | Provider acceptance and any live activation require their separate gates. |
| Flags | Production `AUTH_GOOGLE_ENABLED=true`; effectful flags remain at their existing absent/default settings. Only isolated Preview uses batch UI enabled, worker paused and live Woztell off. | No capability was activated in Production. |
| Runtime logs | One new `/events` connection-terminated exception attached to HTTP 200; same symptom exists in prior deployment. Event-page repeats passed. | Root cause remains undiagnosed. This is not a clean-log or connection-fix claim. |
| Policy and CMS | Existing policies preserved. | F08 manual decisions and F10 public legal/pricing claims need association decisions. F09 browser Back draft loss remains known. |

## Executed rollout order

1. Confirmed exact reviewed/merged source, CI and isolated synthetic browser acceptance.
2. Read back Production configuration/schema; retained existing flags and provider bindings. No new migration exists.
3. Built Production with existing Production settings and `--skip-domain`; no isolated test overrides. Staged smoke passed.
4. Obtained explicit approval for the exact SHA/deployment and promoted it. Verified alias identity and live smoke.
5. Preserved existing worker, database and effectful configuration. Recorded the residual connection-log symptom and broad-audit gates.

The Vercel production branch is **`release`**. Merging `main` produces a Preview; it does not itself release the Production alias.

## Verified rollback target and checklist

- Previous compatible READY deployment: `dpl_8cr2En9xQhrs5nDpxny9GY3L4stx`, SHA `0076981b203632da15ae8f881d3cb55287ccaa79`.
- Command syntax/identity checked; rollback has **not** been executed:

```powershell
vercel.cmd rollback dpl_8cr2En9xQhrs5nDpxny9GY3L4stx --yes --scope ynwaforevers-projects
```

After rollback, read the alias deployment/SHA again, repeat public/login/admin-denial smoke and inspect runtime logs. Do not reverse migrations 0037–0051, delete batch/outbox/audit/payment/grant/consent history or replay external effects. No DB or worker rollback is required for this web-only release.

**Claim boundary:** dashboard code merged; isolated authenticated dashboard acceptance passed; approved web SHA is Production released. The remaining provider, policy, CMS-history and runtime-connection issues are explicitly open.

## Authorized partner-logo rollout — 2026-10-01 HKT

[Actual release receipt and ordered checklist](../../integration/partner-logo-production-release-2026-10-01.md): R2 names configured, existing-Production-only web e7fa4add deployed/promoted with 12 staged and 12 live checks. No schema/flag/worker rollout. Remaining steps require selection of existing stored privileged actor, unpublished import, actual deployed 79-image verification, repository confirmations/publication and bilingual live acceptance. Canonical web rollback target is dpl_3KL2kwtCM7m5uwvXpcCtvJuVLHLu. Once published, first unpublish only recorded79 IDs and verify counts; preserve audits/objects. No Production rollback or full fixture cleanup has run. This supersedes older unreleased statements only for this web slice.

### Production import / provider gate — 2026-10-01 HKT

The user selected the existing unique superadmin. Actual Production import created79 unpublished/unconfirmed partners and79 audit rows; all79 R2 hashes/dimensions passed. Rerun created0/skipped79. Unrelated counts remain2 profiles/3 companies/0 memberships/0 billing attempts. The deployed media route still returns404; current handler with actual Production DB and verified R2 config returns200/checksum-match locally. Automatic approval review rejected persistent Production R2 credential transfer, citing earlier Preview-only transfer scope. No secret patch/redeployment/publication occurred; explicit3-key Production transfer approval is pending. [Exact execution/gate](../../integration/partner-logo-production-release-2026-10-01.md). No skipped/unrun browser test is claimed complete.
