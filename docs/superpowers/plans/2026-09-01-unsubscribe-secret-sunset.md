# Unsubscribe Legacy-Secret Sunset — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the unsubscribe legacy-secret sunset date to one that is actually safe, then remove the fallback after it — without leaving CI red in between.

**Architecture:** Two phases separated by a date. Phase A is a one-line constant change plus the evidence for it, and must land on `release` before 2026-09-06 or the self-detonating test turns the suite red. Phase B removes the fallback on or after 2026-09-10, replacing the one-shot timer test with a permanent invariant so coverage rises rather than falls.

**Tech Stack:** TypeScript, Vitest, GitHub Actions, Vercel.

**Design:** `docs/superpowers/specs/2026-09-01-unsubscribe-secret-sunset-design.md`, commit `2f046eb`.

---

## Before you start

**Every push and every PR merge requires the repository owner's explicit go-ahead at the moment it happens.** Task 7 merges to `release`, which is production.

**Phase A is time-boxed.** It must land before **2026-09-06**. After that the suite is red on any branch that runs it, and once sub-project S1 makes `quality` a required check on `release`, that failure blocks every merge into production.

**Phase B (Tasks 8–13) must not run before 2026-09-10.** Removing the fallback earlier can invalidate unsubscribe links that are still valid. Task 8 refuses to proceed if the date has not passed.

**Do not touch `main`.** `docs/superpowers/plans/2026-08-31-land-wisetech-pr2-6-on-main.md` is mid-execution and verifies `main`'s tree by hash. Everything here happens on `fix/unsubscribe-sunset` and reaches `release` by pull request.

**Line endings.** Files here are checked out CRLF (`core.autocrlf`). Verify each diff's line count — a rewrite that changes every line means the editor normalised endings. `git status` will *not* reveal this: git normalises when comparing, so a damaged file can appear clean.

## File structure

| Path | Phase | Change |
|---|---|---|
| `lib/email/unsubscribe-token.ts` | A | Constant `2026-09-06` → `2026-09-10`; comment gains the deploy-date evidence |
| `tests/unit/unsubscribe-secret-rotation.test.ts` | A | Failure message: stale `serverEnv()` → `unsubscribeEnv()` |
| `lib/api/unsubscribe-route.ts` | B | Drop `env.cronSecret` from the secrets array |
| `app/[locale]/(public)/unsubscribe/page.tsx` | B | Drop `env.cronSecret` from the secrets array |
| `lib/config/env.ts` | B | Remove `cronSecret` from `UnsubscribeEnv` and `parseUnsubscribeEnv` |
| `tests/unit/unsubscribe-secret-rotation.test.ts` | B | Delete the timer block; add the permanent invariant |

## Rollback

**Phase A:** revert the commit through a further pull request into `release`. The change is a date constant and comments; no runtime behaviour depends on it.

**Phase B:** revert the commit — restoring `cronSecret` to the arrays restores the fallback. After 2026-09-10 that fallback verifies nothing that is still valid, so prefer fixing forward unless the revert is for an unrelated failure.

---

# PHASE A — correct the constant (before 2026-09-06)

### Task 1: Verify preconditions

**Files:** none modified.

- [ ] **Step 1: Confirm the branch and base**

```bash
git rev-parse --abbrev-ref HEAD
git merge-base --is-ancestor 08c8a46 HEAD && echo "based on release"
```

Expected: `fix/unsubscribe-sunset`, then `based on release`.

- [ ] **Step 2: Confirm the constant is still the uncorrected value**

```bash
grep -n 'LEGACY_UNSUBSCRIBE_SECRET_SUNSET = ' lib/email/unsubscribe-token.ts
```

Expected: `export const LEGACY_UNSUBSCRIBE_SECRET_SUNSET = "2026-09-06";`

If it already reads `2026-09-10`, Phase A is done — skip to Task 8.

- [ ] **Step 3: Confirm the suite is green before any change**

```bash
npm test -- tests/unit/unsubscribe-secret-rotation.test.ts
```

Expected: all tests pass — before 2026-09-06 the timer has not fired. Record the count.

If it already fails, the date has passed; Phase A still applies but note it in the task report.

---

