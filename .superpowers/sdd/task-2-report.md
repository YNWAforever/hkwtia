# Task 2 Report: Cohort repository and deterministic M6 seed

## Changed files

- `lib/db/repos/cohorts.ts`: actor-scoped public/member/admin repository with a
  dependency-injected `CohortStore`; the Drizzle implementation validates
  member ownership, uses idempotent `(cohort_id, company_id)` inserts, and
  uses a single transaction for the stage audit, application update, and
  `showcase_listings.gone_global` graduation projection.
- `scripts/seed-m6.ts`: deterministic, non-PII M6 fixture with one open cohort,
  three landing partners, five application pairs, environment isolation checks,
  advisory-lock transaction, and stable-ID upserts.
- `package.json`: adds `db:seed:m6`.
- `tests/unit/m6-repository.test.ts`: fake-store authorization, idempotency,
  transition, audit, and graduation-projection coverage.
- `tests/unit/m6-seed.test.ts`: fixture, environment guard, and two-run unique
  application-pair coverage.

## TDD evidence

1. RED: `npm.cmd test -- tests/unit/m6-repository.test.ts` failed because
   `@/lib/db/repos/cohorts` did not exist.
2. GREEN: after the initial repository implementation, the same focused suite
   passed with 5 tests.
3. RED: `npm.cmd test -- tests/unit/m6-seed.test.ts` failed because
   `@/scripts/seed-m6` did not exist.
4. GREEN: the combined focused suite passed with 8 tests after the seed was
   added.
5. RED: the owner/admin authorization regression test initially resolved an
   application for a `member` company role.
6. GREEN: after enforcing owner/admin role resolution, the final focused suite
   passed with 9 tests.

## Final verification

- `npm.cmd test -- tests/unit/m6-repository.test.ts tests/unit/m6-seed.test.ts`
  passed: 2 files, 9 tests.
- `npm.cmd run typecheck` passed.
- `git diff --check` passed.

## Seed idempotency evidence

The seed uses stable IDs, `ON CONFLICT (id)` upserts for cohort, companies, and
partners, and `ON CONFLICT (cohort_id, company_id)` for applications. The
two-run fake-pool test observed 10 application upsert attempts but only 5
distinct `(cohortId, companyId)` pairs. The seed runs only after explicit
`M6_ACCEPTANCE_SEED=true`, matching `DATABASE_URL` and `DATABASE_URL_TEST`,
and rejects Production.

## Self-review

- Public cohort and partner methods project only contract-safe fields; partner
  contacts and notes never leave the repository.
- Member application creation resolves active membership then requires an
  owner/admin company role before it can write.
- Audit metadata contains only the prior and next stage; staff notes remain on
  the private application record.
- A graduated application cannot transition to a non-graduated stage, and the
  transaction never clears `gone_global`.

## Commit

`e7dfce1 feat: add launch pad cohort repository and seed`

## Concerns

No functional concerns. The guarded seed was verified against a fake pool only;
it was intentionally not run against Neon because this task must not mutate a
shared or Production environment.

## Review-fix follow-up

- Added a required, independently configured
  `M6_ACCEPTANCE_DATABASE_HOST_ALLOWLIST`. `assertM6SeedEnvironment` parses the
  database URL and requires its exact hostname to be in that allowlist before
  `runM6Seed` can create a pool. Missing allowlists, untrusted hosts, malformed
  URLs, and Production remain fail-closed.
- Changed `databaseStore.createApplication` to lock and re-read the cohort row
  inside its transaction immediately before inserting. A cohort that is closed,
  archived, missing, or closed concurrently now throws `COHORT_NOT_OPEN` at the
  write boundary; the unique-pair insert remains idempotent.
- Confirmed the agreed fixture lanes remain representative rather than claiming
  to cover every non-terminal enum value: `applied`, `accepted`, `ready`,
  `match`, and `land`. The staff transition flow exercises `scale` and
  `graduated`.

### Review-fix verification

- RED: `npm.cmd test -- tests/unit/m6-repository.test.ts tests/unit/m6-seed.test.ts`
  failed because the seed accepted an absent host allowlist.
- GREEN: the same command passed with 2 files and 11 tests after the allowlist
  and transactional write changes.
- `npm.cmd run typecheck` passed.
