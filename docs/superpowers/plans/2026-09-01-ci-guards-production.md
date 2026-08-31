# Make CI Guard Production — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the production branch `release` under the `quality` CI check and protect it from force-push and deletion, without blocking the landing plan's remaining direct pushes to `main`.

**Architecture:** A two-line change to `.github/workflows/ci.yml` extends the triggers to `release`, landed through a pull request so CI runs on the merge ref and the change validates itself before merging. Protection is then applied with repository rulesets — full rules on `release`, force-push and deletion only on `main` — chosen so the gate survives the repository being made private again.

**Tech Stack:** GitHub Actions, GitHub repository rulesets via `gh api`, git.

**Design:** `docs/superpowers/specs/2026-08-31-ci-guards-production-design.md`, commit `f7266bf`.

---

## Before you start

**Every push and every PR merge requires the repository owner's explicit go-ahead at the moment it happens.** Task 5 merges to `release`, which is production.

**Do not run Tasks 11 and 12 yet.** They are follow-ups that unblock only after
`docs/superpowers/plans/2026-08-31-land-wisetech-pr2-6-on-main.md` has pushed its final merge. They are included here because S1 is not complete without them.

**Line endings.** `.github/workflows/ci.yml` is stored with LF but checked out with CRLF (`core.autocrlf` is on). A careless rewrite will show every line as changed. Task 2 verifies the diff is exactly two lines.

**Lock-out warning.** The `release` ruleset has no bypass actors, so after Task 6 even the repository owner cannot push directly to production. The escape hatch is deleting the ruleset (Rollback, below). This is deliberate: a bypass actor on a solo-owner repository makes the gate decorative.

## File structure

| Path | Action | Responsibility |
|---|---|---|
| `.github/workflows/ci.yml` | Modify, 2 lines | Extend `on:` triggers to cover `release` |
| `docs/integration/ci-production-guard-evidence.md` | Create | Record run ids, ruleset ids, and the observed push rejections |
| — | Create via API | Ruleset `protect-release` |
| — | Create via API | Ruleset `protect-main` |

## Rollback

**Rulesets:** `gh api -X DELETE repos/YNWAforever/hkwtia/rulesets/<id>`. This is also the lock-out escape hatch.

**Workflow change:** revert the commit on `release` through a further pull request. Production content is unaffected either way — the workflow file does not enter the Next.js build.

---

### Task 1: Verify preconditions

**Files:** none modified.

- [ ] **Step 1: Confirm the working branch and its base**

```bash
git rev-parse --abbrev-ref HEAD
git merge-base --is-ancestor 08c8a46 HEAD && echo "based on release"
```

Expected: `ci/guard-release`, then `based on release`.

- [ ] **Step 2: Confirm the remote state is unchanged**

```bash
gh api repos/YNWAforever/hkwtia --jq '.default_branch'
gh api repos/YNWAforever/hkwtia/branches/release --jq '.commit.sha'
```

Expected: `release`, then `08c8a465e2216a5c2b9869c3716f69e56d6442bb`.

If `release` has moved, stop — someone has pushed to production and this plan's assumptions need rechecking.

- [ ] **Step 3: Confirm nothing is protected yet**

```bash
gh api repos/YNWAforever/hkwtia/rulesets
```

Expected: `[]`. If rulesets already exist, stop and report rather than adding a second, possibly conflicting, set.

- [ ] **Step 4: Confirm CI has never run on release**

```bash
gh run list --branch release --limit 5
```

Expected: no rows. This is the condition the plan removes; record it as the "before" state.

- [ ] **Step 5: No commit**

Nothing changed.

---

### Task 2: Extend the workflow triggers

**Files:**
- Modify: `.github/workflows/ci.yml` lines 4–7

- [ ] **Step 1: Make the change**

The `on:` block currently reads:

```yaml
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
```

Change both `branches:` lines so it reads:

```yaml
on:
  pull_request:
    branches: [main, release]
  push:
    branches: [main, release]
```

Change nothing else. The `permissions`, `concurrency` and `jobs` blocks stay exactly as they are.

- [ ] **Step 2: Verify the diff is exactly two lines**

```bash
git diff --stat .github/workflows/ci.yml
git diff .github/workflows/ci.yml
```

Expected: `1 file changed, 2 insertions(+), 2 deletions(-)`.