### Task 2: Prove the timer actually fires

Before changing the date, confirm the test genuinely detects a passed sunset. Otherwise Phase A is guesswork dressed as verification.

**Files:** `lib/email/unsubscribe-token.ts` (temporarily).

- [ ] **Step 1: Temporarily set the constant to a past date**

Edit `lib/email/unsubscribe-token.ts` and change the constant to:

```ts
export const LEGACY_UNSUBSCRIBE_SECRET_SUNSET = "2026-08-01";
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
npm test -- tests/unit/unsubscribe-secret-rotation.test.ts
```

Expected: **FAIL** on `fails once 2026-08-01 has passed`, with a message beginning `The CRON_SECRET fallback for unsubscribe links was due for removal on 2026-08-01.`

Quote that failure in the task report — it is the RED evidence the PR template requires.

- [ ] **Step 3: Restore the file exactly**

```bash
git checkout-index -f -- lib/email/unsubscribe-token.ts
grep -n 'LEGACY_UNSUBSCRIBE_SECRET_SUNSET = ' lib/email/unsubscribe-token.ts
```

Expected: back to `"2026-09-06"`.

Use `checkout-index -f`, not `git checkout --`: the latter is a no-op when git considers the file unmodified, which it may after a line-ending change.

---

### Task 3: Correct the constant and record the evidence

**Files:**
- Modify: `lib/email/unsubscribe-token.ts:36-47`

- [ ] **Step 1: Replace the doc comment and constant**

The block currently reads:

```ts
/**
 * These links were signed with `CRON_SECRET` until the signing key was split
 * out, and they stay valid for `UNSUBSCRIBE_TTL_SECONDS` (30 days) after they
 * are minted. The last legacy token is minted by the final job run before the
 * deploy, so the fallback must outlive that by a margin.
 *
 * After this date, delete `cronSecret` from the two `secrets` arrays
 * (`lib/api/unsubscribe-route.ts` and `app/[locale]/(public)/unsubscribe/page.tsx`)
 * and remove this constant. A test fails once the date passes, so this is not
 * left to memory.
 */
export const LEGACY_UNSUBSCRIBE_SECRET_SUNSET = "2026-09-06";
```

Replace it with:

```ts
/**
 * These links were signed with `CRON_SECRET` until the signing key was split
 * out, and they stay valid for `UNSUBSCRIBE_TTL_SECONDS` (30 days) after they
 * are minted. The last legacy token is minted by the final job run before the
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
 * (`lib/api/unsubscribe-route.ts` and `app/[locale]/(public)/unsubscribe/page.tsx`)
 * and remove this constant. A test fails once the date passes, so this is not
 * left to memory.
 */
export const LEGACY_UNSUBSCRIBE_SECRET_SUNSET = "2026-09-10";
```

- [ ] **Step 2: Verify the diff touches only this block**

```bash
git diff --stat lib/email/unsubscribe-token.ts
```

Expected: one file changed, roughly 8 insertions and 2 deletions. If every line shows as changed, the edit rewrote line endings — run `git checkout-index -f -- lib/email/unsubscribe-token.ts` and redo Step 1.

- [ ] **Step 3: Run the test**

```bash
npm test -- tests/unit/unsubscribe-secret-rotation.test.ts
```

Expected: all pass, and the timer test now reads `fails once 2026-09-10 has passed`.

---

### Task 4: Repair the stale accessor in the failure message

The message tells its reader to drop `serverEnv().cronSecret`. There is no `serverEnv()` — env access is feature-scoped, as `CLAUDE.md` records. The instruction would send someone looking for a function that does not exist, at the moment they are trying to act on it.

**Files:**
- Modify: `tests/unit/unsubscribe-secret-rotation.test.ts`

- [ ] **Step 1: Correct the accessor name**

Find this line inside the timer test's failure message:

```ts
      + `expired. Drop serverEnv().cronSecret from the secrets arrays in `
```

Change it to:

```ts
      + `expired. Drop unsubscribeEnv().cronSecret from the secrets arrays in `
```

- [ ] **Step 2: Confirm no other stale reference remains**

```bash
grep -rn 'serverEnv()' tests/unit/unsubscribe-secret-rotation.test.ts lib/email/unsubscribe-token.ts
```

