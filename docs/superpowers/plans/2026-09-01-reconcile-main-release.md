# Reconciling `main` and `release` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `release`'s CI workflow triggers, corrected sunset constant and repaired failure message onto `main`, resolving the duplicate CRLF fix in favour of `main`'s better one, so `main`'s suite stays green past 2026-09-06 and the cutover merge is conflict-free.

**Architecture:** Four files change on `main`. Three simply take `release`'s newer version. The fourth, `ci-security-contract.test.ts`, keeps `main`'s `mutateFixture` machinery and gains only `release`'s trigger helper and assertions — the two fixes overlap but each holds something the other lacks. Landed by pull request and proved by re-running the cutover probe.

**Tech Stack:** TypeScript, Vitest, GitHub Actions, git.

**Design:** `docs/superpowers/specs/2026-09-01-reconcile-main-release-design.md`, commit `137dab0`.

---

## Before you start

**The push and the PR merge each require the repository owner's go-ahead at the moment they happen.** Neither deploys production — `main` is preview-only — but both are outward-facing.

**Two changes are coupled.** The workflow trigger (Task 2) and the broadened assertion (Task 5) must land in the same commit. Either alone leaves `main` red: a `[main, release]` workflow fails an assertion pinning `[main]`, and vice versa.

**Line endings.** Files are checked out CRLF. Verify each diff's line count; a whole-file rewrite means the editor normalised endings. `git status` will not reveal this — restore with `git checkout-index -f -- <path>`, since `git checkout --` is a no-op when git considers the file unmodified.

## File structure

| Path | Change | Source |
|---|---|---|
| `.github/workflows/ci.yml` | `branches: [main]` → `[main, release]`, both events | `release` |
| `lib/email/unsubscribe-token.ts` | Constant `2026-09-06` → `2026-09-10`; comment gains deploy-date evidence | `release` |
| `tests/unit/unsubscribe-secret-rotation.test.ts` | Message: `serverEnv()` → `unsubscribeEnv()` | `release` |
| `tests/unit/ci-security-contract.test.ts` | Add `workflowTriggerBranches`; replace the `[main]` literal assertion with two containment assertions | `release`, partial |

## Rollback

Before the PR merges: `git reset --hard origin/main` on the branch. After: `git revert <merge-sha>`. Production is untouched throughout — `release` is not modified by this plan.

---

### Task 1: Verify preconditions

**Files:** none modified.

- [ ] **Step 1: Confirm branch and base**

```bash
git rev-parse --abbrev-ref HEAD
git fetch origin --prune
git merge-base --is-ancestor origin/main HEAD && echo "based on current main"
```

Expected: `chore/reconcile-main-release`, then `based on current main`.

- [ ] **Step 2: Confirm `main` still holds the landed tree**

```bash
git rev-parse origin/main^{tree}
```

Expected: `50195fedb6b070046299237b1b9d50a0195ecb3e`. Anything else means `main` moved since the design was written — stop and re-derive.

- [ ] **Step 3: Confirm the four divergences are still present**

```bash
sed -n '4,7p' .github/workflows/ci.yml
grep -n 'SUNSET = ' lib/email/unsubscribe-token.ts
grep -c 'serverEnv().cronSecret' tests/unit/unsubscribe-secret-rotation.test.ts
grep -n 'must trigger pull requests targeting main' tests/unit/ci-security-contract.test.ts
```

Expected: `branches: [main]` twice; `"2026-09-06"`; `1`; and the assertion at roughly line 330.

- [ ] **Step 4: Confirm `main`'s better helpers are present**

```bash
grep -n '^function \(normalizeNewlines\|mutateFixture\)' tests/unit/ci-security-contract.test.ts
```

Expected: both, around lines 115 and 119. These are what the design keeps; if absent, the design's premise is wrong — stop.

---

### Task 2: Take `release`'s workflow triggers

