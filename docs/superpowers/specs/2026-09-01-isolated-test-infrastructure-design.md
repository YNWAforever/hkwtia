# Isolated test infrastructure — design

Date: 2026-09-01 · Status: approved, not implemented · Sub-project **S3**

## Problem

Delivery gate 2 in `docs/integration/wisetech-delivery-gates.md` reads *"isolated Neon/test
identities/providers: NOT PASSED"*, and nothing downstream can move without it. **Five**
migrations — `0019_wisetech_announcements`, `0020_wisetech_partners`, `0021_wisetech_media_upload`
and `0022_wisetech_localized_news` from PR 4, plus `0023_wisetech_event_hero` from PR 5 — are
committed to `main` and applied to no database at all, so the CMS surfaces that shipped with them
have no tables behind them. `release` tops out at `0018_m7_archive`, which is the schema
production currently runs. PR 7's content migration needs somewhere to write. Preview and UAT
need somewhere to point.

Two obstacles stand in the way, and only one of them is provisioning.

### The guard checks a name, not a property

`scripts/lib/acceptance-guard.ts` backs every seed — m2, m3, m4a, m4b, m4c, m5, m6. It requires
`DATABASE_URL_TEST`, refuses production mode, and can enforce a hostname allowlist through
variables like `M6_ACCEPTANCE_DATABASE_HOST_ALLOWLIST`.

The repository states the limit plainly: *"The guard blocks Production-mode execution and
unallowlisted hosts, but it cannot establish that a host is isolated; the operator must confirm
the selected database is isolated before seeding."*

That confirmation is a belief held by a person, checked by nothing. The allowlist is set by the
same operator who might set it wrong, and a mistyped or copy-pasted connection string satisfies
every existing check while pointing somewhere it should not.

This matters because the seeds are destructive by design. `M3_ACCEPTANCE_ALLOW_DESTRUCTIVE`
exists. `db:seed:m6` reconciles fixtures against whatever it finds.

### The inventory is silently incomplete

`.env.example` declares 78 variables, including `M2_TEST_*` and `M3_TEST_*`. It omits at least
five that the README and the seed scripts require:

- `M5_ACCEPTANCE_EMAIL`
- `M5_ACCEPTANCE_PASSWORD`
- `M6_TEST_MEMBER_EMAIL` / `M6_TEST_MEMBER_PASSWORD`
- `M6_TEST_STAFF_EMAIL` / `M6_TEST_STAFF_PASSWORD`
- `M6_ACCEPTANCE_DATABASE_HOST_ALLOWLIST`

Anyone provisioning from `.env.example` today discovers the gaps one failed acceptance run at a
time.

## Context that shapes this design

**Production holds no real member data.** The redesign has never been cut over, there is no custom
domain, and the platform is pre-launch. A Neon branch of production therefore carries a realistic
schema and disposable contents, not real people's profiles, billing records or email addresses.

Were that untrue, this design would look different — scrubbing, exclusion from any environment
that sends email, and separate approval for the destructive flags. It is recorded here because the
choice depends on it: **if production ever gains real members, branching it for testing must be
revisited.**

## Goal

Provision a disposable Neon branch, test identities and Stripe test-mode configuration, and make
"this database is isolated" a property the code verifies rather than an assertion the operator
makes.

**Non-goals.** Applying migrations to production; PR 7's content migration and SEO work; the
cutover; delivery gates 3 and 4.

## Design

### 1. Plant a sentinel, and make the guard require it

At provisioning time, write a marker into the test database recording that it is designated
disposable — when it was designated, and by whom. `scripts/lib/acceptance-guard.ts` then refuses
to run unless it reads that marker.

Production can never satisfy this, because nobody would plant one there. The check converts *"I
believe this host is safe"* into *"this database has been explicitly designated destructible"* —
which survives a mistyped allowlist, a stale `.env.local`, and a connection string pasted from the
wrong Neon branch. It fails closed.

The alternative considered was comparing the test host against production's, on the model of
`M3_ACCEPTANCE_EXPECTED_DB_HOST`. It is weaker: it requires knowing production's host, and it
passes for any database that merely isn't production — including a colleague's, or a shared
staging instance.

The marker lives in its own single-row table, added by an additive migration. If a schema addition
for a safety property is unwelcome, a Neon branch tag or a config row would carry the same
information; the design's requirement is that the guard reads something planted deliberately, not
where it is stored.

The guard change is additive: existing checks stay, and the sentinel is one more condition.

