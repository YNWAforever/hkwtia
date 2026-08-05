# M6 Launch Pad Design

## Goal and acceptance boundary

M6 turns the existing Launch Pad placeholder into a bilingual, server-rendered
go-global program surface with a deterministic funding picker, durable cohort
applications, and a staff kanban. It remains isolated to the M6 branch and
does not seed or mutate Production/shared environments.

M6 acceptance requires:

- `/[locale]/launchpad` explains the program, shows cohort calendar data and a
  safe landing-partner map, and provides a five-question funding picker;
- the funding picker evaluates the existing five-scheme rule table on the
  server and displays official links plus the existing terms disclaimer;
- an authenticated company owner/admin can apply to an open cohort, creating a
  durable `cohort_applications` row with a validated stage of `applied`;
- staff, ExCo, and superadmin can use `/[locale]/admin/cohorts` to move an
  application through the approved kanban stages, with every move recorded in
  `audit_events` before the mutation is reported successful;
- a published Showcase listing linked to a graduated application displays a
  localized “Gone Global” badge without exposing application notes or contact
  data.

Out of scope: partner contact editing, payments, cohort billing, automatic
matching, a map provider, file uploads, and new agent tools.

## Options considered

1. **Dedicated relational M6 model with repository-owned transitions (selected).**
   Add `cohorts`, `cohort_applications`, and `landing_partners`, keep the five
   funding rules as the existing deterministic config, and make a repository
   transaction update the stage, audit row, and Showcase graduate projection.
   This satisfies durable workflow and authorization while keeping public data
   separate from private staff notes.
2. **Reuse `membership_applications`.** Smaller migration, but membership
   payment lifecycle and Launch Pad stages have different owners, transitions,
   and audit semantics. Rejected because it would couple unrelated workflows.
3. **Static/client-only applications.** Fast for a visual demo, but it cannot
   prove durable applications, staff audit history, or the graduate badge after
   a reload. Rejected by the acceptance checklist.

## Architecture

### Data model and migration

Migration `0015_m6_launch_pad` adds:

- `cohort_status` enum (`planning`, `open`, `active`, `completed`, `archived`)
  and `cohorts` with a unique slug, bilingual name/description, track,
  `starts_on`, optional `ends_on`, capacity, fee in HKD, status, and timestamps;
- `cohort_application_stage` enum (`applied`, `accepted`, `ready`, `match`,
  `land`, `scale`, `graduated`, `rejected`) and `cohort_applications` with
  cohort/company foreign keys, unique `(cohort_id, company_id)`, stage,
  readiness JSON, private notes, and timestamps;
- `landing_partner_mou_status` enum (`prospect`, `in_discussion`, `signed`,
  `inactive`) and `landing_partners` with public organisation/market/region
  fields plus private contact JSON and notes;
- `showcase_listings.gone_global` boolean defaulting to false. The cohort
  repository sets it transactionally when an application reaches
  `graduated`; public projections expose only the boolean.

Indexes cover cohort status/start date, application cohort/stage/company, and
partner market/status. Existing M0–M5 rows are additive and untouched by the
M6 fixture seed.

### Repository boundaries

`lib/db/repos/cohorts.ts` is the only database boundary for M6:

- anonymous public reads: open/active cohort calendar and safe landing-partner
  projections;
- member reads: an actor's own company applications;
- owner/admin writes: submit one application per company/cohort;
- staff writes: list kanban applications and move stages; the move validates
  the transition, writes the audit event, and updates `gone_global` in one
  transaction.

Every method takes an actor where authorization matters and validates IDs,
stage, readiness, notes, and cohort status with Zod before touching the DB.
Public methods never return application notes, readiness JSON, partner contacts,
or staff audit metadata.

### Public flow

`LaunchPadPage` reads public cohorts and safe partners on the server, then
renders a bilingual calendar and partner cards. The funding picker is a
progressive-enhancement form: its five answers are posted as URL-safe query
parameters, parsed on the server, and passed to
`evaluateFundingEligibility`. Results show only scheme id/name/summary,
official locale-specific URL, `asOf`, and the existing verification disclaimer.
Invalid or incomplete answers render a localized validation state without
calling the rule table.

An authenticated owner/admin submits the selected open cohort through a server
action. The repository resolves the actor-scoped primary company; `companyId`
from the form is never trusted. A duplicate `(cohort, company)` returns the
existing application without creating a second row.

### Staff flow

`/admin/cohorts` renders one column per stage and cards containing only company,
cohort, track, start date, stage, and a bounded readiness summary. A stage
select/form calls a staff-only server action. Invalid transitions return a
generic error; valid transitions revalidate both the admin route and the public
Showcase route. The kanban does not expose partner contact JSON or applicant
messages to the browser.

### Graduate projection

The `graduated` stage is terminal except for an idempotent same-stage update.
When reached, the repository sets `showcase_listings.gone_global = true` for
the same company; the public Showcase query maps that flag to the localized
badge. A later non-graduated stage is rejected rather than silently removing a
public achievement. This keeps the badge durable and prevents accidental
demotion.

## Error handling and security

- All public and authenticated form inputs use bounded Zod schemas; malformed
  IDs, unsupported stages, closed cohorts, and invalid funding answers fail
  closed with localized generic copy.
- Authorization is enforced inside the repository immediately before reads or
  writes. A hidden form field or route segment never grants company or staff
  access.
- Application creation is idempotent on `(cohort_id, company_id)` and does not
  log PII. Audit metadata contains stage names and entity IDs only.
- Landing-partner public data is a curated static projection; private contact
  JSON and notes stay staff-only.
- The funding wizard links to official sources and always displays the current
  terms disclaimer from `config/funding-schemes.ts`; it never claims approval.

## Testing strategy

- schema/contract tests verify enums, foreign keys, unique application scope,
  `gone_global`, and generated migration metadata;
- funding tests cover five fixture answer sets and both locales;
- repository tests prove owner/admin authorization, duplicate application
  idempotency, allowed/blocked stage transitions, audit ordering, and the
  graduate projection;
- component/page tests cover bilingual calendar, partner privacy projection,
  wizard query parsing/results, accessible application form, and kanban cards;
- the M6 acceptance test runs deterministic contracts without credentials and
  skips live Preview browser scenarios unless explicit isolated credentials are
  present; the isolated seed owns only M6 fixture rows.

## Future seam

The repository intentionally separates funding rules, public cohort summaries,
application workflow, and partner projections so a later milestone can add
matching automation or partner editing without widening public data access or
changing the application stage contract.
