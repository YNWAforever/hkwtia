# Final audit baseline — Task 0

Observed 2026-09-28 Asia/Hong_Kong. Fresh worktree `codex/final-login-admin-20260928` starts at `fe22b49ed9828dd0cfad536273df5960ed90ca66`, which is also current `origin/main` and the merge commit of PR #94. `git merge-base --is-ancestor` returned 0; `git diff fe22b49e..HEAD` was empty before edits. The root checkout remains on older 6d3e0d72 with unrelated modifications and was not changed. The previous F01–F25 implementation is already merged; this ledger tracks only A01–A14 of the supplied final audit.

The supplied audit and plan were read in full. Their actual names and SHA256 digests are in `evidence/source-checksums.json`; source snapshots are historical selections. Current AGENTS.md has no nested AGENTS.md under tracked paths.

## Finding ledger

Status vocabulary: `reproduced`, `fixed-since-audit`, `implemented`, `verified`, `blocked`. Each row is evaluated at merge SHA fe22b49e. `LIVE` refers only to public GET/browser observations, `CODE` to source, and `DB` to read-only Neon metadata/SQL. No Google login, message delivery or authenticated admin session was exercised at baseline.

| Finding | Status | Source | Evidence at fe22b49e | Next action |
|---|---|---|---|---|
| A01 | verified | LOCAL/CODE | At fe22b49e the header link was hidden at 1366 and 390px. Source commit f87dcd52 keeps it visible; local Chromium passed keyboard/size cases at 390, 768, 1024, 1280, 1366, 1440 and 1920px in en and zh-HK (14/14). | Verify the same widths on a deployed Preview before release. |
| A02 | implemented | LOCAL/CODE | Source commit f87dcd52 adds public staff entry, explicit allowlist and denial state. Anonymous /zh/admin/members?q=Acme&status=active reached /zh/admin-login with the validated target on local Chromium using the isolated Neon test auth branch. Unit guard, route and destination tests passed. | Verify staff/member/revoked-role browser flows with synthetic identities and Preview before marking verified. |
| A03 | implemented | LOCAL/CODE | Shared bilingual login form calls the installed Neon SDK social method with a validated locale/intent callback. `AUTH_GOOGLE_ENABLED` defaults off. Isolated branch lists Google shared provider, but its trusted origins omit localhost and no OAuth callback or account-link receipt exists. | Configure isolated callback/trusted origin; prove provider round trip on Preview before enabling the flag. |
| A04 | implemented | LOCAL/CODE | Shared form has pending lock, sent state, masked recipient kept in session storage, change-email, resend wait and generic provider-error recovery. Server rate-limit refusal supplies `wait` seconds. Source/UI tests passed; delivery and cross-device/expired-link provider cases remain unverified. | Run isolated provider and browser acceptance; record a real test inbox receipt separately from sent UI. |
| A05 | implemented | LOCAL/PG16 | Added additive 0051 constraints and the existing atomic bucket repository now owns auth send IP/email and credential scopes. Disposable PostgreSQL verifies action/route sharing, concurrent 3/15m, 10/1h, 20/5m, stable retry timing and store-failure 503. Production ledger is still 0036 on the inspected branch; no live send was made. | Preflight and authorize compatible schema rollout, then Preview/provider verification. |
| A06 | implemented | LOCAL/PG16 | Server resolution distinguishes signed-out, missing profile, forbidden and unavailable. Verified-session action creates only a member profile, serializes same-email subjects, returns conflict without linking or promoting, then sends the new member to existing Join. Unit and disposable PG tests passed; provider callback remains unverified. | Test with isolated verified Auth identities and complete Join/renewal browser journey. |
| A07 | verified | LOCAL/CHROMIUM/PG | The admin shell now has grouped sidebar, topbar, member search entry, account/role/sign-out and mobile drawer; all 22 prior destinations remain. Synthetic staff, superadmin, member-denial and role-removal cases passed on the isolated Neon branch. | Verify the same shell on a deployed Preview before release; no production admin session was changed. |
| A08 | implemented | LIVE/CODE/DB | At fe22b49e, /zh/members shows unavailable; inspected production Neon ledger stops at 0036 and the grant columns are absent. At the current branch, safe error correlation and a localized retry are implemented; disposable PostgreSQL reproduces SQLSTATE 42703 and verifies the existing 0048 migration restores the query. Live recovery is unverified. | Confirm Vercel-to-Neon binding, then execute reviewed 0037–0050 migration sequence under separate production authorization; verify live page and logs. |
| A09 | blocked | CODE/DB | Inspected production Neon project lacks batch/checkout recovery/import tables and ledger stops at 0036; worker revision and active flag values not available. | Task 6/8: exact deployment matrix and isolated rollout rehearsal. |
| A10 | reproduced | CODE | Detail /admin/batches/[id] exists; recoverable /admin/batches index is absent. | Task 6: actor-scoped history and recent jobs. |
| A11 | reproduced | LIVE/DESIGN | Homepage contains internal planning copy and multiple unavailable-content panels. | Task 8: verified visitor-facing claims and one clear next action. |
| A12 | reproduced | CODE | Dashboard queueCounts loads lists to count; source shows repeated list reads. | Task 7: authorized aggregates, each tile unknown on failure. |
| A13 | reproduced | CODE/VERIFY | Session/profile/last-login reads may repeat; live latency/overhead unmeasured. | Task 7: measure, request-scope dedupe and conditional write. |
| A14 | reproduced | CODE/VERIFY | listPublished returns every published company; query-level page bound absent. | Task 7: stable cursor, fixed homepage sample and separate sitemap reader. |