If the stat shows more, the edit rewrote line endings. Run `git checkout -- .github/workflows/ci.yml` and redo Step 1 preserving CRLF.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run the quality job on the release branch"
```

---

### Task 3: Push the branch and open the pull request

**Files:** none modified.

- [ ] **Step 1: Ask the owner before pushing**

This is the first push of the plan. Ask explicitly and wait.

- [ ] **Step 2: Push the branch**

```bash
git push -u origin ci/guard-release
```

- [ ] **Step 3: Open the pull request against `release`**

`release` is the default branch, so the base is correct by default — but state it explicitly rather than relying on that.

```bash
gh pr create --base release --head ci/guard-release \
  --title "ci: run the quality job on the release branch" \
  --body "Extends the CI triggers to cover release, which is now both the default branch and Vercel's production branch. Before this, gh run list --branch release returned nothing and every push to production ran no checks at all.

Landed as a PR rather than a push so CI runs on the merge ref and the change validates itself.

Design: docs/superpowers/specs/2026-08-31-ci-guards-production-design.md"
```

- [ ] **Step 4: Record the PR number and confirm its base**

```bash
gh pr view --json number,baseRefName,headRefName --jq '"#\(.number) \(.headRefName) -> \(.baseRefName)"'
```

Expected: the base is `release`. If it is `main`, close the PR and reopen with the correct base.

---

### Task 4: Verify CI runs on the pull request

This is the self-validation step the design depends on. If it does not work, the design says so and gives a fallback — take it rather than forcing the trick.

**Files:** none modified.

- [ ] **Step 1: Wait for the check to appear and complete**

```bash
gh pr checks --watch
```

Expected: a `quality` check, concluding `pass`. The job takes roughly five minutes.

- [ ] **Step 2: If no check appears at all**

The merge-ref assumption in the spec does not hold in this configuration. Do not force it. Record that finding, then take the fallback: merge the PR anyway (Task 5) and rely on the push-triggered run that follows the merge as the first validation. The change is a two-line workflow edit with no effect on the application build, so landing it unvalidated is low risk.

Write the outcome — trick worked, or fallback taken — into the evidence record in Task 10.

- [ ] **Step 3: If the check appears and fails**

Stop. A failing `quality` here means something is broken independently of the trigger change, since the branch is `release` plus two edited lines. Capture the failing step's log and report before merging anything to production.

---

### Task 5: Merge, and confirm CI now covers production

**Files:** none modified.

- [ ] **Step 1: Ask the owner before merging**

This merge deploys production. The only content difference is the workflow file, which the Next.js build does not read, so production rebuilds to identical output — but it is a production deployment and needs a yes.

- [ ] **Step 2: Merge the pull request**

```bash
gh pr merge --merge --delete-branch=false
```

Use a merge commit, not squash or rebase, to match the repository's existing history style.

- [ ] **Step 3: Confirm `release` advanced**

```bash
gh api repos/YNWAforever/hkwtia/branches/release --jq '.commit.sha'
git fetch origin --prune
git log --oneline origin/release -3
```

Expected: a new SHA, with `08c8a46` one or two commits below it.

- [ ] **Step 4: Confirm CI now runs on `release` — the point of the whole task**

```bash
gh run list --branch release --limit 3
```

Expected: at least one row, where Task 1 Step 4 found none. Watch it to completion:

```bash
gh run watch <run-id> --exit-status --interval 20
```

Expected: `quality` concludes `success`.

- [ ] **Step 5: Confirm the production deployment is healthy**

Use the Vercel MCP `list_deployments` tool with `projectId: prj_lT7YZDueA6kzhz2xrPPHFyNsDf8n` and `teamId: team_qvzlsFmfCsLkgItSypqHjw3z`.

Expected: a new deployment with `meta.githubCommitRef` of `release` and `target: "production"`, reaching `state: "READY"`. Record its id.

If it fails to build, roll back by promoting the previous production deployment `dpl_H1rvfezjxDu2XZ5zqW3GopKfR9r4` in the Vercel dashboard, then report.

---

### Task 6: Create the `release` ruleset

**Files:** none modified. Creates a ruleset through the API.

- [ ] **Step 1: Determine the exact status-check context name**

The ruleset must name the check exactly as GitHub reports it. Read it from the run that just completed on `release`:

```bash
gh api repos/YNWAforever/hkwtia/commits/release/check-runs --jq '.check_runs[].name'
```

Expected: `quality`. If it prints something else, use that string verbatim in Step 2 instead.

- [ ] **Step 2: Create the ruleset**

```bash
gh api -X POST repos/YNWAforever/hkwtia/rulesets --input - <<'JSON'
{
  "name": "protect-release",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": {
    "ref_name": { "include": ["refs/heads/release"], "exclude": [] }
  },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [ { "context": "quality" } ]
      }
    }
  ]
}
JSON
```

`required_approving_review_count` is `0` deliberately. This is a solo-owner repository; requiring one approval would deadlock, because GitHub does not let an author approve their own pull request.

- [ ] **Step 3: Verify it exists and is active**

```bash
gh api repos/YNWAforever/hkwtia/rulesets --jq '.[] | "\(.id) \(.name) \(.enforcement) \(.target)"'
```

Expected: one row, `protect-release active branch`. Record the id.

- [ ] **Step 4: If creation fails with a plan or permission error**

Record delivery gate 1 as **unmet** with the exact API error. Do not substitute a weaker rule to make the step pass. Report and stop.

---

### Task 7: Verify the `release` ruleset actually blocks

A rule that has never rejected anything is a claim, not evidence.

**Files:** none modified.

- [ ] **Step 1: Attempt a direct push to `release` and expect rejection**

```bash
git checkout -B ruleset-probe origin/release
git commit --allow-empty -m "probe: confirm release rejects direct pushes"
git push origin ruleset-probe:release
```

Expected: the push is **rejected**, with a message naming the repository rule violations — the required pull request and the required status check.

**If the push succeeds, the ruleset is not working.** Immediately revert production:

```bash
git push --force-with-lease origin 08c8a46:release
```

`08c8a46` is the commit production served before this plan began, so reverting to it also undoes the Task 5 merge. Then report. Do not proceed to Task 8 with production unguarded.

- [ ] **Step 2: Clean up the probe branch**

```bash
git checkout ci/guard-release
git branch -D ruleset-probe
```

The probe commit was never accepted, so nothing remains on the remote.

---

### Task 8: Create the `main` ruleset

Deliberately weaker: no required check and no required pull request, because the landing plan still pushes four merges directly to `main`.

**Files:** none modified. Creates a ruleset through the API.

- [ ] **Step 1: Create the ruleset**

```bash
gh api -X POST repos/YNWAforever/hkwtia/rulesets --input - <<'JSON'
{
  "name": "protect-main",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": {
    "ref_name": { "include": ["refs/heads/main"], "exclude": [] }
  },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" }
  ]
}
JSON
```

- [ ] **Step 2: Verify both rulesets exist**

```bash
gh api repos/YNWAforever/hkwtia/rulesets --jq '.[] | "\(.id) \(.name) \(.enforcement)"'
```

Expected: two rows, `protect-release active` and `protect-main active`. Record both ids.

---

### Task 9: Verify `main` still accepts a direct push

The landing plan has four merges left to push directly. If this ruleset blocks them, S1 has broken an in-flight plan.

**Files:** none modified.

- [ ] **Step 1: Create a tree-preserving commit on `main`**

```bash
git checkout main
git commit --allow-empty -m "chore: confirm main still accepts direct pushes"
[ "$(git rev-parse HEAD^{tree})" = "$(git rev-parse HEAD~1^{tree})" ] && echo "tree unchanged"
```

Expected: `tree unchanged`.

The assertion compares the new commit's tree against its parent's rather than against a fixed hash, because the landing plan may have advanced `main` by any number of merges before this task runs. What matters is only that this commit adds no content, so whichever tree the landing plan next expects is still the tree it finds.

An empty commit is used precisely because it leaves the tree untouched.

- [ ] **Step 2: Ask the owner, then push**

```bash
git push origin main
```

Expected: **accepted**. If it is rejected, the `main` ruleset is too strict — delete it with `gh api -X DELETE repos/YNWAforever/hkwtia/rulesets/<protect-main-id>` and report, because the landing is now blocked.

- [ ] **Step 3: Confirm force-push is still blocked on `main`**

```bash
git push --force-with-lease origin HEAD~1:main
```

Expected: **rejected** by the `non_fast_forward` rule. If it succeeds, `main` has been left rewritable — recreate the ruleset and re-verify.

Then restore the branch pointer:

```bash
git fetch origin --prune
git reset --hard origin/main
```

---

### Task 10: Record the evidence

**Files:**
- Create: `docs/integration/ci-production-guard-evidence.md`

- [ ] **Step 1: Switch to the S1 branch**

```bash
git checkout ci/guard-release
```

- [ ] **Step 2: Write the record**

Create `docs/integration/ci-production-guard-evidence.md` containing:

- the "before" state — `gh run list --branch release` empty, `rulesets` empty, no branch protection;
- the pull request number, and whether the self-validating trick worked or the Task 4 fallback was taken;
- the first `quality` run id on `release` and its conclusion;
- the production deployment id from Task 5 Step 5 and its final state;
- both ruleset ids and their rules;
- the verbatim rejection message from Task 7 Step 1, and the verbatim rejection from Task 9 Step 3;
- confirmation that `main` still accepts a direct push.

State plainly that this closes gate 1 of `docs/integration/wisetech-delivery-gates.md`, that the gate's own wording names `main` and is now wrong since production moved to `release`, and that gates 2 through 5 remain `NOT PASSED`.

- [ ] **Step 3: Commit and push**

```bash
git add docs/integration/ci-production-guard-evidence.md
git commit -m "docs: record evidence for the production CI guard"
git push origin ci/guard-release
```

Ask before pushing. A second pull request into `release` can carry this evidence file, or it can ride along with a later change — either is acceptable, but do not leave it uncommitted.

---

### Task 11: FOLLOW-UP — sync `main`'s workflow

**Blocked until `docs/superpowers/plans/2026-08-31-land-wisetech-pr2-6-on-main.md` has pushed its final merge.** Doing this earlier changes `main`'s tree and breaks that plan's Task 7 verification.

This is not optional. At cutover, `main` merges into `release`; if `main`'s workflow still lacks the `release` trigger, that merge silently strips CI from production — undoing S1 by the act of shipping.

**Files:**
- Modify: `.github/workflows/ci.yml` lines 4–7, on `main`

- [ ] **Step 1: Confirm the landing has finished**

```bash
git fetch origin --prune
git rev-parse origin/main^{tree}
```

Expected: `50195fedb6b070046299237b1b9d50a0195ecb3e` — the landing's final tree. If it is anything else, the landing is not done. Stop.

- [ ] **Step 2: Apply the identical change**

```bash
git checkout main
git reset --hard origin/main
```

Edit `.github/workflows/ci.yml` so the `on:` block reads:

```yaml
on:
  pull_request:
    branches: [main, release]
  push:
    branches: [main, release]
