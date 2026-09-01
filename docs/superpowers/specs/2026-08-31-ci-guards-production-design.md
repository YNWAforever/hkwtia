# Make CI guard production — design

Date: 2026-08-31 · Status: approved, not implemented · Sub-project **S1**

## Problem

Production has no continuous integration and no protection.

`release` is now both the repository's default branch and Vercel's production branch. But
`.github/workflows/ci.yml` triggers only on `main`:

```yaml
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
```

So every push to `release` — and advancing `release` *is* the production cutover — runs no tests,
no lint, no typecheck, no build, and no string audit. `gh run list --branch release` returns
nothing, and under this configuration always will.

Neither branch has protection. `GET /repos/YNWAforever/hkwtia/branches/{release,main}/protection`
returns 404 for both, and `GET /rulesets` returns `[]`.

This also misdirects a delivery gate. `docs/integration/wisetech-delivery-gates.md` requires
branch protection with the `quality` check **on `main`**. Since production moved to `release`,
satisfying that gate exactly as written would protect the staging branch and leave production
open. And because `release` is the default branch, `gh pr create` now targets production unless
told otherwise.

## What is true today

- Default branch: `release`. Confirmed by `GET /repos/YNWAforever/hkwtia` → `default_branch`.
- Repository visibility: **public** (`private: false`). This makes classic branch protection free,
  but the visibility may be reverted — see Assumptions.
- No branch protection on `release` or `main`; no rulesets.
- CI is functional again as of 2026-08-31: run `33406192934` on `main` passed every step of the
  `quality` job in 4m59s — `npm ci`, the peer-closure check, `audit:strings`, `test`, `lint`,
  `typecheck`, `build`, `npm audit`. Before that, runs failed in ~3s because GitHub Actions
  billing had lapsed, meaning **no CI ran for the entire WiseTech integration**.
- `main` is mid-landing at `245d6329` locally, one verified merge ahead of the remote, with four
  merges still to push under
  `docs/superpowers/plans/2026-08-31-land-wisetech-pr2-6-on-main.md`.

The `wisetech-delivery-gates.md` note that "the private repository's current GitHub plan/API
cannot enable the required rules" is **stale**: the repository is public, and rulesets are in any
case the mechanism chosen here.

## Goal

Bring production under the same check that already guards the integration branch, and protect it
from force-push and deletion — without stalling the landing that is already in flight.

**Non-goals.** The remaining four merges of the landing plan; PR 7 content migration; isolated
test infrastructure; the 2026-09-06 unsubscribe fallback; the production cutover itself. S1
closes delivery gate 1 and nothing else.

## Design

### 1. Extend the workflow triggers

```yaml
on:
  pull_request:
    branches: [main, release]
  push:
    branches: [main, release]
```

Nothing else in the workflow changes. The `quality` job, its steps, and the concurrency group
stay as they are.

### 2. Land it on `release`, self-validating

For a push to `release` to run CI, the workflow file **on `release`** must list `release`. The
change therefore has to reach production, and that first push is necessarily unguarded.

The resolution is to land it through a pull request rather than a push. Branch
`ci/guard-release` from `release` (`08c8a46`), make the one-line change, and open a PR into
`release`. For same-repository pull requests GitHub evaluates workflows from the merge ref — head
merged into base — which already contains the new triggers. So CI runs on the very PR that
introduces it, and the change proves itself before it lands.

Merging that PR redeploys production. The only content difference is `.github/workflows/ci.yml`,
which the Next.js build does not read, so production rebuilds to identical output. It is a
production deployment nonetheless, and should be recorded as one.

### 3. Defer the same change on `main`, and make the sync a cutover precondition

`main` must eventually carry the identical trigger block, or the two branches drift. It does not
get it yet.

Applying it now would change `main`'s tree and break the starting hash `5f516cd3…` that Task 7 of
the landing plan verifies against, invalidating that plan's central safeguard. So the change goes
to `main` only after the landing completes.

That deferral creates an obligation. At cutover, `main` merges into `release`. If `main`'s
workflow still lacks the `release` trigger at that moment, the merge **silently removes CI from
production** — the exact condition S1 exists to fix, reintroduced by the act of shipping.

