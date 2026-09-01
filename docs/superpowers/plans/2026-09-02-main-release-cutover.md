# Cutting `main` Over to `release` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge this session's `feat/isolated-test-infrastructure` branch into `main`, then merge the
resulting `main` into `release` — which Vercel auto-deploys to production — closing the gap between
production's already-migrated database schema and its deployed application code.

**Architecture:** Two sequential PR-based merges, each gated on the `quality` CI job and the
repository owner's explicit go-ahead (neither branch has GitHub branch protection, so both gates are
process choices this plan imposes on itself, not platform-enforced ones). A local, throwaway merge
probe re-proves the second merge is conflict-free immediately before it happens, since the last proof
predates this session's commits. The plan ends by correcting `docs/integration/wisetech-delivery-gates.md`
so it stops describing a state that's no longer true.

**Tech Stack:** git, GitHub CLI (`gh`), Vercel (via the connected `deploy_to_vercel`-family MCP tools).

**Design:** `docs/superpowers/specs/2026-09-02-main-release-cutover-design.md`, commit `75eb5ca`.

---

## Before you start

**This deploys production.** Part 2, Task 8 is the step that does it. Get the owner's explicit
go-ahead immediately before that merge, separately from any earlier approval — a design approval is
not a live deploy approval.

**Neither `main` nor `release` has branch protection.** `gh api repos/YNWAforever/hkwtia/branches/{main,release}/protection`
returns `404 Branch not protected` for both, confirmed in the design's verification record. Every
"wait for CI" and "get the owner's go-ahead" instruction below is this plan's own discipline, not
something GitHub will refuse to let you skip. Do not skip it anyway.

**The probe in Task 5 must be re-run, not assumed.** It was last proven clean against an older `main`
tip. If it conflicts, stop and resolve the conflict as its own explicit step — do not force the merge
through.

## File structure

| Path | Action | Responsibility |
|---|---|---|
| `docs/integration/wisetech-delivery-gates.md` | Modify | Correct the now-false "no production action was performed" line; record what actually happened |
| `docs/integration/main-release-cutover-evidence.md` | Create | PR numbers, merge SHAs, probe result, CI results, deployment ID, smoke-check result |

No application code changes — this plan only merges already-reviewed commits and updates two docs.

## Rollback

**Part 2 (production deploy):** `git revert <merge-sha>` on `release`, then push — triggers a new
Vercel deploy that reverts. Vercel can also promote the prior `READY` production deployment
(`dpl_81cs7BmA6751cZAK1yiYXUTiTaxu`) straight back from the dashboard for faster mitigation; that is
a manual owner action, not something this plan automates.
**Part 1 (`main` merge):** ordinary `git revert` on `main`. Nothing deploys from `main`.
**Database:** unaffected either way — already migrated separately, additive-only, no down path.

---

### Task 1: Verify preconditions

**Files:** none modified.

- [ ] **Step 1: Fetch and confirm branch state**

```bash
git fetch origin --prune
git rev-parse origin/main
git rev-parse HEAD
git rev-parse --abbrev-ref HEAD
```

Expected: `origin/main` is `96e9e84cc7eaf04d34f357a8bbc7274c90c9f53d`; `HEAD` is
`429e8ea7bbb07b8e1edb774e0fff4e21841ba697`; current branch is `feat/isolated-test-infrastructure`.
If `origin/main` differs, `main` moved since this plan was written — stop and re-derive the plan
against the new tip rather than proceeding.

- [ ] **Step 2: Confirm the branch has still never been pushed**

```bash
git ls-remote origin refs/heads/feat/isolated-test-infrastructure
```

Expected: no output (empty).

- [ ] **Step 3: Confirm branch protection is still absent on both branches**

```bash
gh api repos/YNWAforever/hkwtia/branches/main/protection 2>&1 | head -1
gh api repos/YNWAforever/hkwtia/branches/release/protection 2>&1 | head -1
```

Expected: `404` (as `Branch not protected`) for both. If either now returns protection settings, stop
— this plan's "waiting for CI is a courtesy, not a requirement" framing is now wrong, and the PR
flow below may need to satisfy a real required check instead.

---

### Task 2: Push the branch and open the PR into `main`

