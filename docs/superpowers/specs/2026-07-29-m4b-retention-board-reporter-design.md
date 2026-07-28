# M4B Retention Analyst and Board Reporter Design

**Status:** Approved for implementation planning

**Milestone:** M4B, the second delivery slice of M4 AI-Ops

**Branch base:** M4A HEAD `5f36d31`

## Purpose

M4B adds the two scheduled agents required by the build specification:

1. Retention Analyst runs nightly over the deterministic at-risk queue and
   creates approval-gated outreach drafts.
2. Board Reporter runs monthly over reconciled membership KPI queries and
   creates an unpublished page draft for staff review.

Both agents reuse the provider-neutral M4A runtime, telemetry, model pricing,
global kill switch, provider adapters, structured validation, and audit
boundaries. Neither agent may send a message, publish content, select its own
data sources, or mutate membership, billing, roles, approval decisions, or KPI
facts.

M4B remains one specification and one delivery branch. Implementation is
ordered: Retention Analyst first, then Board Reporter, then shared acceptance
and Preview verification.

## Milestone Boundaries

M4 is delivered in three ordered slices:

1. M4A: runtime, Concierge, guarded tools, web and WhatsApp channels, evals,
   and transcript retention.
2. M4B: Retention Analyst and Board Reporter.
3. M4C: public AI-Ops aggregates, renewal trend, architecture and build-log
   sections, and the full protected-Preview M4 acceptance gate.

M4B does not replace the public `/ai-ops` preview state, publish Board Reporter
drafts, implement Showcase or Launch Pad, or claim the M4 milestone complete.

## Goals

- Produce one pending outreach approval for every currently eligible at-risk
  member, with deterministic selection and no direct email send.
- Produce one Board Reporter draft for each completed Hong Kong calendar
  month, with KPI values derived only from reconciled report queries.
- Record every provider-backed candidate or report attempt in `agent_runs`,
  including status, provider, model, tokens, cost, latency, and a
  PII-minimized summary.
- Make nightly and monthly dispatch safe under retries, concurrency, provider
  failures, and Worker redelivery.
- Give staff a bilingual, authorized interface for reviewing Retention
  approvals and Board Reporter drafts.
- Keep provider and live-resource use explicitly gated in tests and Preview.

## Non-goals

- The model does not decide which members are at risk.
- The model does not query arbitrary SQL or choose report formulas.
- The model does not send email, approve or reject an approval, publish a
  post, change a membership, change billing, or assign a role.
- M4B does not add an autonomous outreach cadence or replace the existing
  journey and campaign automation system.
- M4B does not expose member-level or agent-run PII on a public route.
- M4B does not implement the public M4C dashboard, materialized aggregates, or
  renewal chart.

## Architectural Decision

M4B uses constrained scheduled agents.

Deterministic repositories build immutable fact packs. The runtime receives
only those packs and returns schema-validated prose. Application code owns
candidate selection, KPI values, idempotency, side effects, and final
rendering. This preserves the personalization and vendor-neutral AI-Ops story
without allowing the provider to control recipients, numbers, or publication.

Two rejected alternatives are:

- Fully deterministic templates. This is safe but does not satisfy the
  scheduled-agent product behavior or provide meaningful bilingual narrative
  generation.
- Autonomous tool-calling agents. This adds avoidable authorization, privacy,
  cost, and reproducibility risks and permits the model to influence
  recipients or facts.

## Shared Runtime Contract

The existing runtime gains two agent identifiers:

- `retention_analyst`
- `board_reporter`

Each scheduled run uses an automation-system actor with no member privileges
and a fixed agent identity. `agent_runs.conversation_id` remains null. The
runtime retains the M4A maximum of eight steps, zero automatic provider
retries, cost calculation from the static price table, cancellation support,
and terminal status transitions.

Each agent has an independent configuration module and model environment
variable:

- `RETENTION_ANALYST_MODEL`
- `BOARD_REPORTER_MODEL`

The global `AGENTS_ENABLED` switch remains authoritative. When disabled, the
job records a disabled agent run, produces no draft, and completes without
provider invocation.

The scheduled agents receive no general Concierge tool registry. They use
dedicated service dependencies with the minimum repository capabilities
described below.