**Therefore: both branches' copies of `.github/workflows/ci.yml` must contain identical `on:`
blocks before any merge into `release`.** This is a precondition of the cutover, owned by S6, and
must be asserted rather than assumed.

### 4. Rulesets

Rulesets rather than classic branch protection, because they remain available if the repository
is made private again.

| Branch | Rules |
|---|---|
| `release` | Require a pull request before merging · require status check `quality` · block force-push · block deletion · no bypass actors |
| `main` | Block force-push · block deletion |

`main` deliberately does **not** get a required status check yet. Required checks block direct
pushes — the push is rejected because the check has not run on a commit that does not yet exist —
and the landing plan pushes its four remaining merges directly to `main`. Adding the required
check to `main` is a follow-up once those merges have landed.

The asymmetry is the point: protect what is exposed. `release` is production and the default
branch; `main` is a staging branch mid-operation.

### 5. Verification

- CI observed running on the `ci/guard-release` pull request, proving the trigger works.
- After merge, a push to `release` observed producing a `quality` run — `gh run list --branch release`
  non-empty for the first time.
- A direct push to `release` observed being **rejected** by the ruleset.
- `gh api repos/YNWAforever/hkwtia/rulesets` lists both rulesets with the rules above.
- `main` still accepts a direct push, confirming the landing is not blocked.

### 6. Rollback

Delete the two rulesets via `DELETE /repos/YNWAforever/hkwtia/rulesets/{id}`. Revert the workflow
commit on `release` with a further pull request. Production content is unaffected either way,
since the workflow file does not enter the build.

### 7. Follow-ups, owned by S1

Two items are deferred rather than dropped. Both are S1's responsibility and both unblock only
once the landing plan has pushed its final merge:

1. **Sync `main`'s workflow** to the identical `on:` block, so a later merge into `release` cannot
   strip the trigger.
2. **Add the required `quality` check to `main`'s ruleset**, bringing it to parity with `release`
   now that direct pushes are no longer needed.

Neither may be closed silently. S1 is not complete until both are done or explicitly reassigned.

## Assumptions and risks

| | |
|---|---|
| **Workflow resolution for pull-request events** | The self-validating PR in §2 depends on GitHub evaluating workflows for same-repository `pull_request` events from the merge ref, so that the head's updated triggers apply to the PR that introduces them. Verify this on the first PR: if no `quality` run appears, the trick does not hold and the change must be landed on `release` unguarded and validated by the push that follows. The failure mode is a weaker sequence, not a broken branch. |
| **Rulesets on free private repositories** | Rulesets were chosen so that reverting the repository to private does not break the gate. Confirm at implementation time. If ruleset creation is unavailable while private, record gate 1 as **unmet** — do not silently downgrade to a weaker rule. |
| **`release` is the default branch** | `gh pr create` and the GitHub UI now target production by default. Requiring a pull request prevents accidental *pushes*; it does not prevent an accidental *PR*. Reviewers must check the base branch. |
| **One production deployment** | Merging the PR redeploys production from a workflow-only diff. Content-identical, but it is a deploy and belongs in the evidence record. |
| **Public visibility** | Recorded as current state, not relied upon. The ruleset approach is specifically what makes S1 independent of it. |
| **Required check on `main` is deferred** | Between now and the end of the landing, `main` accepts direct pushes with no check enforcement. CI still *runs* on every such push; it simply is not blocking. |

## Relationship to the delivery gates

S1 closes gate 1 of the five in `docs/integration/wisetech-delivery-gates.md`, and corrects its
wording: the gate names `main`, which is no longer production.

It does not touch gates 2–5 — isolated Neon and test identities, Preview/UAT, production
approval, and the 2026-09-06 unsubscribe fallback. Gate 5 falls six days after this spec was
written and, once `quality` is a required check, an unresolved fallback will block every merge
into `release`. That is sub-project S2 and is deliberately out of scope here.

## Verification record

Confirmed 2026-08-31 via the GitHub API: `default_branch` is `release`; `private` is `false`;
branch protection returns 404 for both `release` and `main`; `rulesets` returns `[]`;
`gh run list --branch release` returns no runs; CI run `33406192934` on `main` completed
`success` in 4m59s with all eight steps green.

Authored on branch `ci/guard-release`, created from `release` (`08c8a46`), so that `main` remains
at the tree the in-flight landing plan verifies against.
