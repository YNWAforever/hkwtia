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