## Authorization and Repository Boundaries

Scheduled routes authenticate with the existing cron bearer contract and
create an automation-cron actor. Repository methods independently require the
expected automation actor and agent identity.

Retention Analyst may only:

- read deterministic at-risk candidates;
- read whether a pending Retention outreach already exists for a profile;
- start and settle its own agent run;
- create a pending `agent.retention_outreach` approval through an idempotent
  repository operation.

Board Reporter may only:

- read reconciled report facts for one completed Hong Kong calendar month;
- start and settle its own agent run;
- create one unpublished `page` post draft through an idempotent repository
  operation;
- list those drafts for an authorized admin page.

Neither repository exposes raw database handles, arbitrary predicates, email
transport, approval decision methods, membership mutations, or post publishing
methods to an agent service.

## Data Model

### Agent Runs

Add a required `agent` identity to `agent_runs`, backfilling every existing row
as `concierge`, and extend the trigger enum with `scheduled`. Allowed agent
identities are `concierge`, `retention_analyst`, and `board_reporter`.
Scheduled rows have null conversation and profile IDs; Concierge ownership and
feedback predicates remain unchanged.

### Approvals

Add nullable `request_key text` to `approvals` with a partial unique index
where the key is not null. Existing approvals remain unchanged.

Retention approvals use:

- `action_type = 'agent.retention_outreach'`
- `status = 'pending'`
- `requested_by_profile_id = null`
- `request_key =
  retention:<hong-kong-date>:<profile-id>:<agent-version>`

The payload contains only:

- profile ID and membership ID references;
- locale;
- schema-validated subject and body;
- deterministic risk reason codes;
- the associated agent-run ID;
- the agent version.

It contains no email address, phone number, free-form staff notes, payment
identifier, or authentication data.

A candidate with an existing pending Retention outreach is skipped. A decided
approval may be followed by a new draft on a later Hong Kong date if the
member remains at risk. The daily request key prevents a retry or concurrent
dispatch from creating a second approval on the same date.

### Posts

Add the build-spec `posts` table with:

- UUID primary key;
- unique slug;
- kind constrained to `news`, `buildlog`, or `page`;
- English and Traditional Chinese titles;
- MDX body;
- nullable `published_at`;
- author;
- nullable unique source key;
- nullable agent-run provenance;
- created and updated timestamps.

Board Reporter writes:

- `kind = 'page'`
- `published_at = null`
- `source_key = board-reporter:<hong-kong-year-month>:<agent-version>`
- a deterministic slug derived from the report month
- `author = 'WTIA Board Reporter'`

M4B provides no agent-facing or route-level publish operation.

### Jobs and Agent Runs

Reuse the existing jobs table for claims and terminal job state. Add job kinds:

- `retention-analyst`
- `board-reporter`

Run keys are:

- `retention-analyst:<hong-kong-date>`
- `board-reporter:<hong-kong-year-month>`

Every Board Reporter execution and every Retention candidate provider
invocation records a corresponding `agent_runs` row. A Retention job with no
eligible candidates completes through deterministic job state without
fabricating a provider run. A kill-switch execution records one disabled batch
run. A duplicate completed job performs no provider call and creates no new
draft.

## Retention Analyst

### Candidate Selection

The existing at-risk constants and pure classification rules remain the single
source of truth. A new automation-authorized reader uses the same candidate
projection and `classifyAtRisk` function instead of calling the admin-only
page service.

Candidates are:

- active or past-due memberships only;
- deduplicated by profile using the existing deterministic ordering;
- filtered to profiles without a pending Retention outreach.

The model cannot add, remove, reorder, or substitute candidates.

### Fact Pack

Each immutable fact pack contains:

- locale;
- tier code;
- engagement score and trend bands;
- last-login age band;
- renewal proximity band;
- membership status;
- deterministic risk reason codes;
- allowed template variables such as `{{first_name}}` and
  `{{renewal_date}}`.

The pack contains no actual name, email address, phone number, payment data,
staff notes, or unrelated member data. Template variables are resolved only by
the existing approved-delivery path after staff approval.

### Provider Output

The provider returns one structured object:

- locale;
- subject;
- plain-text body;
- risk reason codes echoed from the input.

