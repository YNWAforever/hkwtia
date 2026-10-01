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
