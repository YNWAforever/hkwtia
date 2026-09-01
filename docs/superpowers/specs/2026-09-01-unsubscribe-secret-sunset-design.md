# Unsubscribe legacy-secret sunset — design

Date: 2026-09-01 · Status: approved, not implemented · Sub-project **S2**

## Problem

`UNSUBSCRIBE_TOKEN_SECRET` was split out of `CRON_SECRET`, leaving a dual-verify fallback so that
unsubscribe links already in inboxes — signed with the old key — kept working until they expired.
The fallback is due for removal on a date pinned in code:

```ts
// lib/email/unsubscribe-token.ts:47
export const LEGACY_UNSUBSCRIBE_SECRET_SUNSET = "2026-09-06";
```

A deliberately self-detonating test fails once that date passes, so the removal cannot be
forgotten. That test is well built and is doing its job.

**The date is wrong.** It was computed from the commit date rather than the deploy date, and it is
roughly three days early.

Tokens carry a 30-day TTL (`UNSUBSCRIBE_TTL_SECONDS`, `lib/jobs/runners.ts:58`), and
`verifyUnsubscribeToken` rejects on `payload.exp <= now` regardless of which key matched. So legacy
links are not kept alive by the fallback — they die on their own expiry. What matters is when
legacy *signing* stopped in production.