**Files:**
- Modify: `.github/workflows/ci.yml:4-7`

- [ ] **Step 1: Make the change**

Currently:

```yaml
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
```

Becomes:

```yaml
on:
  pull_request:
    branches: [main, release]
  push:
    branches: [main, release]
```

Change nothing else.

- [ ] **Step 2: Verify the diff is two lines**

```bash
git diff --stat .github/workflows/ci.yml
```

Expected: `1 file changed, 2 insertions(+), 2 deletions(-)`. If more, the edit rewrote line endings — `git checkout-index -f -- .github/workflows/ci.yml` and redo.

- [ ] **Step 3: Confirm the suite is now red, and why**

```bash
npm test -- tests/unit/ci-security-contract.test.ts
```

Expected: **FAIL** on `CI must trigger pull requests targeting main`, because that assertion pins the literal `[main]`. This is the coupling in action; Task 5 resolves it. Do not commit yet.

---

### Task 3: Take `release`'s sunset constant

**Files:**
- Modify: `lib/email/unsubscribe-token.ts`

- [ ] **Step 1: Insert the evidence paragraph and change the date**

The comment block currently ends:

```ts
 * deploy, so the fallback must outlive that by a margin.
 *
 * After this date, delete `cronSecret` from the two `secrets` arrays
```

Insert a paragraph after the first, so it reads:

```ts
 * deploy, so the fallback must outlive that by a margin.
 *
 * The clock starts at the deploy, not the commit -- named here so the date can
 * be rechecked rather than trusted. The split committed on 2026-08-06, but the
 * earliest production deployment carrying it is `e26cde88` (PR #10) at
 * 2026-08-09 14:32Z, so the last legacy token can stay valid until
 * 2026-09-08 14:32Z. This constant read 2026-09-06 until 2026-09-01, computed
 * from the commit instead -- about three days early.
 *
 * After this date, delete `cronSecret` from the two `secrets` arrays
```

and change the constant to:

```ts
export const LEGACY_UNSUBSCRIBE_SECRET_SUNSET = "2026-09-10";
```

- [ ] **Step 2: Verify**

```bash
git diff --stat lib/email/unsubscribe-token.ts
grep -n 'SUNSET = ' lib/email/unsubscribe-token.ts
```

Expected: roughly `8 insertions(+), 2 deletions(-)`, and the constant reading `2026-09-10`.

---

### Task 4: Take `release`'s repaired failure message

There is no `serverEnv()` — env access is feature-scoped. That text is read at the moment someone acts on it.

**Files:**
- Modify: `tests/unit/unsubscribe-secret-rotation.test.ts`

- [ ] **Step 1: Correct the accessor**

Find:

```ts
      + `expired. Drop serverEnv().cronSecret from the secrets arrays in `
```

Change to:

```ts
      + `expired. Drop unsubscribeEnv().cronSecret from the secrets arrays in `
```

- [ ] **Step 2: Verify only that reference changed**

```bash
git diff --stat tests/unit/unsubscribe-secret-rotation.test.ts
grep -n 'serverEnv()' tests/unit/unsubscribe-secret-rotation.test.ts
```

Expected: `1 insertion(+), 1 deletion(-)`, and one remaining `serverEnv()` at roughly line 68. That one is **deliberate** — a comment explaining why an assertion matches a property name rather than an accessor. Leave it.

- [ ] **Step 3: Run the file**

```bash
npm test -- tests/unit/unsubscribe-secret-rotation.test.ts
```

Expected: all pass. The timer now reads `fails once 2026-09-10 has passed`.

---

### Task 5: Re-apply `release`'s trigger coverage onto `main`'s helpers

`main`'s `normalizeNewlines` and `mutateFixture` stay exactly as they are — they are the better fix and the design keeps them. Only the trigger assertions come across.

**Files:**
- Modify: `tests/unit/ci-security-contract.test.ts`

- [ ] **Step 1: Add the helper**

