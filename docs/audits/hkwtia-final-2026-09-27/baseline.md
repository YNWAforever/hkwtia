# Final audit baseline — Task 0

Observed 2026-09-28 Asia/Hong_Kong. Fresh worktree `codex/final-login-admin-20260928` starts at `fe22b49ed9828dd0cfad536273df5960ed90ca66`, which is also current `origin/main` and the merge commit of PR #94. `git merge-base --is-ancestor` returned 0; `git diff fe22b49e..HEAD` was empty before edits. The root checkout remains on older 6d3e0d72 with unrelated modifications and was not changed. The previous F01–F25 implementation is already merged; this ledger tracks only A01–A14 of the supplied final audit.

The supplied audit and plan were read in full. Their actual names and SHA256 digests are in `evidence/source-checksums.json`; source snapshots are historical selections. Current AGENTS.md has no nested AGENTS.md under tracked paths.

## Finding ledger

Status vocabulary: `reproduced`, `fixed-since-audit`, `implemented`, `verified`, `blocked`. Each row is evaluated at merge SHA fe22b49e. `LIVE` refers only to public GET/browser observations, `CODE` to source, and `DB` to read-only Neon metadata/SQL. No Google login, message delivery or authenticated admin session was exercised at baseline.

| Finding | Status | Source | Evidence at fe22b49e | Next action |
|---|---|---|---|---|
| A01 | reproduced | LIVE/CODE | Home link display:none at 1366 and 390px; header CSS is still in merged SHA. | Task 2: visible keyboard-reachable login at all specified widths. |
| A02 | reproduced | LIVE/CODE | Anonymous /zh/admin returned HTTP 404. | Task 2: public admin-login with safe deep-link return; preserve protected data checks. |
| A03 | reproduced | LIVE/CODE | Public login has magic link only; production Neon Auth lists Google shared provider, but browser callback is unverified. | Task 3: SDK-backed Google control and isolated provider acceptance. |
| A04 | reproduced | LIVE/CODE | Existing login UI lacks full pending, resend, change-email and used/expired-link recovery. | Task 3: stateful bilingual form; separate send from delivery evidence. |
| A05 | reproduced | CODE | Auth send/credential limiter uses process-local counters across direct action and API entrances. | Task 4: one atomic shared namespace with outage behavior. |
| A06 | reproduced | CODE | Session maps by Auth subject; a valid session without app profile resolves null. | Task 3: least-privilege profile recovery without email-based role promotion. |
| A07 | reproduced | CODE/DESIGN | AdminNav is grouped top-dropdown navigation without account controls. | Task 5: authorized sidebar, topbar, account/logout and mobile focus. |
| A08 | reproduced | LIVE/CODE/DB | /zh/members shows unavailable. Production Neon project ledger stops at 0036 and memberships lacks grant columns referenced by directory SQL; exact column query fails. App-to-Neon binding not independently exposed by connector. Published profile count on inspected branch is zero. | Task 1: add correlated safe error and retry; test old/full schema; migrate only after authorized target preflight. |
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
