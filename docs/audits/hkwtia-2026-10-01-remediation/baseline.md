# 2026-10-01 remediation baseline

## Source and authorization

- Repository: YNWAforever/hkwtia. Branch: `codex/full-remediation-20261001`.
- Base/latest main: `60a272b68c334d256d578ade36d8e24ca3be5485`.
- Existing root checkout is older and dirty; preserved. Implementation uses an independent native worktree.
- Canonical Production readback: `e7fa4add247489f525f015007460fb522fb1531b`, deployment `dpl_GYj8pTrvHxSZRDszXnVnCtkDS8rV`, READY. Diff to base contains only docs/evidence.
- Development and isolated testing are authorized. New remediation production publication and feature activation require a concrete version-specific release decision.

## Input integrity and historical evidence

All seven supplied pack checksums passed. Original audit ZIP SHA256: `1d3f95facf08c377660d56b3f5cd17df62fe3405b8771f2b360985eb20d95112`.
Plan SHA256: `3af81f246ab3738c2f1f4cbb361b893cf1106e7e9d33abfb6ace7eb5231becd8`.
Audit, Maintenance, baseline, CMS reproduction, corruption list and selected test/string/typecheck/HTTP phase logs were read. The audit's 6097 pass/171 skip is historical. Its Google passkey interruption is not established as an app defect; TLS timing does not establish database latency.

## Confirmed isolated target

Neon project `solitary-wave-52860119`, branch `br-lingering-unit-azxl75s5` (`codex-audit-20260927`), non-primary/non-default/non-protected. Expires 2026-10-04 12:00 UTC. Pooled database host `ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech`; Auth host `ep-plain-mouse-azm8pl2j.neonauth.c-3.ap-southeast-1.aws.neon.tech`.

Actual readback 2026-10-01 07:25 UTC: 51 ledger rows; one acceptance sentinel; 100 profiles across four roles, all `.example.test`; four completed batches and no active batch. Credentials loaded privately from the existing isolated test env and written only to ignored `.env.local` in this worktree. Stripe test-mode only; email test sink; live Woztell disabled. Existing shared R2 bucket now serves published logos; destructive cleanup is prohibited.

## Current verification

- `npm.cmd ci`: pass, unchanged lockfile; 25 dependency advisories (3 low, 13 moderate, 9 high). No automatic upgrades applied.
- `git diff --name-only e7fa4add247489f525f015007460fb522fb1531b HEAD`: documentation/evidence only.
- Typecheck, fresh suite, fixture scale/idempotency and migration rehearsal: pending.
- Current deployed worker SHA/bindings/schedule readback: unverified; repository config alone is not deployment evidence.

## Path mappings

The repository's existing fixture safety guard is `scripts/lib/acceptance-guard.ts`; base data is `scripts/seed-m2.ts`, with existing audit batch/import/grant fixtures retained. Root's current `docs/agent-history.md` supplies contributor history; it is not copied over unrelated worktree files.

## Fresh T00 execution receipts

- `npm.cmd test` launched before implementation: 716 files passed / 65 skipped; 6097 tests passed / 171 skipped, exit 0, 359.54s. Logs retained privately. This fresh baseline is not a candidate release gate; rerun after the code changes.
- `npm.cmd run typecheck`: pass before changes, and pass after T00/T01/T02 changes.
- `node --env-file=.env.local --experimental-strip-types .playwright/t00-migrate.mjs`: existing repository `runMigration`/Drizzle command on the confirmed branch's **direct** connection, exit 0; ledger stays 51. No new migration yet.
- `node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/unit/full-remediation-fixture.test.ts tests/integration/full-remediation-fixture.test.ts`: 7 passed / 0 skipped, real SQL, 18.90s. Guards reject unconfirmed scope, both production environment labels, an unconfirmed host even when allowlisted, an unpaused local driver and an invalid run ID. Initial scaffold failure was recorded before implementation; the scaffold performed no writes.
- Same run `00000000-0000-4000-8000-000000001001` twice: 5000 scale profiles, 101/51 company-linked members, no duplication. M2 supplies four roles and company owner/admin/member; new data supplies seven membership states and one profile without membership. These database fixtures do not establish new provider Auth identity acceptance; T05 owns that verification.
- `node workers/node_modules/wrangler/bin/wrangler.js deployments list --cwd workers --env preview --name hkwtia-m3-preview --json`: pass. Latest deployment `00511ed9-5392-47b8-a256-6d6d87ff4092`, version `67abdfce-e2f3-4964-ad19-3468bf00fd89`, 100%, created 2026-07-26 18:42 UTC.
- `wrangler versions view` readback: APP_URL and CRON_SECRET are secret bindings; no source SHA is embedded. Its target and current scheduler effects cannot be established from secret names. No job was invoked and no worker deployment changed. T11 must establish a dedicated confirmed-isolated worker and tagged source evidence before effectful acceptance.

`AUDIT_BATCH_WORKER_PAUSED` in the isolated env describes the local acceptance driver gate. It is not evidence that the existing deployed Cloudflare worker is paused. Original masked readback contains only names/modes and synthetic row counts.