## Public reproduction

`node .tmp/final-audit-baseline/capture.mjs` ran a new Chromium context for each GET against the production alias. The result and screenshot hashes are in `evidence/public-baseline.json`; selected current screenshots are in `evidence/*.png`. At 2026-09-27 16:52 UTC, `/zh` was HTTP 200 but `.signin-link` computed `display:none` at both 1366px and 390px; `/zh/admin` was HTTP 404; `/zh/member-login` was HTTP 200; `/zh/members` was HTTP 200 with the localized unavailable state. The directory error text was independently scrolled into view in `evidence/directory-unavailable.png`. Vercel `x-vercel-id` values are captured without cookies. No sign-in form was submitted.

The live alias `hkwtia.vercel.app` resolves in Vercel to READY deployment `dpl_EFqZ8W4W3ANKLMXoNHCQ9EdAT4tt` with Git SHA fe22b49e. Runtime error clusters did not expose a member-directory exception; a query for `grant_effective_at` logs over the recent hour found none. The page's current `.catch(() => null)` explains why the failed read can appear as HTTP 200 with an unavailable panel and no correlated server log.

## Database and deployment matrix at baseline

| Surface | Read-only fact | Boundary |
|---|---|---|
| Production web | READY alias at fe22b49e | Public browser GETs above. |
| Production Neon project `fragrant-mountain-25240574`, branch `production` | `drizzle.__drizzle_migrations` last id 36; no `memberships.grant_*` columns or grant constraint; direct zero-row SELECT of `grant_effective_at` returned `column does not exist`; checkout recovery, admin batch and import tables absent | Read-only inspection. The connector did not independently expose Vercel's database binding. Confirm host/project mapping before any rollout. |
| Directory content on inspected branch | Zero published profiles with a non-null slug | After schema compatibility, a successful empty directory must show honest empty copy; do not publish synthetic profiles in production. |
| Neon Auth on inspected production branch | Better Auth integration exists; provider listing includes `google` of type `shared` | Callback/trusted origin, browser login and account linking not verified. |
| Worker revision, feature flags, email/Google delivery | Unknown | No inference from web deployment or code defaults. |

The application journal has entries through 0050, so the inspected DB is missing **0037–0050**, not solely 0048. The 0048 timestamp caveat concerns a different state (a ledger past 0048 with missing grant columns); do not apply that repair assumption here. The first remediation is a controlled migration and binding preflight, not a production write from this task. The code may still need availability logging/retry and schema-compatibility tests.

## Baseline commands

- `git fetch origin main` and `git worktree add -b codex/final-login-admin-20260928 .worktrees/final-login-admin origin/main`: exit 0.
- `npm.cmd ci`: exit 0 on Windows/Node 24; package install reported 7 optional build scripts requiring review, not a failed install.
- `npx.cmd vitest run tests/unit/member-login-actions.test.ts tests/unit/member-login-page.test.tsx tests/unit/admin-page-auth.test.ts tests/unit/admin-nav.test.tsx tests/unit/company-profiles-repository.test.ts --maxWorkers=2 --reporter=json --outputFile=.tmp/final-audit-baseline/vitest.json`: 43 passed, 0 failed/skipped. These existing tests did not catch A01, A02 or A08.
- Read-only SQL on the inspected Neon branch: migration ledger query, information_schema grant columns, grant constraint, aggregate published count, `to_regclass` presence and the zero-row missing-column probe. No production row or schema was changed.

