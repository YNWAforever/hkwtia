# M4B acceptance

This runbook verifies the Retention Analyst and Board Reporter without using
Production data or delivery providers. The default automated suite is
deterministic: model responses, approval storage, and post storage are
in-memory fakes around the production service boundaries.

## Expected fixture

The fixed acceptance instant is `2030-07-15T02:00:00.000Z` (10:00 Hong Kong).
The previous Hong Kong report month is June 2030.

The isolated fixture contains:

- three qualifying at-risk profiles: one low-and-declining, one inactive
  before renewal, and one matching both branches;
- one active nonqualifying profile;
- six June applications, three activated;
- three June renewal outcomes, two paid and two first-year outcomes, one paid;
- four eligible June event registrations, three attended;
- no Retention Analyst approvals, Board Reporter posts, scheduled-agent runs,
  email log entries, or WhatsApp log entries.

The exact Board Reporter fact pack is:

| KPI | Expected |
| --- | ---: |
| ARR | HKD 10,800 |
| MRR | HKD 900 |
| Renewal rate | 66.7% (2/3) |
| First-year renewal rate | 50% (1/2) |
| Funnel started | 6 |
| Funnel profile completed | 5 |
| Funnel checkout or review | 4 |
| Funnel activated | 3 |
| Attendance rate | 75% (3/4) |
| At-risk members | 3 |

## Safe automated gate

Run the hermetic seed and service acceptance:

```powershell
npm.cmd test -- tests/unit/m4b-seed.test.ts tests/integration/m4b-acceptance.test.ts
```

Expected result: nine tests pass and the two PostgreSQL cases are reported as
skipped. The model is stubbed in this gate; a pass is not evidence that a
provider credential or live model works.

The suite proves:

- the first retention run creates exactly three pending approval records and
  the rerun leaves the count at three;
- no email or WhatsApp delivery boundary is called;
- the first board run creates exactly one unpublished `page` draft and the
  rerun leaves the count at one;
- application-owned KPIs remain exactly the values above;
- both kill switches produce zero candidate/fact reads, model calls, agent
  runs, approvals, and post drafts;
- unauthenticated cron requests return `401` before work begins.

## Isolated PostgreSQL gate

Use a newly created, migrated database or Neon branch containing no unrelated
active memberships. Never reuse Production, a Production clone that contains
member data, or a shared developer database.

The seed requires `M4B_ACCEPTANCE_SEED=true` and refuses both
`NODE_ENV=production` and `VERCEL_ENV=production`. The flag cannot identify a
Production URL by itself: the operator must verify the hostname, project, and
branch before setting `DATABASE_URL`.

```powershell
$env:M4B_ACCEPTANCE_SEED = "true"
$env:RUN_DATABASE_TESTS = "true"
$env:RUN_M4B_ACCEPTANCE_TESTS = "true"
$env:DATABASE_URL_TEST = "<fresh isolated migrated database URL>"
$env:DATABASE_URL = $env:DATABASE_URL_TEST
$env:NODE_ENV = "test"
$env:VERCEL_ENV = "preview"

npm.cmd run db:migrate
npm.cmd run db:seed:m4b
npm.cmd run db:seed:m4b
npm.cmd test -- tests/integration/m4b-acceptance.test.ts
```

The repeated seed is intentional. It must reconcile the same stable profile,
membership, application, event, and renewal-fact IDs without duplicates. It
only removes effects addressed by the three fixed retention request keys, the
fixed June 2030 board source key, or the four acceptance-owned profile IDs.
It does not truncate tables or delete unrelated profiles, memberships, scores,
applications, events, or engagement facts.

Expected result: all six integration tests pass, including the two PostgreSQL
cases. If the PostgreSQL cases still show as skipped, one of the two explicit
run flags was not set. If `DATABASE_URL` and `DATABASE_URL_TEST` differ, the
suite fails before seeding.

After the DB gate, clear the variables:

```powershell
Remove-Item Env:M4B_ACCEPTANCE_SEED -ErrorAction SilentlyContinue
Remove-Item Env:RUN_DATABASE_TESTS -ErrorAction SilentlyContinue
Remove-Item Env:RUN_M4B_ACCEPTANCE_TESTS -ErrorAction SilentlyContinue
Remove-Item Env:DATABASE_URL_TEST -ErrorAction SilentlyContinue
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
Remove-Item Env:VERCEL_ENV -ErrorAction SilentlyContinue
```

## Model and cron gate

Live model calls are deliberately excluded from the default suite. They spend
provider quota and write scheduled-agent runs, approvals, and a page draft.
Only run this section after explicit authorization for external model usage,
and only against the isolated target from the preceding section.

1. Seed once immediately before the run so the M4B effects begin at zero.
2. Configure `AGENTS_ENABLED=true`, an isolated runtime `DATABASE_URL`,
   `CRON_SECRET`, and the approved provider credential. The default model is
   `openai:gpt-4.1-mini`; optional overrides are
   `RETENTION_ANALYST_MODEL` and `BOARD_REPORTER_MODEL`.
3. Start the isolated app, then call each route once with
   `Authorization: Bearer <CRON_SECRET>`:
   `POST /api/jobs/retention-analyst` and
   `POST /api/jobs/board-reporter`.
4. Call both routes again. The job keys and repository keys must leave exactly
   three pending `agent.retention_outreach` approvals and one unpublished
   `page` with source key `board-report:2030-06:board-reporter-v1`.
5. Query `email_log` and `whatsapp_log` for the four
   `m4b-acceptance-*` profiles before and after. Both counts must remain zero.

Do not interpret the dry-run routes as model evidence. `?dryRun=1` verifies
candidate/fact reads and intentionally creates no model run or draft.

## Browser gate

The browser spec is also explicit. Without `PLAYWRIGHT_BASE_URL` and all four
credentials, it reports skipped tests rather than claiming a UI pass. The
target validator permits loopback or an HTTPS Vercel Preview, and rejects the
known Production hostname `hkwtia.vercel.app`.

The browser gate assumes the authorized model/cron gate has already created
the three approvals and one board draft in the isolated database.

For a local target, start the isolated app in one terminal:

```powershell
npm.cmd run dev
```

Then, in another terminal:

```powershell
$env:PLAYWRIGHT_BASE_URL = "http://localhost:3000"
$env:M4B_TEST_STAFF_EMAIL = "<isolated staff account>"
$env:M4B_TEST_STAFF_PASSWORD = "<password>"
$env:M4B_TEST_MEMBER_EMAIL = "<isolated member account>"
$env:M4B_TEST_MEMBER_PASSWORD = "<password>"

npm.cmd run e2e -- tests/e2e/m4b-agents.spec.ts
```

For a Vercel Preview, additionally set
`M4B_E2E_ALLOWED_ORIGIN` to the exact Preview origin. Set
`VERCEL_SHARE_TOKEN` only when Preview Protection requires it.

The browser spec verifies that staff see exactly three Retention outreach
rows, exactly one Board Reporter draft preview, the expected June report, and
no Send or Publish control. A member must receive real `404` responses for
both `/admin/approvals` and `/admin/reports`.

A skipped browser run is an honest non-result. Record it as “not run: target or
credentials unavailable,” not as a pass.

## Production prohibition

No command in this runbook authorizes a Production seed, deployment, provider
call, email, WhatsApp message, approval decision, or page publication. The
acceptance output must remain pending/unpublished and staff-only.
