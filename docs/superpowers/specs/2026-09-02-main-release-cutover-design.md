# Cutting `main` over to `release` — design

Date: 2026-09-02 · Status: approved, not implemented

## Problem

`release` is the confirmed Vercel production branch, `main` is preview-only, and the two have
diverged by 126 commits with nothing flowing the other way. The prior reconciliation
(`docs/superpowers/specs/2026-09-01-reconcile-main-release-design.md`) brought `release`'s two
fixes onto `main` and proved a throwaway merge would be conflict-free — but its own non-goals
section says so explicitly: "No cutover. The probe is local and discarded; `release` is never
advanced... merging `main` into `release` is the cutover itself, gated behind UAT and production
approval and explicitly out of scope here."

That gate has not been passed. `docs/integration/wisetech-delivery-gates.md` still lists Preview/UAT
and production approval as `NOT PASSED`, and no administrator has enabled required GitHub checks —
confirmed this session: `gh api repos/YNWAforever/hkwtia/branches/{main,release}/protection` both
return `404 Branch not protected`. Nothing on GitHub enforces review or CI before either branch
changes; any safety net here is procedural, not platform-enforced.

Two further facts, both confirmed empirically this session rather than assumed:

- **`release` deployments are Vercel's actual production target.** `get_project`/`list_deployments`
  on `prj_lT7YZDueA6kzhz2xrPPHFyNsDf8n` show every `release`-branch deployment tagged
  `target: "production"`; every `main`-branch deployment shows `target: null`. The current live
  production deployment is `release`@`9f5e51d` (PR #27) — it predates PR6's visual-alignment merge
  into `main`, and predates PR4/5's CMS code reaching `release` at all.
- **Production's database schema is already ahead of production's application code.** Earlier this
  session, migrations `0019`–`0024` (announcements, partners, media upload, localized news, event
  hero, and this session's `acceptance_sentinel` table) were applied directly to the production Neon
  database, at the repository owner's explicit direction, skipping the isolated-branch flow
  `docs/superpowers/specs/2026-09-01-isolated-test-infrastructure-design.md` was written for. The
  tables exist; the deployed application code that uses them does not yet.

A third, smaller gap: this session's own sentinel-guard code (`assertSeedSentinel`, its wiring into
`scripts/seed-m5.ts`, the `acceptance_sentinel` Drizzle table) lives only on the local,
never-pushed branch `feat/isolated-test-infrastructure` — seven commits ahead of `main`, which
doesn't include them. Confirmed via `git merge-base --is-ancestor HEAD main` (no) and
`git ls-remote origin refs/heads/feat/isolated-test-infrastructure` (empty).

## Goal

Close all three gaps in one deliberate sequence: merge this session's branch into `main`, then
merge the resulting `main` into `release`, which deploys production. Do this as an explicit,
owner-directed bypass of the formal gate sequence — not a claim that gates 2–4 are now passed.

**Non-goals.** No new database migration (already done). No change to the repository's untracked
scratch-file clutter. No attempt to retroactively mark delivery gates 2–4 `PASSED` — this design
documents a bypass, not a satisfaction, of that process.

## Design

### Part 1 — merge `feat/isolated-test-infrastructure` into `main`

1. Push the branch (never pushed before now).
2. Open a PR: base `main`, head `feat/isolated-test-infrastructure`. The PR body must state plainly
   that migration `0024` was already applied directly to production ahead of this code landing —
   code following the migration, not the reverse — and that Tasks 6, 8, 9, 10 and 11 of the original
   plan (provisioning an isolated Neon branch, test identities, Stripe test keys, planting a
   sentinel, running the acceptance suites) were deliberately not executed. Gate 2 stays
   `NOT PASSED` for that reason; this PR does not claim otherwise.
3. Wait for the `quality` CI job. It is advisory only (no branch protection enforces it) —
   waiting for it is a deliberate choice made here, not a platform requirement.
4. Get the owner's go-ahead, then merge (a regular merge commit, matching this repository's
   existing convention — not squash).
5. Confirm `main`'s new tip, locally and on `origin/main`.

### Part 2 — cut the updated `main` over to `release`