**Files:** none modified.

- [ ] **Step 1: Push**

```bash
git push -u origin feat/isolated-test-infrastructure
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --base main --head feat/isolated-test-infrastructure \
  --title "feat: add a seed sentinel that proves a database is designated disposable" \
  --body "$(cat <<'EOF'
Adds `assertSeedSentinel` (scripts/lib/acceptance-guard.ts), a second, independent, async check
that a fixture seed's target database was deliberately marked disposable -- not just that its name
and config look right, which is all the existing `assertIsolatedSeedEnvironment` can establish.
Wired into `scripts/seed-m5.ts` only, ahead of any destructive write. Adds the `acceptance_sentinel`
table (migration 0024) and the seven missing acceptance-variable names in `.env.example`.

**This PR's migration was already applied directly to production, ahead of this code landing.**
At the repository owner's explicit direction, migrations 0019-0024 were applied straight to the
production Neon database, skipping the isolated-branch flow this code was originally written for
(docs/superpowers/specs/2026-09-01-isolated-test-infrastructure-design.md). Code is following the
migration here, not the reverse -- an unusual order, recorded plainly rather than glossed over.

**Tasks 6, 8, 9, 10 and 11 of the original plan were deliberately not executed**: no isolated Neon
branch was provisioned, no test identities or Stripe test-mode keys were created, no sentinel was
planted anywhere, and the acceptance suites that would exercise this code were never run against a
real database. `acceptance_sentinel` is empty in production, which is the correct fail-closed state
-- nobody planted a sentinel there, so the guard would still refuse any seed mistakenly pointed at
it. Delivery gate 2 (isolated test infrastructure) in docs/integration/wisetech-delivery-gates.md
stays NOT PASSED for this reason; this PR does not claim otherwise.

Design: docs/superpowers/specs/2026-09-01-isolated-test-infrastructure-design.md
Plan: docs/superpowers/plans/2026-09-01-isolated-test-infrastructure.md
EOF
)"
```

- [ ] **Step 3: Confirm the base**

```bash
gh pr view --json number,baseRefName --jq '"#\(.number) -> \(.baseRefName)"'
```

Expected: base is `main`.

---

### Task 3: Wait for CI, then get the owner's go-ahead

**Files:** none modified.

- [ ] **Step 1: Watch CI**

```bash
gh pr checks --watch
```

Expected: `quality` concludes `pass`. If it fails, stop and report the failure — do not merge a
failing PR just because nothing on GitHub would block it.

- [ ] **Step 2: Ask the owner, then proceed**

Report the PR URL and the CI result. Do not merge until the owner explicitly says to.

---

### Task 4: Merge the PR into `main`

**Files:** none modified.

- [ ] **Step 1: Merge**

```bash
gh pr merge --merge --delete-branch=false
```

- [ ] **Step 2: Confirm `main`'s new tip**

```bash
git fetch origin --prune
git rev-parse origin/main
```

Expected: a new SHA, different from `96e9e84`, whose parent chain includes `429e8ea7`. Record this
SHA — it is `<new-main-sha>` for the rest of this plan.

---

### Task 5: Re-run the cutover probe

The point of this task: prove `origin/main` (as of Task 4, not as of the last time anyone checked)
still merges into `origin/release` with no conflict.

**Files:** none modified.

- [ ] **Step 1: Probe**

```bash
git fetch origin --prune
git checkout -B cutover-probe origin/release
git merge --no-ff --no-edit origin/main
```

Expected: **no `CONFLICT` line.** The merge completes cleanly.

If it conflicts: **stop.** Record which file(s) conflicted, run `git merge --abort`, checkout
`feat/isolated-test-infrastructure` again, and report this as a blocker rather than resolving it
inline as part of this task — the design's own discipline (`docs/superpowers/specs/2026-09-02-main-release-cutover-design.md`,
Design §Part 2 Step 2) is that a fresh conflict here gets its own explicit task, not an ad hoc fix
buried inside this one.

- [ ] **Step 2: Discard the probe**

```bash
git checkout feat/isolated-test-infrastructure
git branch -D cutover-probe
```

Do not push anything from this step. The probe is throwaway, same as the prior reconciliation's.

