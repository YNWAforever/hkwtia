# Verification ledger

## T01 / O01 / U07 U08

**Code fixed; local isolated acceptance passed. Production unchanged.**

- `npm.cmd exec -- vitest run tests/unit/audit-full-translations.test.ts`: original implementation produced 6 behavior failures (readable title, corrupt/replacement/empty labels, placeholder detection, key/token parity). The failure was `????` or a successful audit exit where rejection was required, not an import error.
- An additional empty-bundle mutation returned exit 0 before the guard; it now returns `EMPTY_BUNDLE`. Hostile samples remain in the checked-in test and are checked through the real CLI.
- Focused final translation suite: 8 passed, 0 skipped. Existing message suite: 9 passed; its pre-existing plural fixture emitted missing-`year` formatting diagnostics. This does not verify every historical ICU rendering; T01 verifies all 33 segment values and token parity directly.
- `npm.cmd run audit:strings`: pass; same command now checks JSON key/token parity and value corruption, replacement characters, empty labels and empty discovery, alongside TSX literals. Whole valid HTTP(S) URLs may contain query punctuation; UI labels are not exempt.
- `node --env-file=.env.local .playwright/t01-browser.mjs`: actual Chromium, synthetic password sign-in, real isolated Auth/DB; `/zh/admin/segments` and `/admin/segments` 200, readable titles, no corrupt placeholders, no page errors. Locale cookies were explicitly selected after the first attempt followed the previously selected Chinese locale. Screenshots are in `evidence/t01/`.
- English existing meanings/keys retained; only 33 corrupted Traditional Chinese values changed. English bundle additions belong to T02.
- `npm.cmd run typecheck`: pass. Focused ESLint: pass. Final full lint/build/candidate suite and Preview verification remain pending.

Passwords, cookies, tokenized URLs and original personal audit screenshots were not copied to these receipts.

## T02 / O02 / U26 (U57 release prerequisites remain pending)

**Code fixed; local isolated acceptance passed. Production flags unchanged.**

- `npm.cmd exec -- vitest run tests/unit/audit-full-batch-capabilities.test.tsx`: 5 target behavior failures / 3 pass before implementation: useless checkbox toolbar, partial rollout, grant role and forged-member capability boundary.
- `npm.cmd exec -- vitest run tests/unit/audit-full-batch-capabilities.test.tsx tests/unit/admin-batch-service.test.ts tests/unit/member-bulk-table.test.tsx`: 19 pass / 0 skip.
- Shared server capability resolver preserves all eight registered operations, existing per-operation flags and superadmin-only grants. UI receives only enabled operation names. Server action independently loads its actor and calls the same preparation guard; no client capability set is accepted. Existing server-only test injection remains a test port.
- `node --env-file=.env.local .playwright/t02-browser.mjs`: real Chromium + isolated Auth/DB. Disabled state: no table checkboxes, explanation, history HTTP 200. Partial state: correction available, export unavailable with explanation. Authenticated member: privileged list absent, redirected to `/zh/admin-login`. Only ignored local flags changed and were restored in `finally`.
- Typecheck, focused ESLint and strings gate passed. Full candidate suite/build, Preview and app/worker activation order remain pending.

## Known external verification boundaries

- Existing worker's secret APP_URL target and source SHA are unavailable in readback. A dedicated isolated tagged worker is required for T11; do not invoke the existing deployed worker to guess.
- Existing isolated Auth enables localhost and has shared Google configured. Synthetic password identities work. Google and magic-link provider callbacks remain unverified until an approved test identity/recipient completes them.
- New Production remediation publication/flags are not authorized by the earlier 79-logo release approval.
T02 follow-up: viewport captures now scroll to the disabled explanation or correction controls, rather than showing the common filters above them. Both real-browser states were rerun and their image hashes differ. Full lint: 0 errors / 67 existing warnings.

T02 candidate gates at `86dab20e`: build passed (267 static pages); full suite returned 6116 pass / 172 skip / 3 failures in two existing positive member-selection tests. Those fixtures did not enable the newly explicit operation capability. The fixtures now explicitly enable the authorized profile operation; focused rerun passed 17 / 0 skip. A fresh full candidate suite is still required. No production behavior was weakened to accommodate a test.

## T03 / O10 / U35 (U36 campaign review remains T07)

**Code fixed; real local isolated SQL/browser acceptance passed. Preview and Production unchanged.**