1. Fetch, confirm `main`'s new tip (post Part 1).
2. **Re-run the cutover probe** — `git checkout -B cutover-probe origin/release`,
   `git merge --no-ff --no-edit origin/main`. The last verified-clean probe
   (`docs/superpowers/specs/2026-09-01-reconcile-main-release-design.md`, Verification record) ran
   against an older `main` tip, before this session's seven commits existed. It must be re-proven,
   not assumed. A conflict here is a stop condition — resolve it as its own explicit step, the same
   discipline the prior reconciliation used; do not force it through.
3. If clean: discard the probe. Branch from `release` (e.g. `chore/release-cutover-2026-09-02`),
   merge `main` into it, push, open a PR: base `release`, head the cutover branch.
4. Wait for the `quality` CI job to pass on the real merge diff — this run checks actual content,
   not a rehearsal.
5. Get the owner's explicit go-ahead before merging. This is the step that deploys production.
6. Merge the PR into `release`. Vercel auto-deploys `release` pushes to production; no separate
   deploy step exists or is needed.
7. Verify: poll the Vercel deployment for the resulting commit until `READY`, confirm
   `target: "production"` and the commit SHA matches the merge, then fetch the production URL and
   confirm a 200 response before calling this done.

### Rollback

| Layer | Mechanism |
|---|---|
| Part 2 (production deploy) | `git revert <merge-sha>` on `release` and push — triggers a new Vercel deploy that reverts. Vercel also supports promoting a prior `READY` deployment (the current production deployment, `dpl_81cs7BmA...`, stays available) straight back to production from the dashboard for faster mitigation — a manual option for the owner to trigger, not something done automatically. |
| Part 1 (`main` merge) | Ordinary `git revert` on `main`. Nothing deploys from `main`, so this is low-stakes. |
| Database | Unaffected by either part of this cutover. The schema migration happened separately, earlier, is additive-only, and has no down-migration path in this repository — unchanged by this design. |

## Acceptance

- Part 1: PR merged into `main`; `quality` CI result recorded; `main`'s new tip confirmed on
  `origin/main`.
- Part 2: the re-run probe completes with no `CONFLICT` line; PR merged into `release`; `quality`
  CI result recorded; the resulting Vercel deployment reaches `READY` with `target: "production"`
  and the correct commit SHA; the production URL returns 200.
- A short evidence record captures both PR numbers and merge SHAs, the probe's clean-merge
  confirmation, both CI results, the production deployment ID, and the smoke-check result.
- `docs/integration/wisetech-delivery-gates.md` is updated to state factually that a production
  deployment occurred via owner-directed bypass of the formal gate sequence — not marking gates 2–4
  `PASSED`, but correcting its current "No production database, provider, deploy, migration, or
  seed action was performed" line, which this session has made false on two counts.

## Risks

| | |
|---|---|
| **No platform-enforced gate** | Neither branch has GitHub branch protection. Every safety measure here (waiting for CI, requiring a PR, requiring explicit go-ahead before each merge) is a process choice this design imposes on itself, not something GitHub or Vercel would refuse to bypass. A rushed execution could skip any of them without technical error. |
| **The probe can go stale again** | Task 2's probe proves the state at the moment it runs. If further commits land on either branch between the probe and the real PR merge, new divergence can appear undetected. Keep the gap between probe and merge short. |
| **Bypassing gates 2–4 is a real, not cosmetic, decision** | This design does not make Preview/UAT or production approval happen — it deploys anyway, at the owner's explicit direction, for the second time this session (the earlier database migration was the first). The evidence record and the gates-doc update exist so this is legible later, not to make it retroactively compliant. |
| **Vercel deployment target inference** | The `target: "production"` correlation with the `release` branch was read from recent deployment history (empirical, not from an explicit "production branch" config field the API exposed directly). If Vercel's project settings changed recently, this inference could be stale — worth a final `get_project`/branch-settings glance immediately before Part 2's merge if time has passed since this design was written. |

## Verification record

Confirmed 2026-09-02: `main` and `origin/main` both at `96e9e84`; `HEAD`
(`feat/isolated-test-infrastructure`) at `429e8ea`, seven commits ahead, not an ancestor of `main`,
never pushed to origin. `release` branch deployments (`dpl_81cs7BmA...`/`9f5e51d`,
`dpl_4qqgGES5...`/`24d4507`, `dpl_6BVQtRG3...`/`08c8a46`) all show `target: "production"`; sampled
`main` branch deployments all show `target: null`. Both `main` and `release` return
`404 Branch not protected` from the GitHub branch-protection API. `release` is the repository's
GitHub default branch.