Immediately after `workflowRunSteps` (around line 113) and before `normalizeNewlines`, insert:

```ts
function workflowTriggerBranches(workflow: string, event: "pull_request" | "push") {
  const match = new RegExp(`${event}:\\s*\\n\\s*branches:\\s*\\[([^\\]]*)\\]`).exec(workflow);
  return match ? match[1].split(",").map((branch) => branch.trim()).filter(Boolean) : [];
}
```

- [ ] **Step 2: Replace the literal assertion with two containment assertions**

Find, around line 330:

```ts
    expect(workflow, "CI must trigger pull requests targeting main").toMatch(/pull_request:\s*\n\s*branches:\s*\[main\]/);
```

Replace with:

```ts
    // Anchored on which branches are actually covered rather than one spelling of
    // the list. `release` is the production branch and the repository default, so a
    // trigger list that quietly stopped covering it would deploy production
    // unchecked -- which is exactly the state this repository was in until CI was
    // extended. Both events are pinned because only `push` guards the cutover
    // itself; a pull_request-only trigger leaves the deploying push unverified.
    expect(workflowTriggerBranches(workflow, "pull_request"), "CI must trigger pull requests targeting main and release").toEqual(expect.arrayContaining(["main", "release"]));
    expect(workflowTriggerBranches(workflow, "push"), "CI must run on pushes to main and release, so production is never deployed unchecked").toEqual(expect.arrayContaining(["main", "release"]));
```

- [ ] **Step 3: Run the file — it should now pass**

```bash
npm test -- tests/unit/ci-security-contract.test.ts
```

Expected: all pass. Task 2 made it red; this makes it green. That red-to-green transition is the evidence the two changes belong in one commit.

- [ ] **Step 4: Prove the new assertion catches a violation**

Temporarily edit `.github/workflows/ci.yml` by hand, changing both `branches: [main, release]` lines back to `branches: [main]`, then:

```bash
npm test -- tests/unit/ci-security-contract.test.ts
```

Expected: **FAIL** with `expected [ 'main' ] to deeply equal ArrayContaining ["main", "release"]`. Quote it — this is the RED evidence.

Then edit the file by hand again, restoring both lines to `branches: [main, release]`, and confirm:

```bash
grep -n 'branches:' .github/workflows/ci.yml
```

Expected: `branches: [main, release]` twice.

Restore by hand rather than with git: the file carries Task 2's uncommitted change, so `git checkout-index -f` would revert to the staged `[main]` version and silently undo Task 2.

- [ ] **Step 5: Confirm `main`'s helpers survived untouched**

```bash
grep -n '^function \(normalizeNewlines\|mutateFixture\|workflowTriggerBranches\)' tests/unit/ci-security-contract.test.ts
```

Expected: all three. If `normalizeNewlines` or `mutateFixture` is missing, the better fix was destroyed — restore it before continuing.

---

### Task 6: Full verification and commit

**Files:** none beyond Tasks 2–5.

- [ ] **Step 1: Run the checks that work locally**

```bash
npm run audit:strings
npm test
npm run lint
```

Expected: exit 0 from each. Record the totals.

`npm run typecheck` and `npm run build` **will fail locally** on untracked scratch directories such as `task9-root-stage/`. Those are not project code and CI never sees them, because `npm ci` runs on a clean checkout. Record this as a known local limitation — neither a pass nor a failure — and treat CI as authoritative for both.

- [ ] **Step 2: Commit all four files together**

The coupling requires a single commit.

```bash
git add .github/workflows/ci.yml lib/email/unsubscribe-token.ts \
  tests/unit/unsubscribe-secret-rotation.test.ts tests/unit/ci-security-contract.test.ts
git commit -m "chore: reconcile main with release"
```

---

### Task 7: Land it on `main`

**Files:** none modified.

- [ ] **Step 1: Ask the owner, then push**

