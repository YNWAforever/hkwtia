# Partner-logo Production release receipt — 2026-10-01 HKT

## Scope and authority

The requester confirmed all 79 current relationships and logo-display rights, authorized R2 credentials to Vercel, selected the same bucket hkwtia-partner-acceptance-20260930 / jurisdiction default, and explicitly authorized PR #105 merge, Production deployment, import and publication.

This receipt supersedes the earlier missing-bucket / unreleased observations in the September 30 restoration report. Broader audit/provider gates keep their existing status.

## Actual release identity

- PR #105 merged at 2026-09-30 19:11:52 UTC / October 1 03:11:52 HKT.
- Merge source e7fa4add247489f525f015007460fb522fb1531b; its complete tracked tree equals verified PR head 163a34bcbc06fdc08a8b634d900e11ea65c0eb2f.
- Next.js 16.3.6. [CI 36755125547](https://github.com/YNWAforever/hkwtia/actions/runs/36755125547) passed: 716 files / 6,097 tests passed, 65 files / 171 tests skipped; lint, typecheck, strings and build passed.
- Production dependency audit passed its high-severity gate: 1 low / 12 moderate remain. Development-inclusive install audit reported 3 low / 18 moderate / 9 high. No all-dependency clean claim.
- A clean tracked Git archive built with existing Production project configuration, no isolated DB/Auth/Stripe/env overrides: 267 pages, exit 0.
- Deployment dpl_DLFixAkkcNmpMCUTu3BY98hTDstQ, [immutable URL](https://hkwtia-may7nip2c-ynwaforevers-projects.vercel.app), READY, target Production.
- Promotion at 2026-09-30 19:42:22 UTC / October 1 03:42:22 HKT exited 0. Provider lookup of hkwtia.vercel.app resolves that exact deployment/source.
- Rollback target dpl_3KL2kwtCM7m5uwvXpcCtvJuVLHLu, source ab568934471cde8aea18f493a5422653c5d719e0.

The CLI deploy --prod --skip-domain unexpectedly assigned the secondary project alias hkwtia-ynwaforevers-projects.vercel.app. The canonical alias remained on the prior release until explicit promote. No claim that the build assigned no aliases.

## Configuration and database

Production R2_BUCKET was added as Sensitive. Existing Sensitive R2_JURISDICTION was updated to default with a value-only API PATCH. The CLI update first failed because it attempted to update the Sensitive variable key. The three existing account/access/secret values were neither downloaded nor replaced; their deployed read capability remains unverified.

Sensitive values are write-only; blank CLI env readback was not treated as proof of missing runtime configuration. [Vercel documentation](https://vercel.com/docs/environment-variables/sensitive-environment-variables).

Provider metadata and existing runtime endpoint evidence identify fragrant-mountain-25240574 / br-noisy-glitter-ao2npd77 / neondb. Exact pooled hostname: ep-steep-wind-ao0pbldw-pooler.c-2.ap-southeast-1.aws.neon.tech. Actual read-only SQL/preflight confirm migration ledger 0051 and zero partners. No migration or fixture seed ran.

Preflight counts: 2 profiles, 3 companies, 0 memberships, 0 billing attempts. Source preflight checks all 79 approved original SHA-256 hashes and normalized images: 58 supporting / 15 regional / 6 media. The content-review CSV records names/alt fields; English-name fallback remains where no approved Chinese translation exists. No relationship dates are invented.

## Verification actually performed

| Environment | Actual result | Limit |
| --- | --- | --- |
| Isolated Preview | Prior real R2 PUT/GET/checksum/own DELETE, SQL, 8 bilingual browser cases and synthetic staff CMS passed | Test configuration; not Production acceptance |
| Production-configured immutable deployment | 12/12 cases passed | Before import: zero partners; no deployed R2 image proof |
| Canonical Production, no cookies | 12/12 cases passed | Before import: zero partners; no Google/magic-link/payment/send claim |
| Operator guard | Import exited 1 with PARTNER_PRODUCTION_OPERATOR_SELECTION_REQUIRED before writes | Expected refusal, not a successful import |
| 79-logo Production import/publication | Not run | Pending existing privileged operator selection |
| Full fixture cleanup / Production rollback | Not run | Fixtures retained; no cleanup/rollback claimed |

Both real browser sets cover English/Chinese home, partner directory and anonymous admin entry at desktop 1440x1000 and mobile 390x844. Final responses are 200. Directories show localized zero-record states; anonymous editor visits redirect to matching admin-login routes. No page/console errors or horizontal overflow. Selected screenshots were inspected.

## Remaining dependency and prepared process

The requester's previously supplied identity is stored as member; one existing superadmin is present. The existing importer requires an actual staff/ExCo/superadmin profile, independently checks its stored role and records that actor in transactional audits. A user question selecting the operator is pending. No member elevation, synthetic Production identity or system-actor substitution.

The separate Production-only runner is prepared, and its missing-operator refusal was executed. It reuses current importer/authorization/repository/image/R2 modules. Guards validate exact source/database/bucket, approvals, user-selected stored operator and ledger. It imports unpublished/unconfirmed rows, verifies actual R2 hashes/dimensions and rerun idempotency, scopes audits/publication/rollback to imported IDs, and requires all 79 images to pass the deployed media-route verifier before confirmation/publication. The media verifier is prepared, not run.

After operator selection:

1. Re-read selected stored role/Auth identity.
2. Import unpublished/unconfirmed; verify own objects and idempotent rerun.
3. Verify all 79 through the deployed media route; resolve actual provider failures before publication.
4. Apply approved confirmations/publication through existing repository methods.
5. Run established 8 locale/viewport logo cases at immutable and canonical origins: 79 distinct decoded images, categories 58/15/6, previews 12/12/6, localized view-all clicks.
6. Append actual counts/audit/screenshots; only then mark Production logo restoration complete.

## Exact commands and rollout / rollback

Executed from the implementation worktree:

~~~powershell
gh pr merge 105 --merge --match-head-commit 163a34bcbc06fdc08a8b634d900e11ea65c0eb2f
node .playwright/configure-partner-production-r2-names.mjs
node .playwright/update-partner-production-jurisdiction.mjs
node .playwright/deploy-partner-production-stage.mjs
node .playwright/bootstrap-partner-production.mjs
node .playwright/run-partner-production-before-import.mjs
node --conditions=react-server --import tsx .playwright/run-partner-production.mts preflight
node --conditions=react-server --import tsx .playwright/run-partner-production.mts import
node .playwright/promote-partner-production.mjs
node .playwright/run-partner-production-canonical-before-import.mjs
~~~

First env helper added bucket then failed jurisdiction; the value-only helper succeeded. Import is the expected actor-guard refusal. One evidence-packaging orchestration attempt failed JavaScript parsing before tool execution; corrected packaging succeeded. No application code changed for harness/config issues.

Prepared, not executed:

~~~powershell
node --conditions=react-server --import tsx .playwright/run-partner-production.mts import
node .playwright/verify-partner-production-deployed-media.mjs
node --conditions=react-server --import tsx .playwright/run-partner-production.mts publish
~~~

No secret/cookie is included. Restore no-secret harness archives to matching ignored .playwright filenames for reproduction; connection/credential/operator/share/state files stay private.

Order: R2 names/config -> compatible Production web -> selected-actor unpublished import -> deployed image verification -> repository confirmation/publication -> bilingual live acceptance. No migration, new flag, worker, Auth setting, payment/refund or member message is required or performed here.

Web rollback: promote only dpl_3KL2kwtCM7m5uwvXpcCtvJuVLHLu and repeat smoke. After publication, first use prepared unpublish mode on exact recorded IDs, verify both public counts, then roll back compatible web if needed. Retain data/audits/objects; code rollback alone does not unpublish DB rows. Production rollback has not been rehearsed.

The shared bucket contains retained Preview fixture keys. Later test teardown must target only its recorded keys and preserve Production objects; never delete the bucket or unrelated rows. The isolated Preview branch expires October 4 20:00 HKT.

## Separate completion statements

- Code fixed: PR #104 importer fixes and PR #105 dependency/evidence changes merged; policies preserved.
- Staging verified: actual isolated R2/SQL/browser/CMS acceptance passed.
- Production web released: exact e7fa4add release and 12 live smoke cases verified.
- Production 79-logo restoration: incomplete; operator selection/import/deployed images/publication/final browser acceptance pending.

[Checksum-indexed execution evidence](evidence/partner-logos-production-2026-10-01/manifest.json).

## Production import continuation — 2026-10-01 09:44 HKT

The requester explicitly selected the existing unique superadmin. Read-only stored-role/Auth-identity checks found exactly one valid existing profile; no profile or role was created/changed.

Actual guarded Production import completed at 2026-10-01T01:37:26.934Z / 09:37 HKT: created79, skippedExisting0, skippedError0. All79 original approved hashes, uploaded R2 bytes/checksums/dimensions and transactional partner.created audit rows were verified. The idempotent rerun created0 and skippedExisting79 with no errors. All79 remain unpublished/unconfirmed. Row counts remain profiles2 / companies3 / memberships0 / billing_attempts0.

The deployed media verifier then failed on the first image with404. Both the canonical request and the protection-authenticated immutable request reproduce404. Source inspection shows that the active complete media reader has no partner-publication gate. The same current repository/media handler, using the actual Production database and already verified R2 configuration, returned200/image/png with matching checksum. The initial local diagnostic helper incorrectly called native Response.status as a method; property access correction passed. No application source changed.

A proposed value-only update of the three existing Sensitive Production R2 values plus redeployment was rejected by automatic approval review before execution. Its stated reason: previous credential transfer approval specifically covered Preview, and persistent Production secret transfer needs explicit scope. No Production env value changed and no new deployment occurred in this continuation. A precise request for R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY to the linked hkwtia Production environment, same bucket/default, and same-source redeployment is pending.

This supersedes the actor-selection/import-pending status above. Deployed R2 capability, publication and the final79-image bilingual browser acceptance remain incomplete. The old pre-import24 checks and green CI remain dated verified evidence; they are not successful Production logo acceptance.

Added evidence: production-import-unpublished.json, production-media-first404.json and production-import-provider-gate.json. After explicit Production secret-transfer approval, sync only these3 R2 values, redeploy the same source, reverify all79 through deployed media, apply confirmations/publication using the selected stored actor, then execute the prepared8 stage +8 canonical logo browser cases. No publication gate is disabled.