Expected: no output.

- [ ] **Step 3: Run the test**

```bash
npm test -- tests/unit/unsubscribe-secret-rotation.test.ts
```

Expected: all pass.

---

### Task 5: Full verification and commit

**Files:** none beyond Tasks 3 and 4.

- [ ] **Step 1: Run the checks the CI job runs**

```bash
npm run audit:strings
npm test
npm run lint
npm run typecheck
npm run build
```

On Windows use the `npm.cmd` form. Expected: every command exits 0. Record the test totals.

Do not loosen an assertion or lower a threshold to make any of these pass — report the failure instead.

- [ ] **Step 2: Commit**

```bash
git add lib/email/unsubscribe-token.ts tests/unit/unsubscribe-secret-rotation.test.ts
git commit -m "fix: compute the unsubscribe sunset from the deploy, not the commit"
```

---

### Task 6: Land it on `release`

**Files:** none modified.

- [ ] **Step 1: Ask the owner before pushing**

Ask explicitly and wait.

- [ ] **Step 2: Push and open the pull request**

```bash
git push -u origin fix/unsubscribe-sunset
gh pr create --base release --head fix/unsubscribe-sunset \
  --title "fix: compute the unsubscribe sunset from the deploy, not the commit" \
  --body "LEGACY_UNSUBSCRIBE_SECRET_SUNSET was computed from the split's commit date rather than its deploy date, making it about three days early.

The 30-day token TTL runs from when legacy signing stopped in production. The split committed 2026-08-06, but the earliest production deployment carrying it is e26cde88 (PR #10) at 2026-08-09 14:32Z, so the last legacy token can stay valid until 2026-09-08 14:32Z. Removing the fallback on 2026-09-06 could have invalidated live unsubscribe links, and the test message asserting they had all expired would have been false.

Also repairs a stale serverEnv() reference in that message; env access is feature-scoped.

Design: docs/superpowers/specs/2026-09-01-unsubscribe-secret-sunset-design.md"
```

- [ ] **Step 3: Confirm the base branch**

```bash
gh pr view --json number,baseRefName --jq '"#\(.number) -> \(.baseRefName)"'
```

Expected: base is `release`. If it is `main`, close and reopen with `--base release` — `release` is the repository default, so a wrong base is silent.

- [ ] **Step 4: Wait for CI**

```bash
gh pr checks --watch
```

Expected: `quality` concludes `pass`. If no check appears, S1's trigger change has not yet landed on `release`; record that and rely on the post-merge run.

---

### Task 7: Merge and verify

**Files:** none modified.

- [ ] **Step 1: Ask the owner before merging**

This merge deploys production. The change is a date constant and comments, so runtime behaviour is unchanged — but it is a production deployment.

- [ ] **Step 2: Merge**

```bash
gh pr merge --merge --delete-branch=false
```

- [ ] **Step 3: Verify the deployment**

Use the Vercel MCP `list_deployments` tool with `projectId: prj_lT7YZDueA6kzhz2xrPPHFyNsDf8n` and `teamId: team_qvzlsFmfCsLkgItSypqHjw3z`.

Expected: a new deployment with `meta.githubCommitRef` of `release` and `target: "production"`, reaching `state: "READY"`. Record its id.

If it fails to build, promote the previous production deployment in the Vercel dashboard and report.

- [ ] **Step 4: Confirm the constant is live**

```bash
git fetch origin --prune
git show origin/release:lib/email/unsubscribe-token.ts | grep 'LEGACY_UNSUBSCRIBE_SECRET_SUNSET = '
```

Expected: `export const LEGACY_UNSUBSCRIBE_SECRET_SUNSET = "2026-09-10";`

**Phase A is complete. Stop here until 2026-09-10.**

---

# PHASE B — remove the fallback (on or after 2026-09-10)

### Task 8: GATE — confirm the date has passed

**Files:** none modified.

- [ ] **Step 1: Check the date**

```bash
node -e 'const s=Date.parse("2026-09-10T00:00:00Z");console.log(Date.now()>=s?"SAFE - sunset passed":"TOO EARLY - stop")'
```

