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
- At T00, `git diff --name-only e7fa4add247489f525f015007460fb522fb1531b 60a272b68c334d256d578ade36d8e24ca3be5485`: documentation/evidence only.
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


## T22/T23 final reconciliation (2026-10-02)

Main remains 60a272b68c334d256d578ade36d8e24ca3be5485; Production remains e7fa4add/dpl_GYj8pTrvHxSZRDszXnVnCtkDS8rV. Current review stack PR107–122 is OPEN/DRAFT, not merged. Active acceptance branch codex/full-remediation-acceptance-20261001 contains the existing fixes and task commits; root dirty work remains preserved. Candidate e9fa6d02 has an actual READY Preview dpl_4rQ5GHNGnbqRbFXqmZT5tdL9FEVz and 15 runtime passes with positive isolated DB marker, ledger56, real synthetic Auth, protected-role denial and both locale AI-Ops axe.

All 0052–0056 execution and synthetic writes were isolated, not Production. Branch br-lingering-unit-azxl75s5 is non-primary/default/protected, exact G0 DB/Auth target; expiry Oct4 12UTC must be reconfirmed for later acceptance. The historical July worker is not invoked or relabeled as verified. Dedicated worker config is fail-closed/dry-run only. Credentials/session/raw reports stay ignored; only fixed safe projections, public/synthetic screenshots and hashes enter evidence.

Full current unit 6304 pass/0 fail/329 guarded skips; each skip is retained. New complete-browser collection and its remaining gate dispositions are recorded independently, never inferred from the original6097/171 baseline. No Oct1 Production release, migration, policy default or blanket flag approval is inferred from older session approvals.

2026-10-03 HKT：current code candidate 5b4ac2f4f1bd875047037dcaf4f9cfae79ce4e25，main／Production unchanged；本輪四個focused commits為CMS測試identity、terminal會員billing探針、private sidebar預載、dashboard私人預載。app/test source git diff對HEAD空；generated historical screenshots／reports另移至新T22 scope，保留舊receipt。最新Preview READY dpl_5FARFWMo9etUrx675vtNX4EADDkS；current runtime尚待probe。

2026-10-03 香港時間：新8119b7f3（42930d9a私人Link＋8119b7f3logo sizes）已build0、35focused pass；完整gates尚待本輪结果。新程式只改私人導覽預載與public圖片尺寸；所有原身份、會員、付款、grant、consent、worker/outbox及政策保留。Production readback2026-10-02 18:20UTC仍e7fa4add／READY，沒有本輪發布或新migration。


## T22 continuation: native Auth absence, stable keyboard focus and client catalog (Oct3 HKT)

Application commits f7599e89 / 189c075e / 999e6b78 preserve the strict Auth provider query (cookie cache and refresh disabled), all server actor/role boundaries and association/provider policy. Anonymous built route: actual upstream session read 1 -> 0, no provider substitution; credentialed/forged cookies and Authorization still reach provider validation. Focused Auth/actor/session tests: 123 pass, 0 fail, 0 skip. Strict missing Production configuration still fails closed.

A real isolated `site_announcements` ACCESS EXCLUSIVE lock reproduced both locales accepting focus in the temporary header (2 intended RED). Temporary controls now inert and aria-hidden; after rollback the stable localized login focuses and Enter navigates: 2 native pass. The ordinary seven-width/two-locale login cases passed 14/14. Initial wrong table-name and shell-encoded label failures were corrected in the test, excluded from behavioural RED/GREEN, and the test now reads the actual UTF-8 message catalog.

Root client messages now contain usable Error recovery only; authorized Admin/Portal layouts retain the full catalog after their own actor boundary. Both locale real Error consumers and private catalog/redirect tests: 11 pass. Native public payload 2 pass; private five-case built Auth navigation 5 pass, 0 skip with its required legacy `1` guard (a preceding wrong-flag collection skipped five and is not acceptance).

Actual raw HTML transfer bytes: en 331361 -> 151231; zh-HK 320477 -> 149494. Native normalized serialized Admin namespace present -> absent, Error remains present. Body/provider payload/credential values were not recorded. These are controlled loopback before/after payload measurements, not HK/SG/RUM or a causal claim about Lighthouse scores.

Exact 8119 historical full unit: 6330 pass / 1 Auth-lockfile subprocess timeout / 329 guarded skips; unchanged idle security target rerun 13/13 pass. Exact 8119 full browser: 324 pass / 6 fail / 162 guarded skips; legacy 13 pass / 6 fail / 0 skip. Those failures remain recorded. Lighthouse historical collector accidentally mixed 10 prior reports; corrected current-only fetchTime filter retains exactly 10 8119 reports and its actual three under-budget routes. Current collector now enforces that filter and route count without threshold changes.

999e full-gate attempt was stopped after lint rejected two raw local-anchor test mocks. Native Next Link replaced those mock links; no lint rule, timeout or assertion was weakened. Stopped/not-executed cases are not skips or passes. Fresh full/static/browser/original Lighthouse gates will be recorded separately after completion. Production e7fa4add remains unchanged; current Preview metadata is distinct from its runtime acceptance.

## 最新候選與歷史結果界線（99d5，Oct3香港時間）

以上各較早章節的pending／結果只描述當時版本；最新候選99d5、app/worker equivalent3bc。Native exact CI run37068469209：6346 pass／0 fail／329 genuine guarded skip；Workerd57 pass；六named checks及Vercel成功。Preview dpl_EHC8iFrft1EZr3u2efP3ffEVhdzP實際runtime17 pass／ledger56／providerSends0／paymentWrites0。正式21:39UTC只讀仍e7fa4add；無Oct1正式發布或新migration。

3bc完整browser331 pass／5 fail／162 guarded skips及actualAuth200557/4298保留；targeted6 pass和credential-free8 pass是另外的run。99d5僅修test準備條件，exact99單次full browser5000ms pacing仍執行中。3bc legacy19、Concierge5、originalLab10 routes pass；current lab最低.91/.96/1。Google/mail/provider/cloud/SOP/policy/RUM門檻未簽。各source、命令、skip與scope以最新receipt為準，不把舊full local6345或targeted pass冒充exact99單次full結果。
