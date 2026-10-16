# First-result follow-up verification — 2026-10-16

Base: `30837e8112a60961d0f642da6f466dcbfaadb626` (merged PR #192).
Branch: `codex/first-result-followup-20261016`.

## Change

- Show the existing company display name when resuming company setup, including when it equals the legal name. Preserve custom names and the existing blank-name fallback.
- Dashboard recommendations request `excludeSelf`; SQL excludes the actor before ordering/limiting. Normal directory browsing remains unchanged. Cursor scope distinguishes recommendation mode. Existing membership eligibility and personal/company directory consent predicates remain in place.
- Stabilize an existing form-focus test by waiting for its passive focus effect. The original test failed during the first full run but passed alone; no production form behavior changed.

## This run's evidence

Local runner removes inherited service credentials. Unit/build checks do not inherit `DATABASE_URL`. PostgreSQL integration uses a disposable Docker PostgreSQL 16 fixture, whose container was confirmed removed afterwards.

- RED: 5 expected regression failures / 43 passes before the product fix (company visibility in both locales, SQL exclusion, cursor scope, dashboard request).
- Focused GREEN: 82 passed across company setup, paging, dashboard, join actions and recovery.
- PostgreSQL: 6 passed, including 100/1,000/10,000-row pagination, self with multiple company rows, both consent predicates and pending-payment/pending-review exclusion.
- Visible strings: 354 TSX files passed.
- Lint: zero errors; 77 pre-existing warnings.
- Initial full suite: 7,673 passed, 630 skipped, one focus-timing failure.
- Final full suite: 7,674 passed, 630 skipped; 874 files passed, 111 skipped (03:02:43–03:08:11 UTC). Skips are not acceptance evidence.
- TypeScript: `tsc --noEmit` passed.
- Final lint: zero errors, 77 warnings (03:09:46 UTC).
- Production build: `next build --webpack` passed (03:10:26 UTC), including compilation, TypeScript and page generation. No deployment was performed. Next's generated `next-env.d.ts` production-path rewrite was restored to the tracked dev-path baseline afterwards.

Reproduction: `npm test`; `npm run lint`; `npm run typecheck`; `npm run build`; `npm run audit:strings`. With Docker available and no database credentials inherited, run `RUN_POSTGRES_INTEGRATION=1 npx vitest run tests/integration/portal-directory-pagination.test.ts --maxWorkers=1` (set the environment variable using the host shell's syntax).

## Browser evidence and limits

Tested local edited code against the independently verified, non-primary isolated Neon branch `br-super-dawn-ao919x4j` in project `fragrant-mountain-25240574`. Its original expiry is `2026-10-16T03:09:23Z`; it was not extended. The harness pins database/auth hosts and expiry, uses only the explicit test URL, excludes payment/email-provider credentials, and disables workers.

Existing synthetic, already email-verified community accounts completed the English and Chinese resume-profile → completion → dashboard → event → RSVP flow. An identical registration POST was replayed; after reload the UI showed registered and the database contained exactly one registered row per account. The unique synthetic event and cascading registrations were deleted afterwards; audit history was retained. This verifies resumed setup, not fresh signup or real email verification.

Company setup was visually checked at mobile width: the existing display name stays visible and unchanged while the legal name is edited without submission. The pending-payment account displayed the payment recovery heading and billing action, with no event cards.

Admin attendee-list browser acceptance remains blocked: the existing M2 staff Auth account is not email-verified; the other inspected staff fixture identities were absent. No credentials, verification flags or roles were created/changed. Pending-review browser acceptance was not run; its directory eligibility is covered by the PostgreSQL test. No Stripe payment or real email delivery was tested.

Raw local receipts, logs and screenshots are in the sibling task `evidence/` directory; they are not production acceptance or remote CI results. The first browser receipt reports FAIL because the later admin login assertion failed, despite both preceding member journeys passing. A subsequent receipt confirms company visibility and the explicit pending-payment recovery assertions.

No push, merge or deployment was performed. Existing worktrees and their changes were preserved.