---

### Task 6: Branch from `release` and open the PR

**Files:** none modified.

- [ ] **Step 1: Create the branch and merge `main` into it**

```bash
git fetch origin --prune
git checkout -B chore/release-cutover-2026-09-02 origin/release
git merge --no-ff --no-edit origin/main
```

Expected: no `CONFLICT` line (Task 5 already proved this; this repeats the merge for real, on a
branch that will actually be pushed).

- [ ] **Step 2: Push**

```bash
git push -u origin chore/release-cutover-2026-09-02
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create --base release --head chore/release-cutover-2026-09-02 \
  --title "chore: cut main over to release" \
  --body "$(cat <<'EOF'
Merges main (currently 126+ commits ahead of release, including PR4's CMS data foundations, PR5's
public journeys, PR6's join/portal/admin visual alignment, and this session's seed-sentinel work)
into release, which Vercel deploys to production.

**This is a deliberate, owner-directed bypass of delivery gates 2-4** as defined in
docs/integration/wisetech-delivery-gates.md (isolated test infrastructure, Preview/UAT, production
approval) -- not a claim that they are now satisfied. Two related facts, both already true before
this PR: migrations 0019-0024 were applied directly to the production database earlier in this
session, ahead of the application code that uses them; and neither main nor release carries GitHub
branch protection, so this PR's quality-CI-and-owner-approval gate is this repository's own
discipline, not a platform requirement.

No new migration. No database changes of any kind -- this PR is application code only.

Design: docs/superpowers/specs/2026-09-02-main-release-cutover-design.md
EOF
)"
```

- [ ] **Step 4: Confirm the base**

```bash
gh pr view --json number,baseRefName --jq '"#\(.number) -> \(.baseRefName)"'
```

Expected: base is `release`. Getting this wrong would target the repository default branch silently
— double-check before continuing.

---

### Task 7: Wait for CI, re-verify the deploy target, then get the owner's explicit go-ahead

**Files:** none modified.

- [ ] **Step 1: Watch CI**

```bash
gh pr checks --watch
```

Expected: `quality` concludes `pass`.

- [ ] **Step 2: Re-verify `release` is still Vercel's production branch**

The design's inference that `release` deploys to production came from reading recent deployment
history (`meta.githubCommitRef` + `target` on past deployments), not from an explicit config field —
worth a fresh check immediately before the merge that actually deploys, in case project settings
changed since. Using the connected Vercel MCP tools, call `list_deployments` with
`projectId: "prj_lT7YZDueA6kzhz2xrPPHFyNsDf8n"` and `teamId: "team_qvzlsFmfCsLkgItSypqHjw3z"`, and
confirm the most recent entries with `meta.githubCommitRef: "release"` still show
`target: "production"`. If that's changed, stop and re-derive which branch actually deploys
production before continuing — do not assume the design doc is still correct.

- [ ] **Step 3: Ask the owner, then proceed**

State plainly: merging this PR deploys production. Report the PR URL and the CI result. Do not
merge until the owner explicitly says to — this confirmation is separate from any earlier approval
of the design or the plan.

---

### Task 8: Merge into `release` — this deploys production

**Files:** none modified.

- [ ] **Step 1: Merge**

```bash
gh pr merge --merge --delete-branch=false
```

- [ ] **Step 2: Confirm `release`'s new tip**

```bash
git fetch origin --prune
git rev-parse origin/release
```

Record this SHA as `<new-release-sha>`.

---

### Task 9: Verify the production deployment

**Files:** none modified.

- [ ] **Step 1: Poll for the deployment**

Using the connected Vercel MCP tools, call `list_deployments` with
`projectId: "prj_lT7YZDueA6kzhz2xrPPHFyNsDf8n"` and
`teamId: "team_qvzlsFmfCsLkgItSypqHjw3z"`. Find the entry whose
`meta.githubCommitSha` equals `<new-release-sha>` from Task 8 and whose `meta.githubCommitRef` is
`release`. If it isn't there yet, wait and retry — do not proceed on a guess.

- [ ] **Step 2: Confirm state and target**