The task does not authorize live messages, payments/refunds, membership grants, destructive cleanup or production migration. Code, isolated tests and a rollout checklist can proceed while production activation remains gated.

## Task 1 directory evidence (branch after `c1fc7b8a`)

The page still treats a successful zero-row read as empty and a rejected read as unavailable. A rejected read now logs one JSON event with a generated request reference, an allowlisted SQL error category and a validated deployment SHA; the visitor sees only that reference and a locale-aware retry that preserves validated filters. No exception message, query string, member detail or raw database error enters the log event. The SQL query and membership grant predicate are unchanged.

- Red: `npx.cmd vitest run tests/unit/public-directory-availability.test.tsx --maxWorkers=2` failed at the absent retry link (1 failed, 1 passed), before implementation.
- Green: `npx.cmd vitest run tests/unit/public-directory-availability.test.tsx tests/unit/wt-pages/members-page.test.tsx tests/unit/company-profiles-repository.test.ts --maxWorkers=2` passed 34/34. The safe log test was then tightened to match Drizzle's observed `cause.code` wrapping and passed 2/2.
- Isolated DB: `$env:RUN_POSTGRES_INTEGRATION='1'; npx.cmd vitest run tests/integration/public-directory-availability-postgres.test.ts --maxWorkers=1` passed 1/1 against disposable local PostgreSQL 16. Its old schema reproduces `cause.code = 42703`; the test applies the exact statements of `drizzle/0048_membership_grants.sql`, sees a published synthetic company, excludes an unpublished one, and sees a true empty result after unpublishing. The first run failed because the test expected the SQLSTATE on the outer Drizzle error; the corrected assertion checks the cause.
- `npm.cmd run audit:strings` passed (287 TSX files); `npm.cmd run typecheck` passed.

The inspected production branch lacks migrations 0037–0050. The isolated minimal-schema test establishes the 0048 query compatibility boundary; it is not a rehearsal of the entire production migration sequence and does not prove the live alias uses the inspected Neon branch. No production schema or member row was changed.

## Task 2 entry evidence — `f87dcd52`

- Red browser: `$env:PLAYWRIGHT_PORT='3115'; npx.cmd playwright test tests/e2e/login-entry.spec.ts --grep '390px' --max-failures=1` found `header.site-header a[href="/member-login"]` but computed it hidden at 390px.
- Red unit: `tests/unit/login-destination.test.ts` failed preserving `/admin/inbox`; `tests/unit/login-entry-routing.test.ts` failed on missing anonymous redirect; `tests/unit/admin-login-guard.test.ts` failed because both authorization denials still returned 404; `tests/unit/admin-login-actions.test.ts` failed the valid staff callback; `tests/unit/admin-login-page.test.tsx` failed all four missing states.
- Green unit: combined focused 11-file Vitest run passed 74/74. `npm.cmd run typecheck` passed; `npm.cmd run audit:strings` passed over 289 TSX files. The exact files and test commands remain in the commit and terminal record.
- Browser: local Chromium passed 14/14 bilingual width and keyboard cases. The first anonymous staff-page case did not render because the local placeholder Neon Auth upstream at `localhost:3000` refused a session read; it was **not** counted as a pass. After selecting the existing ignored auth configuration and verifying its `NEON_PROJECT_ID` equals the isolated project `solitary-wave-52860119`, the same case passed 1/1. No email was sent and no authenticated provider callback was completed.

The anonymous redirect uses the current request path in `proxy.ts` only after the strict admin destination parser accepts it. Requests carrying a Neon session cookie continue to the server role guard, which routes denials to the public staff page; the staff page independently resolves the actor, displays member denial, and never substitutes a failed identity read with a signed-out form. Existing admin data/action guards remain in place.

## Task 3 auth experience evidence — branch after `f87dcd52`