Subject and body have strict length limits. Output may contain only approved
template variables and safe HTTPS links configured by the application.
Unknown variables, HTML, mismatched locale, altered risk codes, or PII-like
contact strings fail validation.

### Side Effect

After successful validation, the repository creates a pending approval using
the stable request key. It never invokes an email transport and never inserts
an `email_log` row.

## Board Reporter

### Reporting Window

The monthly job runs for the previous completed Hong Kong calendar month. The
application converts that display window to an exact UTC range using the
existing report window rules.

### Fact Pack

An automation-authorized report reader reuses the existing report SQL and
`reconcileReportFacts` formulas. The model receives a frozen KPI pack with
stable metric keys and values. It cannot choose a different date range or
query additional data.

The KPI pack includes the membership, renewal, revenue, and reconciliation
facts available from the existing M3 reports. M4C-specific public Concierge
aggregates remain outside the M4B Board Reporter pack unless they already
exist as reconciled report facts.

### Provider Output and Rendering

The provider returns schema-validated English and Traditional Chinese
narrative sections keyed to known metric IDs. It does not return the KPI table
or authoritative numeric values.

Application code renders:

1. a deterministic bilingual heading and reporting period;
2. a deterministic KPI table built directly from the fact pack;
3. the validated English narrative;
4. the validated Traditional Chinese narrative;
5. a deterministic reconciliation and failure note.

This prevents an LLM from changing, rounding, hiding, or inventing KPI values.
Failures and reconciliation differences are always displayed.

### Side Effect

The repository inserts one unpublished page draft using the monthly source
key. It does not publish the post or update an existing published post.

## Scheduling

The Worker adds two schedules:

- `15 18 * * *` for Retention Analyst, which is 02:15 Hong Kong time and runs
  after the existing 02:00 engagement-score job;
- `30 0 1 * *` for Board Reporter, which is 08:30 Hong Kong time on the first
  day of each month.

The application adds cron-authenticated routes:

- `/api/jobs/retention-analyst`
- `/api/jobs/board-reporter`

Each route accepts the Worker-supplied scheduled time, derives the canonical
Hong Kong date or month, claims the stable run key, runs the service, and
settles the claim. Provider or repository failure records a sanitized job
error and leaves no partial draft.

Both cron endpoints expose an authenticated `dryRun=1` mode that computes
candidate counts or KPI fact digests without calling a provider or creating a
draft. Dry-run keys are distinct from live run keys.

## Admin Experience

### Retention Approvals

The existing `/admin/approvals` page renders
`agent.retention_outreach` safely:

- member reference;
- locale;
- deterministic risk reason labels;
- subject and body preview;
- requested time and agent-run reference.

The list does not show email addresses or phone numbers. Existing approval
authorization and decision audit rules remain unchanged.

### Board Drafts

The existing `/admin/reports` page gains a Board Reporter section with:

- report month;
- draft title;
- created time;
- agent-run status;
- a staff-only preview link.

The preview uses a new narrowly scoped generated-content renderer. Application
code escapes the provider's plain-text narrative before composing `body_mdx`;
the preview supports headings, paragraphs, tables, lists, and links, rejects
raw HTML, and executes no MDX imports or components. M4B does not add a publish
button.

All new labels and content are provided in English and Traditional Chinese.

## Idempotency and Concurrency

- Jobs use the existing database claim state machine and attempt token.
- Daily and monthly side effects use database-enforced unique request/source
  keys.
- Draft creation and provenance recording occur in one transaction.
- A lost response after commit is recovered by reading the existing key rather
  than inserting again.
- A failed provider call creates no approval or post.
- A failed draft commit settles the agent run and job as failed with a
  sanitized error.
- Concurrent Worker dispatches may perform at most one provider-backed job
  claim and one durable side effect for a run key.

## Privacy, Prompt Safety, and Audit

- Prompts contain deterministic fact packs, not arbitrary database rows.
- Retention prompts use approved template variables instead of real contact
  data.
- Board prompts contain aggregate numbers only.
- Provider output is treated as untrusted and schema-validated before storage.
- `agent_runs` summaries contain counts, reason codes, metric keys, and outcome
  codes only.
- Raw prompts and provider output are not copied into run summaries or job
  errors.