- Original focused regression: 3 target behavior failures (navigation/range, bound cursor, stale filter) / 1 pass. Further boundary test rejected a valid 500-character repository cursor after wrapping; only the page/service envelope was widened to 1200, retaining the repository limit.
- Final focused command: `npm.cmd exec -- vitest run tests/unit/audit-full-segment-pagination.test.tsx tests/unit/segment-pagination-context.test.ts tests/unit/segment-event-navigation.test.tsx tests/unit/segment-query.test.ts tests/unit/segment-schema.test.ts tests/unit/segment-filter-version.test.ts`: 51 pass / 0 skip. The real server page retains the selected 21st upcoming event, exact profile scope, campaign draft and page size in its GET form.
- `node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/unit/segment-pagination-context.test.ts tests/integration/audit-full-segment-pagination.test.ts`: 7 pass / 0 skip. Only the database transport port uses pg/Drizzle; actual production repository SQL executes against the confirmed isolated Neon database. 51/101 rows traverse 50+1 and 50+50+1 without duplicates/omissions, totals and reverse page cursors match, changed audiences restart. No fixture/production writes occur in this test.
- `PLAYWRIGHT_BASE_URL=http://localhost:3450 node --env-file=.env.local node_modules/@playwright/test/cli.js test tests/e2e/full-segment-pagination.spec.ts --reporter=line` (PowerShell environment assignment): 2 pass / 0 skip, real Chromium + synthetic password Auth. Chinese 101 and English 51 rows, previous round trip, filter reset and draft/limit retention. Receipts/screenshots: `evidence/t03`. Initial browser harness waits/English label mismatch were corrected; only the rerun is counted as pass. Traces and videos disabled; email cells masked.
- Full-filter URL round trip, malformed/stale history rejection and query failure versus empty success are covered. History is bounded to 10 prior positions with a first-page link. Relative membership policy, contact/member filter safety and raw repository cursor validation retained. Campaign sendable/blocked counts and retirement of legacy Queue remain T07; preview total does not establish messaging eligibility.
- Focused lint and strings passed. The final check found a test-only namespace typing error; its focused correction was followed by a fresh successful typecheck. Full candidate suite/build must be rerun after subsequent slices.

## T04 / O08 recovery slice / U46 (U48 and server drafts remain T17)

**Code fixed; real local isolated browser recovery passed. Nothing published to Production.**

- Original real Chromium baseline: client navigation into Home, synthetic unsaved edit, native Back/Forward without submitting; edit lost. Masked receipt: `evidence/t04/history-before.json`. Initial form regression returned 5 target failures / 1 pass (restore, unavailable storage, conflict comparison, discard, failed-save recovery).
- Additional behavior failures caught React form reset clearing edits entered during a pending publish, and a draft expiring while the restore choice was open. Both now pass. Controlled copy inputs retain later edits with the returned server revision. Existing server action/CAS authorization is preserved.
- Final focused command: `npm.cmd exec -- vitest run tests/unit/audit-full-cms-draft.test.tsx tests/unit/page-copy-local-draft-boundary.test.ts tests/unit/admin-cms-dirty-forms.test.tsx tests/unit/page-copy-action-state.test.ts tests/unit/admin-unsaved-changes-guard.test.tsx`: 29 pass / 0 skip. Temporarily removing the TTL check produced the expected hostile/expired-draft failure; code was restored and its 3 boundary tests passed. Read/write/remove denial, future/expired timestamps, wrong namespace/version/revision and non-allowlisted fields are tested.
- `PLAYWRIGHT_BASE_URL=http://localhost:3450 node --env-file=.env.local node_modules/@playwright/test/cli.js test tests/e2e/full-cms-history.spec.ts --reporter=line` (PowerShell env assignment): 4 pass / 0 skip. Exact U46 hero.title fields in both languages; native Back/Forward; full reload followed by explicit restore; Chinese desktop 1440 and English mobile 390 screenshots; denied storage with truthful warning; real synthetic logout then a different authorized synthetic staff identity does not see the prior draft. No copy was submitted by these browser cases; receipts in `evidence/t04`.
- Next may retain a Client Component in memory on history traversal. The test accepts retained edits, then removes that path with a full reload to prove explicit session-storage recovery. The implementation does not claim it can intercept every history navigation.
- Session drafts contain only server-allowlisted copy fields, are partitioned by authenticated profile/namespace, expire at 24 hours and preserve their base revision. Stale published revisions offer escaped comparison, with no automatic overwrite. Successful publish/discard clears the local draft; provider/transaction publishing acceptance and cross-device server drafts are T17, not proven by unit action doubles.
- The implementation uses React useSyncExternalStore for storage and keeps server-rendered recovery state empty until hydration. Focused lint, typecheck and strings passed. Final repository/Preview gates remain pending. Existing escaped-preview test now scopes its assertion to the preview region because controlled textareas also contain the escaped text.