- Test-first: login resolution stub returned signed-out for a valid provider subject and failed 4/5; the new page recovery tests failed 3/3 against the old form. The profile action stub failed 4/4 before implementation. The shared form stub failed 5/5 for masking, both methods, SDK callback and recovery.
- `npx.cmd vitest run tests/unit/login-resolution.test.ts tests/unit/login-resolution-server.test.ts tests/unit/login-profile-provision.test.ts --maxWorkers=1` passed 9/9 before page wiring. `npx.cmd vitest run tests/unit/member-login-page.test.tsx tests/unit/admin-login-page.test.tsx tests/unit/login-pages-resolution.test.tsx --maxWorkers=1 --reporter=dot` passed 14/14. The subsequent shared form/page group passed 19/19.
- `$env:RUN_POSTGRES_INTEGRATION='1'; npx.cmd vitest run tests/integration/login-profile-provision-postgres.test.ts --maxWorkers=1` passed 3/3 against disposable PostgreSQL 16. The first run failed because its minimal fixture omitted `consent_marketing` and other profile columns; the corrected fixture matches the current schema. Tests prove idempotency, no staff promotion, same-email different-subject conflict and concurrent same-email serialization. No production profile was created.
- The installed `@neondatabase/auth` 0.5.0-beta SDK documents `auth.signIn.social({provider: 'google', callbackURL})`; the source calls that method. The isolated Auth branch `br-lingering-unit-azxl75s5` has a shared Google provider and only the two named Preview trusted domains recorded in prior local read-only inspection, not localhost. There is no Google callback, email receipt, cross-device magic link, revocation-browser or account-link result yet. The Google control is disabled by default via `AUTH_GOOGLE_ENABLED=false`; this is a deployment readiness gate, not provider verification.

## Task 4 shared auth limiter evidence

- Red: `$env:RUN_POSTGRES_INTEGRATION='1'; npx.cmd vitest run tests/integration/auth-shared-rate-limit.test.ts --maxWorkers=1 --reporter=dot` showed the fourth same-address request allowed after resetting the process-local buckets.
- Green: the disposable PostgreSQL group `auth-shared-rate-limit.test.ts` plus existing `shared-rate-limit.test.ts` passed 5/5; the focused auth unit group (route, Join, member/admin actions and form) passed 69/69. `npm.cmd run audit:strings` passed over 290 TSX files. Typecheck passed immediately before the final retry-copy change and is rerun at handoff.
- Migration `0051_auth_rate_limits.sql` widens only the existing bucket table's scope and count constraints; it preserves the old five-attempt registration/ticket policies. Repository scopes are `auth-send-email` (3/15m), `auth-send-ip` (10/1h) and `auth-credential-ip` (20/5m). The route and direct actions call the same async limiter, with server-keyed digests; store/config failures refuse effects. The new server response distinguishes 429 with `retry-after` from retriable 503. No production migration was applied.

## Task 5 admin workspace evidence

The authenticated layout now renders a server-derived role and minimal display name into a responsive shell. The desktop sidebar keeps all 22 destinations present at the audit baseline and uses the longest route match; its collapse control sits in the header so it remains reachable in the dev server. The 390px drawer supports Escape, and the topbar provides a real member-list entry, site link and account sign-out. The account control does not promote anyone: every page and action retains its server guard. The shared sign-out button now treats an SDK error result as failure and keeps the session in place for retry.

- Red: `npx.cmd vitest run tests/unit/admin-app-shell.test.tsx --maxWorkers=2` failed 3/3 against the missing shell. A later provider-result case failed with no error alert before the sign-out correction; its green run passed 4/4. `tests/integration/login-profile-provision-postgres.test.ts` first failed at the missing `getDisplayName` method, then passed 3/3 after the server-only repository read was added.
- Green: `npx.cmd vitest run tests/unit/admin-app-shell.test.tsx tests/unit/admin-nav.test.tsx --maxWorkers=2` passed 7/7. `npm.cmd run typecheck`, scoped ESLint and `npm.cmd run audit:strings` (294 TSX files) passed after the final edits.
- Browser: against isolated Neon project `solitary-wave-52860119`, `npx.cmd playwright test tests/e2e/admin-shell.spec.ts --max-failures=1 --timeout=90000` passed the staff shell, active member route and member denial (3/3) after moving the collapse control away from the Next dev indicator. A subsequent `--grep 'zh-HK superadmin|member identity'` passed 2/2 after making the Chinese Members locator exact. `--grep 'removing a synthetic'` passed 1/1 after mapping the provider session subject to `profiles.auth_user_id`; the test updates only this isolated staff role and restores it in `finally`. A final `--grep 'staff can navigate'` passed 1/1 and generated the tracked screenshots. These are scoped runs, not a claim that an unrun combined suite passed.
- Screenshots: `evidence/admin-shell-desktop.png` SHA256 `d4b9fdda33724d44fee2408e911688812a68f604b65797be83a697f8df4bd1e7`; `evidence/admin-shell-mobile.png` SHA256 `3601aabf1be26c090069d0f67bd5331d4f80f627769908564e12965560c4c67c`. Both use synthetic staff data. The staff browser case ran axe and found no serious or critical violations.

No Preview deployment or production sign-in was used for this slice. Role revocation was tested with a full protected-page request; a separate in-flight action after revocation remains for release acceptance.