- Audit metadata uses fixed codes and opaque IDs.
- The agents receive no instructions from member-supplied free text.

## Error Handling

- Kill switch: disabled run, zero provider calls, zero drafts, completed job.
- Invalid fact pack: failed run and job, zero drafts.
- Provider timeout, cancellation, or error: failed run and job, zero drafts.
- Invalid structured output: failed run and job, zero drafts.
- Unique-key race: read and return the existing draft as a duplicate-safe
  outcome.
- Database failure before commit: failed run and job, zero partial draft.
- Database failure after a committed insert but before response: recovery by
  request/source key, no duplicate.
- Admin rendering failure: safe error state; raw MDX or payload is not exposed.

## Seed and Demo Data

Extend the M4 seed without changing M1-M3 ownership or deleting unrelated
records:

- preserve the engineered queue of exactly three at-risk members;
- add deterministic preferred locales and safe Retention fact-pack inputs;
- add three Retention approvals after the acceptance seed run;
- add one unpublished Board Reporter page draft for the previous completed
  Hong Kong month;
- keep any build-log posts distinct from Board Reporter page drafts.

Seed reconciliation is idempotent and scoped to fixed M4B source keys.

## Verification Strategy

Implementation follows test-driven development.

### Unit and Contract Tests

- at-risk classification remains identical between admin and automation paths;
- fact packs exclude contact and payment data;
- provider output schemas enforce locale, lengths, variables, links, reason
  codes, and narrative metric keys;
- Board KPI tables render only deterministic fact values;
- actor and repository capability tests reject all forbidden operations;
- price, token, latency, cancellation, and terminal run behavior reuse M4A
  runtime tests;
- Hong Kong date/month and cron schedule calculations cover year boundaries.

### Repository and Concurrency Tests

- two claims for the same run key produce one active execution;
- two approval inserts for the same request key produce one row;
- two post inserts for the same source key produce one row;
- lost-response recovery returns the committed row;
- no provider failure creates a partial approval or post;
- no Retention path inserts `email_log`;
- no Board path sets `published_at`.

### Integration Acceptance

- seeded nightly run creates exactly three pending Retention approvals;
- repeating it in the same Hong Kong date leaves exactly three;
- each approval corresponds to one deterministic at-risk profile;
- a member with an existing pending outreach is skipped;
- Patron and Platinum outreach remains pending and unsent;
- seeded monthly run creates exactly one unpublished Board page draft;
- repeating it leaves exactly one;
- every displayed KPI equals the reconciled report query result;
- English and Traditional Chinese content is present;
- kill-switch runs produce no drafts and no provider call;
- every actual execution has a terminal `agent_runs` row with cost;
- cron authentication failures return 401 and perform no work.

### Application Gates

- focused M4B tests;
- unchanged M4A security, runtime, eval, WOZTELL, and retention suites;
- root lint, typecheck, build, and full test suite;
- Worker tests and typecheck;
- authorized admin browser checks for approvals, reports, and draft preview;
- database-backed tests only with the isolated database gate;
- live provider checks only with separate explicit authorization.

## Preview Rollout

1. Create an isolated database branch from the M4A schema.
2. Apply the additive migration and run the scoped M4B seed.
3. Deploy a protected Preview with agents disabled.
4. Verify authenticated dry-run counts and KPI fact digests.
5. Enable the deterministic mock provider in Preview.
6. Execute nightly and monthly jobs twice and prove three approvals and one
   Board draft with no duplicates or email sends.
7. Verify authorized admin review in both locales.
8. Run live providers only after separate authorization and model resources are
   configured.
9. Keep production agents disabled until named approvers and operational
   ownership are confirmed.

## Completion Gate

M4B is complete only when:

- Retention Analyst creates pending drafts for exactly the deterministic
  at-risk queue and sends nothing;
- Board Reporter creates one unpublished, reconciled bilingual draft for the
  completed month;
- retries and concurrent dispatch cannot duplicate either side effect;
- every actual scheduled execution is auditable and PII-minimized;
- local, Worker, isolated-database, and protected-Preview acceptance evidence
  is recorded honestly;
- fresh implementation and branch reviews have no unresolved Critical or
  Important findings.

Passing M4B does not complete M4. M4C remains required.