Expected: `state: "READY"` and `target: "production"`. If `state` is `ERROR` or `CANCELED`, stop —
do not proceed to the smoke check, and report the failure; this is a rollback trigger (see this
plan's Rollback section).

- [ ] **Step 3: Smoke check**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://hkwtia.vercel.app
```

Expected: `200`. Anything else — record it and treat as a rollback trigger, do not mark this task
done.

---

### Task 10: Correct the delivery-gates record

**Files:**
- Modify: `docs/integration/wisetech-delivery-gates.md`

- [ ] **Step 1: Replace the now-false claim**

Find this line (currently near the end of "Sequential PR scopes and hard boundaries"):

```
No production database, provider, deploy, migration, or seed action was performed.
```

Replace it with:

```
As of 2026-09-02, this is no longer true: migrations 0019-0024 were applied directly to the
production Neon database, and this branch's commits (through the main-release cutover recorded in
docs/integration/main-release-cutover-evidence.md) were deployed to production via release. Both
actions were owner-directed bypasses of the gate sequence below, not evidence that gates 2-4 passed
-- see that evidence record for what was and was not verified.
```

- [ ] **Step 2: Update the External delivery gates table**

In the table under "## External delivery gates", find the `Isolated test infrastructure` row and
append to its "Required evidence" cell (do not change its `NOT PASSED` status):

```
Bypassed 2026-09-02 for a direct production deployment -- see docs/integration/main-release-cutover-evidence.md. This status remains accurate: no isolated Neon, test identity, or provider configuration was ever created.
```

- [ ] **Step 3: Verify the diff touches only these two spots**

```bash
git diff docs/integration/wisetech-delivery-gates.md
```

Expected: two hunks, each a small, targeted addition/replacement — no unrelated reformatting.

---

### Task 11: Write the evidence record and commit

**Files:**
- Create: `docs/integration/main-release-cutover-evidence.md`

- [ ] **Step 1: Write it**

```markdown
# Main-to-release cutover evidence

Date: 2026-09-02

## What happened

1. PR #<part-1-pr-number> merged `feat/isolated-test-infrastructure` into `main` at
   `<new-main-sha>`. CI (`quality`): <pass/fail, paste the actual conclusion>.
2. The cutover probe (`origin/release` merge `origin/main`, discarded, never pushed) completed with
   no conflict.
3. PR #<part-2-pr-number> merged `main` into `release` at `<new-release-sha>`. CI (`quality`):
   <pass/fail>.
4. Vercel deployment `<deployment-id>` reached `READY`, `target: "production"`, commit
   `<new-release-sha>`. Smoke check: `https://hkwtia.vercel.app` returned `<status-code>`.

## What this does not establish

Delivery gates 2 (isolated test infrastructure), 3 (Preview/UAT) and 4 (production approval) remain
`NOT PASSED` per docs/integration/wisetech-delivery-gates.md. No isolated Neon branch, test identity,
or provider test configuration was ever created. No independent UAT owner reviewed this. This was a
direct, owner-directed production deployment, recorded here so that fact stays legible.
```

Fill in every `<placeholder>` with the actual values recorded in Tasks 4, 7, 8 and 9 before
committing — this file must not be committed with brackets still in it.

- [ ] **Step 2: Commit both docs together**

```bash
git add docs/integration/wisetech-delivery-gates.md docs/integration/main-release-cutover-evidence.md
git commit -m "docs: record the main-release cutover evidence"
```

- [ ] **Step 3: Ask the owner, then push**

```bash
git push
```

This pushes directly to whichever branch is checked out (`chore/release-cutover-2026-09-02`, already
merged) — if that branch was deleted or you've switched branches by this point, push to a small new
branch and open a documentation-only PR into `main` instead. Either is fine; this commit contains no
application code.

---

## What this plan does not do

- **Does not pass delivery gates 2-4.** It deploys anyway, and says so, twice (in both PR bodies and
  in the evidence record).
- **Does not add branch protection.** `main` and `release` remain unprotected after this plan;
  enabling required checks is separate, out-of-scope work (the prior reconciliation plan already
  named this as S1 Task 12, deliberately deferred).
- **Does not touch the database.** No new migration, no schema change, no seed run.
- **Does not clean up the repository's untracked scratch-file clutter.** Unrelated to this plan's
  goal.