Expected: `SAFE - sunset passed`.

**If it prints `TOO EARLY`, stop.** Removing the fallback now can invalidate unsubscribe links that are still valid, which is the entire reason the date exists.

- [ ] **Step 2: Refresh the branch onto current `release`**

```bash
git fetch origin --prune
git checkout fix/unsubscribe-sunset
git rebase origin/release
```

Expected: a clean rebase. Phase A's commit is already on `release`, so the branch should end with no unique commits.

---

### Task 9: Write the permanent invariant, and watch it fail

The timer is being deleted, so something must take over keeping the fallback gone. Written first, so it is seen failing against code that still has the fallback.

**Files:**
- Modify: `tests/unit/unsubscribe-secret-rotation.test.ts`

- [ ] **Step 1: Add the invariant**

Inside `describe("the split is real, not aliased")`, immediately after the existing `it.each([...])("%s verifies through the multi-key helper, not a bare secret", ...)` block, add:

```ts
  it.each([
    "lib/api/unsubscribe-route.ts",
    "app/[locale]/(public)/unsubscribe/page.tsx",
  ])("%s no longer verifies against the retired cron secret", (path) => {
    const source = readFileSync(resolve(process.cwd(), path), "utf8");

    // Replaces the sunset timer that used to live at the bottom of this file.
    // The timer could only fire once; this keeps the fallback from returning,
    // which is the property that actually needed guarding.
    expect(source).not.toContain("cronSecret");
  });
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm test -- tests/unit/unsubscribe-secret-rotation.test.ts
```

Expected: **FAIL** twice — once per path — because both files still reference `cronSecret`.

Quote both failures in the task report. This is the RED evidence.

---

### Task 10: Remove the fallback from both call sites

**Files:**
- Modify: `lib/api/unsubscribe-route.ts:120-126`
- Modify: `app/[locale]/(public)/unsubscribe/page.tsx:43-48`

- [ ] **Step 1: The API route**

This currently reads:

```ts
export const POST = createUnsubscribePost({
  // Legacy fallback: links already in inboxes were signed with CRON_SECRET.
  // Remove it after LEGACY_UNSUBSCRIBE_SECRET_SUNSET.
  secrets: () => {
    const env = unsubscribeEnv();
    return [env.unsubscribeTokenSecret, env.cronSecret];
  },
```

Replace with:

```ts
export const POST = createUnsubscribePost({
  secrets: () => [unsubscribeEnv().unsubscribeTokenSecret],
```

The comment goes with the fallback it described. The array shape stays — `verifyUnsubscribeTokenWithAny` is array-first precisely so a future rotation can add a key at the front without touching this call site.

- [ ] **Step 2: The public page**

This currently reads:

```ts
  const payload = query.token
    ? (() => {
      const env = unsubscribeEnv();
      return verifyUnsubscribeTokenWithAny(query.token!, [env.unsubscribeTokenSecret, env.cronSecret]);
    })()
    : null;
```

Replace with:

```ts
  const payload = query.token
    ? verifyUnsubscribeTokenWithAny(query.token!, [unsubscribeEnv().unsubscribeTokenSecret])
    : null;
```

- [ ] **Step 3: Run the test**

```bash
npm test -- tests/unit/unsubscribe-secret-rotation.test.ts
```

Expected: the two invariant cases now **pass**, and the timer test now **fails** — the sunset has passed and it has not yet been removed. That failure is expected here and is resolved in Task 11.

---

### Task 11: Delete the constant and the timer

**Files:**
- Modify: `lib/email/unsubscribe-token.ts`
- Modify: `tests/unit/unsubscribe-secret-rotation.test.ts`

- [ ] **Step 1: Delete the constant and its doc comment**

Remove the entire `/** ... */` block describing the legacy fallback, and the line:

```ts
export const LEGACY_UNSUBSCRIBE_SECRET_SUNSET = "2026-09-10";
```

Leave `verifyUnsubscribeTokenWithAny` and its own doc comment untouched.

- [ ] **Step 2: Delete the timer test block**

Remove the entire final block beginning:

```ts
describe("the legacy fallback deletes itself on schedule", () => {
```

