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