T01–T04 candidate at `63d28428`: full lint passed with 0 errors / 67 existing warnings. Full suite returned 6138 pass / 175 skip / 1 failure: `campaign-server-action-boundary` required the retired parser variable spelling. Its replacement checks actual metadata exclusion and rejection of injected idempotency/actor fields; the existing action-module/server binding assertions remain. Focused rerun passed 8 / 0 skip. A fresh full suite and build are still pending.

## Frozen T01–T04 repository gates at c54e1828

- `npm.cmd test`: exit 0, 724 files pass / 67 skip, 6140 tests pass / 175 skip, 340.43s. Exact skipped-file counts and source environment/opt-in guards are in `evidence/gates/t01-t04-skips.json`. Skips are unexecuted here; separately executed isolated SQL is counted separately.
- `npm.cmd run lint`: exit 0, 0 errors / 67 existing warnings. `npm.cmd run typecheck` and `npm.cmd run audit:strings`: exit 0.
- `npm.cmd run build`: exit 0, installed Next 16.3.6, compiled successfully, TypeScript completed, 267 static pages. Existing Edge/Browserslist notices retained; no framework/dependency upgrade.
- `RUN_POSTGRES_INTEGRATION=1 npm.cmd exec -- vitest run tests/integration/page-copy-edit-concurrency-postgres.test.ts` (PowerShell env assignment): 1 pass / 0 skip, real disposable PostgreSQL 16, preserved namespace lock/CAS and audit transaction. Docker Engine 29.7.2 is available with cached postgres:16-alpine. This is existing published-copy concurrency, not T17 server draft/publish acceptance.
- Code candidate SHA `c54e18280f3ed3532355031723545f114106748b`; subsequent evidence-only commit is source equivalent. Preview/provider/worker and T05–T23 remain pending. No Production migration, deployment, payment, refund or member message occurred.

## T05 existing identity protections (partial, provider gate remains)

The existing provision repository was retained: actual isolated SQL verifies unique identity creation, concurrent same-email serialization, no membership activation and no privileged email merge. Six focused files / 44 tests passed / 0 skips / 0 failures. Exact command and masked receipt: `evidence/t05/identity.json`. PostgreSQL transport alone is supplied; the production repository executes the queries. This does not prove OAuth or magic-link callback, delivery, expiry or reuse. No provider bug is inferred from the historical passkey interruption. U02–U06 remain open for the provider-specific journeys. No Auth identity or Production row was created.

## T06 / O03 finite grant and legacy retirement slice

**Code fixed; isolated grant boundaries verified. Payment repair U23 remains T08. Production unchanged.**

The stale comp service/action/core now refuse writes, authenticate their own actor, and show localized retirement on Member360. Historic NULL/NULL grants remain byte-identical in real PostgreSQL acceptance. Staff/ExCo cannot create finite grants; their swallowed authorization denial was reproduced and repaired. The current finite grant repository retains superadmin, feature flag, target, plan, seat and time guards. Single grant retries reuse the existing transactional immutable audit with an actor-scoped request key and canonical payload digest: two concurrent requests produce one grant/audit, changed payload conflicts, expiry replay does not reactivate. Batch ledger/handler remains the existing architecture. No schema migration required.

Focused actual PG16/focused run: 35 pass / 0 skip. HTTP/actor guard run: 107 pass / 0 skip. Real isolated Chromium: 3 pass / 0 skip (staff/ExCo retirement; synthetic superadmin finite grant, verified DB actor/audit, no Stripe reference). The new test initially had a TypeScript assertion annotation error; corrected using an explicitly typed authorization function. Only fresh subsequent typecheck/build success counts. Full suite after behavior corrections: 6147 pass / 180 skip / 0 fail, 726 pass files / 69 skip files; skips remain environment-gated and not acceptance passes. Full lint: 0 errors / 67 existing warnings. Commands and masked receipts: evidence/t06/grant.json.