through its closing `});`. Also remove `LEGACY_UNSUBSCRIBE_SECRET_SUNSET` from the import list at the top of the test file.

**Delete nothing else.** The other blocks are real coverage: `"the split is real, not aliased"` pins that `runners.ts` never signs with `cronSecret`, and the call-site assertions pin both files to the multi-key helper.

- [ ] **Step 3: Confirm no dangling references**

```bash
grep -rn 'LEGACY_UNSUBSCRIBE_SECRET_SUNSET' lib/ app/ tests/ --include='*.ts' --include='*.tsx'
```

Expected: no output.

- [ ] **Step 4: Run the test file**

```bash
npm test -- tests/unit/unsubscribe-secret-rotation.test.ts
```

Expected: all pass, including the two new invariant cases.

---

### Task 12: Narrow the env contract

Once nothing verifies against `cronSecret`, requiring `CRON_SECRET` to boot a public unsubscribe page is the transitive coupling `CLAUDE.md`'s feature-scoped env boundary exists to prevent — the class of defect that once made `/sitemap.xml` fail on import.

**Files:**
- Modify: `lib/config/env.ts:40-43` and `lib/config/env.ts:319-326`

- [ ] **Step 1: Narrow the interface**

This:

```ts
export interface UnsubscribeEnv {
  unsubscribeTokenSecret: string;
  cronSecret: string;
}
```

becomes:

```ts
export interface UnsubscribeEnv {
  unsubscribeTokenSecret: string;
}
```

- [ ] **Step 2: Narrow the parser**

This:

```ts
export function parseUnsubscribeEnv(environment: Environment = process.env): UnsubscribeEnv {
  requireProductionKeys(environment, ["UNSUBSCRIBE_TOKEN_SECRET", "CRON_SECRET"]);

  return {
    unsubscribeTokenSecret: valueFor(environment, "UNSUBSCRIBE_TOKEN_SECRET"),
    cronSecret: valueFor(environment, "CRON_SECRET"),
  };
}
```

becomes:

```ts
export function parseUnsubscribeEnv(environment: Environment = process.env): UnsubscribeEnv {
  requireProductionKeys(environment, ["UNSUBSCRIBE_TOKEN_SECRET"]);

  return {
    unsubscribeTokenSecret: valueFor(environment, "UNSUBSCRIBE_TOKEN_SECRET"),
  };
}
```

Leave every other `*Env` interface and parser alone. `automationEnv().cronSecret` is still used by the job routes and must keep working.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: exits 0. A failure means something still reads `unsubscribeEnv().cronSecret`; find it with:

```bash
grep -rn 'unsubscribeEnv()' lib/ app/ --include='*.ts' --include='*.tsx'
```

- [ ] **Step 4: Confirm the env validation still guards the split**

```bash
npm test -- tests/unit/auth-env.test.ts tests/unit/unsubscribe-secret-rotation.test.ts
```

Expected: pass. `lib/config/env.ts` still rejects an `UNSUBSCRIBE_TOKEN_SECRET` shorter than 32 bytes or equal to `CRON_SECRET`; that validation is separate from the parser above and must not be removed.

---

### Task 13: Full verification, commit, and land

**Files:** none beyond Tasks 9–12.

- [ ] **Step 1: Run the checks the CI job runs**

```bash
npm run audit:strings
npm test
npm run lint
npm run typecheck
npm run build
```

Expected: every command exits 0. Record the totals.

- [ ] **Step 2: Commit**

```bash
git add lib/email/unsubscribe-token.ts lib/api/unsubscribe-route.ts \
  "app/[locale]/(public)/unsubscribe/page.tsx" lib/config/env.ts \
  tests/unit/unsubscribe-secret-rotation.test.ts
git commit -m "fix: retire the legacy unsubscribe secret fallback"
```

- [ ] **Step 3: Ask the owner, then push and open the pull request**