### 2. Complete the inventory

Add the five missing variable names to `.env.example`, names only, no values — matching the file's
existing convention. This is small and unglamorous, and it is the difference between provisioning
from a document and provisioning by trial and error.

### 3. Provision

- **A Neon branch from production**, migrated with `npm run db:migrate`. This applies the four
  outstanding migrations for the first time, against a disposable database — which is precisely
  what D5's rules require of a migration's first run.
- **Neon Auth test identities** for the staff, member and company-admin roles the M2, M3, M5 and
  M6 suites need. Test-only accounts, never production credentials.
- **Stripe test-mode configuration**: `STRIPE_TEST_SECRET_KEY`, `STRIPE_TEST_WEBHOOK_SECRET`,
  `STRIPE_TEST_STARTUP_PRICE_ID`, `STRIPE_TEST_CORPORATE_PRICE_ID`. Test mode throughout; the
  production Stripe variables stay separate and untouched.

No value is committed to the repository at any point.

### 4. Verification

Three checks, ordered by what they actually prove:

1. **The sentinel blocks.** Point the guard at a database without a marker and observe it refuse.
   A guard that has never rejected anything is a claim, not evidence — the same standard applied
   to the branch rulesets, which were each proven by an observed rejection.
2. **A currently-skipping acceptance suite runs end to end and passes.** Several skip today for
   want of `DATABASE_URL_TEST`; at least one must now genuinely execute.
3. **`db:migrate` applies all five new migrations cleanly.** This is the first time any of them
   runs anywhere.

### The down path cannot be tested, and that is a conflict worth recording

D5's migration rules require migrations to be *"reversible, with the down path tested"*. **This
repository has no down migrations and no tooling for them.** All 23 files in `drizzle/` are
forward-only, and `scripts/db-migrate.ts` contains no reverse path. The rule cannot be satisfied
as written, by these five or by any migration that came before them.

For the test database this does not matter, because Neon supplies a better reversal than a down
migration would: **discard the branch and cut a new one.** That is genuinely reversible, and it is
what this design relies on.

For production it matters a great deal, and this design does not solve it. Whenever these
migrations are applied to production, they will have no tested reverse path — so the rollback is a
database restore, not a schema downgrade, and that must be planned before the cutover rather than
discovered during it. Recorded here as a conflict for a human to rule on, not resolved.

## Risks

| | |
|---|---|
| **The sentinel is only as good as its planting** | If provisioning plants a marker in the wrong database, the guard authorises exactly the wrong target. It narrows the window — one deliberate act instead of every subsequent run — but does not eliminate it. |
| **A branch of production inherits production's schema drift** | If production's schema has diverged from what `drizzle/` expects, the branch inherits that, and `db:migrate` may fail or behave unexpectedly. Verification step 3 surfaces this rather than hiding it. |
| **Pre-launch is a fact with an expiry date** | The whole privacy argument rests on production having no real members. That stops being true at launch. Recorded in Context above as a condition to revisit, not a permanent property. |
| **Credential handling is the operator's** | The design specifies what to provision, not how to store it. No value enters the repository; `.env.local` and the Vercel project settings remain the mechanisms, as `README.md` already documents. |

## Relationship to the delivery gates

S3 closes gate 2 — isolated Neon, test identities and providers.

It does not touch gate 3 (Preview/UAT) or gate 4 (production approval), though it is a
prerequisite for both: UAT needs somewhere isolated to point. Gate 1 is closed. Gate 5 is
sub-project S2, whose Phase A is live and whose Phase B is gated to 2026-09-10.

## Verification record

Confirmed 2026-09-01 from the repository at `origin/main` (`96e9e84`):
`scripts/lib/acceptance-guard.ts` requires `DATABASE_URL_TEST` and supports an optional host
allowlist, and is referenced by the seed scripts for m2/demo, m3, m4a, m4b, m4c, m5 and m6.
`.env.example` declares 78 variables and omits the five listed above. `drizzle/` on `main` holds
23 migrations; `origin/release` holds 18, topping out at `0018_m7_archive`. The five in between —
`0019_wisetech_announcements`, `0020_wisetech_partners`, `0021_wisetech_media_upload`,
`0022_wisetech_localized_news` and `0023_wisetech_event_hero` — are applied nowhere. None of the
23 has a down migration, and `scripts/db-migrate.ts` contains no reverse path.

Authored on branch `feat/isolated-test-infrastructure`, created from `main` (`96e9e84`).