| | |
|---|---|
| Split committed (`12f1975`) | 2026-08-06 14:29Z |
| Earliest production deploy containing it (`e26cde88`, PR #10) | **2026-08-09 14:32Z** |
| Worst-case last legacy token expiry (+30 days) | **2026-09-08 14:32Z** |
| `LEGACY_UNSUBSCRIBE_SECRET_SUNSET` as written | 2026-09-06 00:00Z |

Every production deployment in the recorded window already contains the split, so 2026-08-09 is an
*upper* bound — the true stop could only be earlier, which would only make removal safer.

Two consequences follow. Removing the fallback on 2026-09-06 could invalidate legacy links that
remain valid for a further ~2.6 days. And the test's own failure message asserts *"Every link
signed with the old key has now expired"*, which on that date is false.

Meanwhile the test starts failing on 2026-09-06 either way. Once sub-project S1 makes `quality` a
required check on `release`, that failure blocks every merge into production. So an incorrect date
creates a window in which CI is red and removal is still unsafe.

## Goal

Remove the legacy fallback at a date that is actually safe, without leaving CI red in the interval.

**Non-goals.** Rotating any secret; changing the token TTL or the signing scheme; the other four
delivery gates; anything requiring database access.

## Design

### S2a — correct the constant (must land before 2026-09-06)

`LEGACY_UNSUBSCRIBE_SECRET_SUNSET` becomes **`2026-09-10`** — the worst-case expiry of
2026-09-08 14:32Z plus approximately the same margin the original author intended.

The doc comment above it records the arithmetic and its evidence — production deploy `e26cde88`
at 2026-08-09 14:32Z — so the next reader can check the date rather than trust it. The comment
currently derives the date from "the deploy" without naming one; that omission is what allowed the
commit date to be used by mistake.

The failure message inside the test needs the same correction, since it asserts every legacy link
has expired.

Nothing else changes. The fallback stays exactly as it is, and no behaviour changes.

The margin is deliberately modest rather than generous. While the fallback stands, a leaked
`CRON_SECRET` can forge a valid unsubscribe token for another member. Minting is unaffected — the
`"the split is real, not aliased"` test pins that `lib/jobs/runners.ts` signs only with
`unsubscribeTokenSecret` — so the exposure is limited to forged unsubscribes, but it is not zero
and does not deserve an open-ended extension.

### S2b — remove the fallback (on or after 2026-09-10)

Four changes:

1. Drop `env.cronSecret` from the secrets array in `lib/api/unsubscribe-route.ts:126`.
2. Drop it from the secrets array in `app/[locale]/(public)/unsubscribe/page.tsx:46`.
3. Delete `LEGACY_UNSUBSCRIBE_SECRET_SUNSET` and its doc comment from
   `lib/email/unsubscribe-token.ts`.
4. Remove `cronSecret` from `UnsubscribeEnv` and `parseUnsubscribeEnv`
   (`lib/config/env.ts:319`), so `requireProductionKeys` no longer demands `CRON_SECRET` for the
   unsubscribe surface.

Item 4 is not in the original instructions but follows from `CLAUDE.md`'s feature-scoped env
boundary. Once nothing verifies against `cronSecret`, requiring it to boot a public unsubscribe
page is exactly the transitive coupling that boundary exists to prevent — the class of defect that
once made `/sitemap.xml` fail on import.

`verifyUnsubscribeTokenWithAny` keeps its array shape. It was written array-first precisely so a
key can be dropped from the back without touching a call site, and a future rotation will need it
again.

### The test: replace the timer, do not merely delete it

The repository instructs deletion of the test; `docs/wisetech-merge-rules.md` forbids deleting
tests. Both are satisfiable, because only one `describe` block is a timer.

**Deleted:** `describe("the legacy fallback deletes itself on schedule")` — a scheduled reminder
whose entire designed lifecycle is to fire once and be removed. Deleting it after acting on it is
that lifecycle completing, not a check being evaded.

**Kept, unchanged:** everything else in `tests/unit/unsubscribe-secret-rotation.test.ts`. That file
holds real coverage — `"the split is real, not aliased"` pins that `runners.ts` never signs with
`cronSecret`, and two parameterised assertions pin both call sites to the multi-key helper. None of
it is date-dependent.

**Added:** a permanent invariant asserting that neither call site references `cronSecret`. This
converts a one-shot reminder into a standing guarantee that the fallback cannot quietly return, so
coverage increases rather than decreases. It reuses the shape of the existing call-site assertions
in the same file.

### Sequencing and branch placement

S2a must reach **`release`** before 2026-09-06, through a pull request — the same pattern S1 uses,
and for the same reason: `release` is production, and once S1 lands, a red suite there blocks every
merge into it.

S2a must **not** go to `main` while the landing is mid-execution. Adding a commit changes `main`'s
tree and breaks the hash verification in
`docs/superpowers/plans/2026-08-31-land-wisetech-pr2-6-on-main.md`. `main` carries no required
check under S1's design, so a red suite there from 2026-09-06 is untidy but not blocking.

Which route S2a takes to `main` therefore depends on one condition, checked at the time:

- **Landing finished** (`origin/main` tree is `50195fed…`) — apply S2a directly to `main`, in the
  same pass that syncs S1's workflow change. No hash is at stake once the plan has completed.
- **Landing still in flight** — leave `main` alone and let S2a arrive with the eventual merge from
  `release`, accepting a red `main` suite in the interval.

S2b runs on or after 2026-09-10 and faces the same fork. If the cutover has happened by then,
`main` and `release` share history and one change reaches both. If it has not, S2b lands on
`release` by pull request exactly as S2a did, and on `main` under the same condition above.

## Risks

| | |
|---|---|
| **The 2026-08-09 bound comes from deployment records** | It is an upper bound and the records are internally consistent, but if a deploy propagated materially later than its recorded timestamp, the safe date moves later too. The margin absorbs hours, not days. |
| **Precision requires job history** | The exact last legacy-signed token could be established from campaign or job records, which needs database access — sub-project S3. It would likely show the risk is already nil, but it is not a prerequisite and this design does not wait for it. |
| **S2a is time-boxed** | If it does not land before 2026-09-06, CI goes red on `release`. The work is a one-line constant and two comment edits, so the risk is scheduling, not difficulty. |
| **Deleting a test needs ratification** | Recorded here rather than assumed: the timer block is removed and replaced by a stronger permanent assertion. Approved as part of this design. |

## Relationship to the delivery gates

S2 closes gate 5 of `docs/integration/wisetech-delivery-gates.md` — "6 September 2026 unsubscribe
fallback deadline" — and corrects the date that gate names.

It does not touch gates 2, 3 or 4. Gate 1 is sub-project S1, in flight.

## Verification record

Confirmed 2026-09-01 from the repository and the Vercel deployment records for
`prj_lT7YZDueA6kzhz2xrPPHFyNsDf8n`: the split commit `12f1975` is dated 2026-08-06 14:29Z; every
production deployment on record from `e26cde88` (2026-08-09 14:32Z) onward contains it;
`UNSUBSCRIBE_TTL_SECONDS` is 30 days; both call sites are `lib/api/unsubscribe-route.ts:126` and
`app/[locale]/(public)/unsubscribe/page.tsx:46`, as the existing doc comment states.

Authored on branch `fix/unsubscribe-sunset`, created from `release` (`08c8a46`), so that `main`
remains at the tree the in-flight landing plan verifies against.