U22 grant entry/expiry boundary passed; U24 manual grant endpoint and role UI passed, whole-site roles remain T18/T22. U25 SQL parallel retry passed; two real browser windows remain T22. U23 paid activation reconciliation is not implemented by a complimentary grant and remains T08. Preview acceptance and Production release are pending.

T06 fresh final gates: explicitly typed test actor authorization corrected; typecheck exit 0, HTTP test 8/0/0, strings exit 0 (297 TSX), build exit 0 (267 static pages). These successful runs supersede the earlier test-only TS2775/TS2459 failures.

## T07 / O11 / U36 U37 U38 reviewed marketing entry

**Code fixed; actual isolated SQL and browser review boundaries passed. Provider sends and deployed worker remain unverified.**

Saved segment links carry the exact segment and validated draft UUID into the existing wizard. GET through every step writes zero rows. Only final POST creates a draft/snapshot; the legacy service/action and direct repository queued create cannot bypass review. The author cannot approve. The immutable approval audit records a digest covering campaign content, recipient identity/contact/locale/variables snapshot, registered WhatsApp content and the email catalog/render contract. Reviewer submits the version seen. Changed content/audience/template invalidates approval, queue, schedule, promotion and claims. Delivery status/attempt counters are excluded so sending the first recipient does not revoke approval of the remainder. Audience insert takes the campaign row lock and is draft-only. Claims materialize eligible campaign IDs so the digest is evaluated per campaign, not per recipient. No new schema/approval ledger.

Original intended SQL red cases: 4 failures; subsequent worker/audience red cases: 4; registered-template version red: 1. Final real isolated SQL: 13 pass / 0 skip. Existing contacts/both behavior was retained: contact source/stage cannot match a member record, and fails closed; initial test expectation was corrected after reading this explicit historical policy, no code widening. Send-time actual SQL facts verify STOP from contacts and suppression store even while the member opt-in flag remains true. Existing delivery/actor focused run: 156 pass / 0 skip; review/wizard initial focused: 71 pass; final content/runner subset: 81 pass. Exact commands: evidence/t07/campaign.json. These unit doubles are not provider acceptance.

Final actual Chromium: 2 pass / 0 skip, 43.9s; Chinese desktop and English 390px, keyboard entry and approval, GET row counts, unique draft/snapshot, author refusal, stale rejection with no review stamp, different synthetic ExCo successful approval and exact version audit. Screenshot inspection caught the stale warning remaining after success; behavior red then correction and browser rerun confirm it clears. Traces/videos off. No provider message dispatched.

### T07 path mapping and release gate

Proposed unit entry file is mapped to stronger actual-SQL tests/integration/audit-full-campaign-entry.test.ts plus existing action/wizard/resource tests. Existing createCampaignDraft, campaigns repository, immutable audit_events, campaign review actions and recipient delivery repository are reused. The shared email template map was moved into lib/admin/campaign-email-templates.ts without changing mapping or sender behavior. Independent transactional outboxes remain independent.

New worker claim logic intentionally holds historical queued/scheduled campaigns lacking a current versioned approval; do not fabricate receipts or re-send historical effects. Before Production activation, inventory pending rows read-only, reconcile accepted/uncertain deliveries, and have a different authorized administrator review the current content/audience. Keep campaign sends paused during app/worker overlap. Rollback preserves the stronger worker guard and pauses campaigns; reverting to an old writer is not permission to restore the retired Queue. Production migration: none for this slice. App source deployed to Preview is not worker release or live-send authorization. U36 is isolated pass; U37 review/claim SQL and UI pass, actual worker/provider still pending; U38 STOP facts and contacts/both SQL pass, real provider journey pending.

## T07 fresh repository gates

- `npm.cmd test`: exit 0, 6149 pass / 193 skip / 0 fail; 726 pass files / 70 skip files, 366.59s. Exact skipped-file counts and source guards are recorded in `evidence/gates/t07-skips.json`; actual isolated SQL and Chromium counts above remain separate.
- `npm.cmd run lint`: exit 0, 0 errors / 67 existing warnings. `npm.cmd run typecheck` and `npm.cmd run audit:strings`: exit 0, strings scanned 297 TSX files.
- Fresh `npm.cmd run typecheck` followed by `npm.cmd run build`: both exit 0; installed Next 16.3.6, 267 static pages. No migration, provider send or Production release in this slice.
- Corrected T06 command receipt to the exact filenames and commands in the saved successful focused logs; no test count or result changed.