```

- [ ] **Step 3: Verify the two branches now agree**

```bash
git diff --stat .github/workflows/ci.yml
git diff origin/release:.github/workflows/ci.yml .github/workflows/ci.yml
```

Expected: `2 insertions(+), 2 deletions(-)` for the first, and **no output** for the second — the two branches' workflow files are now identical.

- [ ] **Step 4: Commit and push**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: sync the release trigger onto main"
git push origin main
```

Ask before pushing. Confirm CI passes on the resulting run.

---

### Task 12: FOLLOW-UP — require `quality` on `main`

**Blocked until Task 11 is done.** Adding a required check before then would block the very push Task 11 needs.

**Files:** none modified. Replaces a ruleset through the API.

- [ ] **Step 1: Update the `main` ruleset to match `release`**

```bash
gh api -X PUT repos/YNWAforever/hkwtia/rulesets/<protect-main-id> --input - <<'JSON'
{
  "name": "protect-main",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": {
    "ref_name": { "include": ["refs/heads/main"], "exclude": [] }
  },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [ { "context": "quality" } ]
      }
    }
  ]
}
JSON
```

- [ ] **Step 2: Verify both rulesets now carry the same rules**

```bash
gh api repos/YNWAforever/hkwtia/rulesets --jq '.[] | {name, enforcement, rules: [.rules[].type]}'
```

Expected: both `protect-main` and `protect-release` list `deletion`, `non_fast_forward`, `pull_request`, `required_status_checks`.

- [ ] **Step 3: Verify a direct push to `main` is now rejected**

```bash
git checkout main
git commit --allow-empty -m "probe: confirm main now rejects direct pushes"
git push origin main
```

Expected: **rejected**, naming the rule violations. Then discard the probe commit:

```bash
git reset --hard origin/main
```

- [ ] **Step 4: Append to the evidence record**

Add the updated ruleset rules and the verbatim rejection message to
`docs/integration/ci-production-guard-evidence.md`, and record S1 as complete.

---

## What this plan does not do

- **No production cutover.** `release` gains a workflow-file commit only; the redesign stays on `main`.
- **No change to the landing plan.** `main`'s tree is preserved throughout; only empty commits touch it.
- **Gates 2–5 remain `NOT PASSED`** — isolated Neon and test identities, Preview/UAT, production approval, and the 2026-09-06 unsubscribe fallback.
- **The unsubscribe deadline is not addressed, and gets sharper.** Once `quality` is required on `release`, an unresolved fallback blocks every merge into production from 2026-09-06. That is sub-project S2.