```bash
git push origin fix/unsubscribe-sunset
gh pr create --base release --head fix/unsubscribe-sunset \
  --title "fix: retire the legacy unsubscribe secret fallback" \
  --body "Every unsubscribe link signed with CRON_SECRET has now expired -- the last one could stay valid until 2026-09-08 14:32Z, thirty days after the split reached production in e26cde88.

Drops cronSecret from both verification arrays, deletes the sunset constant, and narrows UnsubscribeEnv so a public unsubscribe page no longer requires CRON_SECRET to boot.

The one-shot sunset timer is replaced by a permanent assertion that neither call site references cronSecret, so the fallback cannot quietly return.

Design: docs/superpowers/specs/2026-09-01-unsubscribe-secret-sunset-design.md"
```

- [ ] **Step 4: Wait for CI, then ask the owner before merging**

```bash
gh pr checks --watch
gh pr merge --merge --delete-branch=false
```

- [ ] **Step 5: Verify the production deployment**

Vercel MCP `list_deployments`, `projectId: prj_lT7YZDueA6kzhz2xrPPHFyNsDf8n`, `teamId: team_qvzlsFmfCsLkgItSypqHjw3z`. Expected: a `release` deployment with `target: "production"` reaching `READY`. Record its id.

- [ ] **Step 6: Verify a real unsubscribe link still works**

This is the behaviour the whole sub-project puts at risk. Mint a token with the current secret and confirm the public unsubscribe page accepts it, against the deployment from Step 5. If no test identity is available, record this as **NOT VERIFIED** rather than assuming — do not mark the task complete on unit tests alone.

---

### Task 14: FOLLOW-UP — bring the change to `main`

**Blocked until `docs/superpowers/plans/2026-08-31-land-wisetech-pr2-6-on-main.md` has pushed its final merge.** Applying it earlier changes `main`'s tree and breaks that plan's hash verification.

Not optional. Until this runs, `main`'s copy of the suite fails from 2026-09-06 — untidy while `main` carries no required check, and blocking the moment S1's follow-up adds one.

**Files:**
- Modify: on `main`, the same files this plan changed on `release`

- [ ] **Step 1: Determine which case applies**

```bash
git fetch origin --prune
git rev-parse origin/main^{tree}
git merge-base --is-ancestor origin/release origin/main && echo "release already merged into main" || echo "branches still separate"
```

If the tree is `50195fedb6b070046299237b1b9d50a0195ecb3e`, the landing has completed. If it is anything else, the landing is still in flight — **stop**, and re-run this task later.

- [ ] **Step 2: Case A — `release` already merged into `main`**

If Step 1 printed `release already merged into main`, the change is present already. Confirm and finish:

```bash
git show origin/main:lib/email/unsubscribe-token.ts | grep -c 'LEGACY_UNSUBSCRIBE_SECRET_SUNSET' || true
git show origin/main:lib/api/unsubscribe-route.ts | grep -c 'cronSecret' || true
```

Expected after Phase B: `0` from both. After Phase A only: the constant present and reading `2026-09-10`. No further action.

- [ ] **Step 3: Case B — branches still separate**

Apply the same change directly to `main` by cherry-picking the commits this plan created:

```bash
git checkout main
git reset --hard origin/main
git cherry-pick <phase-A-commit-sha>
```

Add `git cherry-pick <phase-B-commit-sha>` as well if Phase B has landed on `release`. Both SHAs are recorded in the Task 5 and Task 13 reports.

- [ ] **Step 4: Verify the two branches agree**

```bash
git diff origin/release:lib/email/unsubscribe-token.ts lib/email/unsubscribe-token.ts
git diff origin/release:lib/api/unsubscribe-route.ts lib/api/unsubscribe-route.ts
```

Expected: no output from either — the files are identical on both branches.

- [ ] **Step 5: Run the suite, then ask the owner before pushing**

```bash
npm test
git push origin main
```

Expected: suite green, push accepted. If the push is rejected, S1's follow-up has already added a required check to `main`; open a pull request into `main` instead.

---

## What this plan does not do

- **No secret is rotated.** `UNSUBSCRIBE_TOKEN_SECRET` and `CRON_SECRET` keep their values.
- **`main` is not touched.** The landing plan's tree verification is unaffected.
- **Delivery gates 2, 3 and 4 are untouched** — isolated Neon and test identities, Preview/UAT, production approval.
- **The exact last legacy token is not measured.** The 2026-09-10 date rests on a worst-case bound from deployment records, not on job history, which would need database access (sub-project S3).