```bash
git push -u origin chore/reconcile-main-release
```

- [ ] **Step 2: Open the pull request**

```bash
gh pr create --base main --head chore/reconcile-main-release \
  --title "chore: reconcile main with release" \
  --body "Brings release's CI trigger extension, corrected unsubscribe sunset and repaired failure message onto main.

main's suite would otherwise turn red on 2026-09-06, because its copy of the sunset constant is the uncorrected one.

Resolves a duplicate fix. The CRLF-hostile mutation bug in ci-security-contract.test.ts was fixed twice independently -- 57182c9 on the PR2 branch and again on release. main's version is kept because it is strictly better: it asserts the mutation needle was found and that the mutation was not a no-op, so a silent no-op is impossible. release's normalisation is discarded; only its workflowTriggerBranches helper and broadened pull_request/push assertions are re-applied.

Design: docs/superpowers/specs/2026-09-01-reconcile-main-release-design.md"
```

- [ ] **Step 3: Confirm the base**

```bash
gh pr view --json number,baseRefName --jq '"#\(.number) -> \(.baseRefName)"'
```

Expected: base is `main`. `release` is the repository default, so a wrong base is silent and would target production.

- [ ] **Step 4: Wait for CI**

```bash
gh pr checks --watch
```

Expected: `quality` concludes `pass`.

- [ ] **Step 5: Ask the owner, then merge**

```bash
gh pr merge --merge --delete-branch=false
```

This does not deploy production — `main` is preview-only.

---

### Task 8: Acceptance — prove the cutover is clean

The point of the whole exercise, and the only check that actually confirms it worked.

**Files:** none modified.

- [ ] **Step 1: Confirm the four changes are live on `main`**

```bash
git fetch origin --prune
git show origin/main:.github/workflows/ci.yml | sed -n '4,7p'
git show origin/main:lib/email/unsubscribe-token.ts | grep 'SUNSET = '
git show origin/main:tests/unit/ci-security-contract.test.ts | grep -c 'workflowTriggerBranches\|mutateFixture'
git show origin/main:tests/unit/unsubscribe-secret-rotation.test.ts | grep -c 'unsubscribeEnv().cronSecret'
```

Expected: `branches: [main, release]` twice; `"2026-09-10"`; a count of at least `3`, proving both `main`'s helper and `release`'s were kept; and `1`.

- [ ] **Step 2: Repeat the cutover probe**

```bash
git checkout -B cutover-probe origin/release
git merge --no-ff --no-edit origin/main
```

Expected: **no `CONFLICT` line**; the merge completes cleanly. That is the acceptance criterion.

If it still conflicts, record which file and stop — the reconciliation is incomplete.

- [ ] **Step 3: Confirm the merged result keeps the right values**

```bash
sed -n '4,7p' .github/workflows/ci.yml
grep 'SUNSET = ' lib/email/unsubscribe-token.ts
```

Expected: `branches: [main, release]` and `"2026-09-10"`.

- [ ] **Step 4: Discard the probe**

```bash
git merge --abort 2>/dev/null || git reset --hard origin/release
git checkout main
git branch -D cutover-probe
```

The probe is throwaway. **Do not push it** — merging `main` into `release` is the cutover itself, gated behind UAT and production approval and explicitly out of scope here.

---

## What this plan does not do

- **No cutover.** The probe is local and discarded; `release` is never advanced.
- **No production deployment.** Only `main` changes, and `main` is preview-only.
- **No ruleset change.** Adding the required `quality` check to `main` is S1 Task 12, deliberately separate — doing it first would block the very push this plan needs.
- **No migration is applied**, and delivery gates 2–4 are untouched.
- **The stale claim in the older CI spec is not corrected here.** `docs/superpowers/specs/2026-08-31-ci-guards-production-design.md` §3 still says a cutover merge would strip CI from production. This plan's Task 8 disproves it; amending that document is a separate edit.
