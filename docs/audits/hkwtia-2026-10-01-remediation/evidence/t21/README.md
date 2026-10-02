# T21: performance, public cache and first paint

Application/query commits:2888c483 (guarded measurements/cache harness), b0f3d30a (current CMS harness),55c2d036 (minimal Home fix). Full-schema repository snapshots reused current T13 implementation; public locale cache reused T17. No new index, region, Auth-layout cache or policy.

## Actual executions

- `node --conditions=react-server --import tsx scripts/audit-remediation-performance.ts --target=disposable --baseline`: complete owned PG16 ledger56;50/500/5000,1 new physical connection then30 warm per operation; old50-row paging algorithm reproduced against current repository, not old source checkout. Actual quantities/unique IDs/scope/plans and exact file hashes in disposable-performance.json. Own fixture cleanup verified.
- `node --env-file=.env.local --conditions=react-server --import tsx scripts/audit-remediation-performance.ts --target=neon`: exact confirmed isolated branch/sentinel1/ledger56; same scales and independent cold+30warm; cleanup verified. Windows geographic vantage unknown; DB region ap-southeast-1 does not prove HK/SG dual vantage.
- Focused9target guards+9actual CMS SQL+2actual migration recovery=20pass. New cache-test path maps to existing `tests/integration/audit-full-cms-workspace.test.ts`; getDb injection only, actual repository/SQL. Latest whole Oct1 SQL suite belongs toT22.
- `AUDIT_SOURCE_SHA=(git rev-parse HEAD) node --env-file=.env.local .playwright/t21-browser.mjs`:2built Chromium,28.1s, actual password Auth/DB/CMS publish/cache/readback. Real public data across member/company-admin/guest, private draft no-store and foreign/anonymous denial, immediate explicit publish/revert invalidation. Original Privacy rows restored; immutable history kept. Cache browser receipt b0f3d30a.
- `AUDIT_SOURCE_SHA=(git rev-parse HEAD) node --env-file=.env.local .playwright/t21-paint.mjs`:5built Chromium,13.4s. Actual isolated events table lock demonstrates discovery anchor during slow read and replacement after rollback; hero eager/high both languages;2actual CDP150ms/1.6Mbps/4xCPU390px CLS samples0. Not RUM.
-68related Home/guard/provenance regressions pass0skip/0fail. Lint/typecheck/strings/build exit0;267pages,308TSX,67 existing lint warnings. Final full aggregate and source hashes belong toT22.
- `.playwright/t21-http-timing.mjs`: four safe no-parameter routes,31separate curl processes/route, whitelisted DNS/TCP/TLS/TTFB/body/total/status only. Actual anonymous existing Production and owned loopback receipts are separate. No cookies, mutation, provider or DB-speed attribution.

## REDs and harness failures

Corrected unit RED names the failed-read/false-empty behavior (1failed1passed); prior missingIntl and returned-mock teardown were invalid harness failures. Actual built RED2cases missing hero fetchpriority; actual isolated DB-delay RED missing busy discovery anchor. Minimal source fix only after these failures; original successful-empty and published-event behavior retained. Existing old tests asserted deprecated priority and false-empty behavior; updated to current eager/high and recovery invariants, not removed.

Matrix duplicatecommit misunderstanding belongs toT22 and never changed the engine. Cache harness selected metaTitle instead oftitle and assumed generic Privacy full-page preview; it now uses actual private editor/no-store (Home actual layout/noindex remainsT17). An interrupted exact owned Privacy draft was explicitly restored/published without deleting history; original public rows deepEqual readback in interrupted-fixture-retired.json.

Lighthouse default failed Lantern graph/Windows cleanup. Supplementary DevTools first run redirected English to Chinese through browser preference; before receipt explicitly marksEnglish unverified. Corrected fresh browser/enAccept-Language produced10actual bilingual reports but assertion failed and canonical target was unset (defaultlocalhost3000 vs actual3450). `.mjs` LHCI config extension was unsupported, a harness failure; `.js` ESM is supported. Actual corrected canonical/default-mode rerun is recorded separately when complete; no lowered threshold or public raw-report upload.

## Limits / release gates

SQL p95 does not prove whole HTTP preview/CAS/materialization latency. Single Lighthouse samples and laboratory CLS cannot establish RUM p75. HK/SG independent network vantage, actual cloud worker/two scheduled windows, approved provider recipients and business policies, Preview runtime target, release approval/readback and humanSOP remain independent. Current Home fix is code/isolated verification only; no Production release/enablement.

## Final source delta27832bdc

Actual full55c2d036:6293pass328skip2fail. New runtime copy accidentally widened CMS166→169; added3rejection REDs and central read/save scope guard, preserving166and rejecting forged runtime-state overrides. LockfileAuth subprocess timeout was environmental; separate13security checks passed without timeout changes. Actual /events hero DOM RED inbothlocales lackedhigh; shared PageHero now preserves `priority=false` as lazy and marks default eager/high.83focused/regression0skip/0fail;7built browser0skip/0fail12.8s withscreenshots. Type/build0 at equivalent27832bdc and explicit local public canonical3450; final aggregateT22 running. Corrected default simulated10LHRs:SEO1/CLS0all, performance gate stillfailed3routes; no threshold relaxation. Final check after shared-hero delta is separate; RUM stillpending.
