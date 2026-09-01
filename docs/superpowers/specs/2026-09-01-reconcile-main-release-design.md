# Reconciling `main` and `release` — design

Date: 2026-09-01 · Status: approved, not implemented

## Problem

`main` and `release` have diverged in three files, and the divergence has a deadline attached.

The WiseTech front end landed on `main` on 2026-09-01 as five merges (`245d632` … `3a5f780`, tree
`50195fed…`). Separately, two fixes landed on `release`: the CI trigger extension (PR #26) and the
unsubscribe sunset correction (PR #27). Neither reached `main`, because applying them earlier
would have broken the landing plan's tree-hash verification.

| File | On `main` | On `release` |
|---|---|---|
| `.github/workflows/ci.yml` | `branches: [main]` | `branches: [main, release]` |
| `lib/email/unsubscribe-token.ts` | `SUNSET = "2026-09-06"` | `SUNSET = "2026-09-10"` |
| `tests/unit/ci-security-contract.test.ts` | `normalizeNewlines` / `mutateFixture` helpers | line-ending normalisation plus broadened trigger assertions |
| `tests/unit/unsubscribe-secret-rotation.test.ts` | failure message says `serverEnv().cronSecret` | says `unsubscribeEnv().cronSecret` |

Two consequences.

**`main`'s suite goes red on 2026-09-06.** Its copy of the sunset constant is the uncorrected one,
so the self-detonating test fires there in five days. `main` carries no required check today, so
this blocks nothing — but it turns the suite red for anyone running it, and it blocks everything
the moment a required check is added.

**The cutover merge conflicts.** Verified by a throwaway merge of `main` into `release`:

```
CONFLICT (content): Merge conflict in tests/unit/ci-security-contract.test.ts
```

## A claim this design corrects

Earlier work — `docs/superpowers/specs/2026-08-31-ci-guards-production-design.md` §3 and its
plan — asserted that merging `main` into `release` at cutover would *silently strip CI from
production*, and made syncing the workflow a precondition on that basis.

**That was wrong, and it was asserted without being tested.** The same throwaway merge shows both
`release` values surviving intact:

```
ci.yml after merge:   branches: [main, release]
sunset after merge:   "2026-09-10"
```

`main` never modified either file; it kept the merge-base version while `release` changed it, so a
three-way merge takes `release`'s side. The reconciliation is still worth doing — for the red
suite and the conflict above — but not for the reason originally given.

## Goal

Make `main` and `release` agree on the three divergent files, so `main`'s suite stays green
through 2026-09-06, `main`'s CI configuration is correct in its own terms, and the eventual
cutover merge is conflict-free.

**Non-goals.** The cutover itself; applying the four unapplied migrations; delivery gates 2–4;
sub-project S3.

## Design

### 1. Workflow and constant — take `release`'s side

`.github/workflows/ci.yml` on `main` becomes `branches: [main, release]` for both `pull_request`
and `push`. `lib/email/unsubscribe-token.ts` on `main` takes `release`'s constant `2026-09-10` and
its full doc comment, including the deploy-date evidence.

`tests/unit/unsubscribe-secret-rotation.test.ts` on `main` takes `release`'s corrected failure
message, which tells its reader to drop `unsubscribeEnv().cronSecret` rather than
`serverEnv().cronSecret`. There is no `serverEnv()` — env access is feature-scoped — and that text
is read at precisely the moment someone acts on it.

None of these three is contentious: `main` has no competing version, only the older one.

### 2. The contract test — keep `main`'s mechanism, re-apply `release`'s assertions

This is the only judgement call, because the same bug was fixed twice, independently.

`main` carries commit `57182c9 "test: make gate mutations line-ending neutral"`, which introduced:

```ts
function normalizeNewlines(value: string) { … }

function mutateFixture(label: string, fixture: string, needle: string, replacement: string) {
  expect(normalizedFixture.includes(normalizedNeedle), label + " mutation needle was not found").toBe(true);
  …
  expect(mutatedFixture, label + " fixture mutation unexpectedly no-op").not.toBe(normalizedFixture);
}
```

`release` carries a later, independent fix of the same defect: normalising the workflow text at
read time inside one `it` block.

**`main`'s version wins.** It is strictly better. Both make the mutation match a CRLF file, but
`main`'s also asserts that the needle was found and that the mutation was not a no-op — so the
precise failure mode encountered (a `replace` matching nothing, leaving the mutated fixture
identical, and the assertion failing for a reason that names nothing useful) becomes impossible to
have silently, and reports its own cause. It also covers a second file,
`tests/unit/wisetech-delivery-gates.test.ts`, which `release`'s fix does not.

`release`'s normalisation is therefore **discarded**, not merged.

But `release`'s copy also carries two things `main`'s does not, and both are wanted:

- `workflowTriggerBranches(workflow, event)`, which parses the branch list for an event;
- assertions that the `pull_request` **and** `push` trigger lists each *contain* both `main` and
  `release` — replacing an assertion that matched the literal string `[main]`, and closing a gap
  where nothing pinned the `push` trigger at all.

Those are re-applied on top of `main`'s helpers. The resulting file has `main`'s mutation
machinery and `release`'s trigger coverage.

The broadened assertion is also a precondition for §1: once `main`'s workflow reads
`[main, release]`, an assertion pinning the literal `[main]` fails. The two changes must land
together.

### 3. Route

A branch and a pull request into `main`, not a direct push.

`main`'s ruleset permits direct pushes today, and the landing used them. This change is different:
it edits a security contract test and resolves a conflict by discarding one of two competing
fixes. That deserves a reviewable diff. Once S1 Task 12 adds a required check to `main`, pull
requests become mandatory regardless.

### 4. Acceptance

- `main`'s full suite green, with `branches: [main, release]` in place — this specifically
  exercises the broadened assertion against the new workflow.
- `lib/email/unsubscribe-token.ts` on `main` reads `2026-09-10`.
- `tests/unit/ci-security-contract.test.ts` on `main` contains `mutateFixture` **and**
  `workflowTriggerBranches`.
- **A repeat of the cutover probe** — merging `main` into `release` on a throwaway branch —
  completes with **no conflict**. This is the proof the reconciliation worked, and it is cheap.

## Risks

| | |
|---|---|
| **Discarding a working fix** | `release`'s normalisation is removed rather than merged. If `main`'s `mutateFixture` turns out not to cover a case `release`'s did, the CRLF bug returns. Mitigated by running the suite on a CRLF working tree, which is the hostile case, before landing. |
| **The two changes are coupled** | The workflow change and the broadened assertion must land in the same commit; either alone leaves `main` red. |
| **Time pressure is real but modest** | `main` goes red on 2026-09-06, five days out. Nothing is blocked by that today, so this is not an emergency — but it is the last cheap moment to do it. |
| **The conflict may recur** | If further work lands on `release` before the cutover, new divergence can appear. The acceptance probe proves the state at the time it runs, not for all time. |

## Verification record

Confirmed 2026-09-01: `origin/main` is `3a5f780`, tree `50195fed…`; `origin/release` is `9f5e51d`;
their merge-base is `08c8a46`. A throwaway merge of `main` into `release` preserved
`branches: [main, release]` and `SUNSET = "2026-09-10"`, and conflicted only in
`tests/unit/ci-security-contract.test.ts`. `main`'s copy of that file traces to `57182c9`
(2026-08-28), which predates the `release` fix.

Authored on branch `chore/reconcile-main-release`, created from `origin/main` (`3a5f780`).
