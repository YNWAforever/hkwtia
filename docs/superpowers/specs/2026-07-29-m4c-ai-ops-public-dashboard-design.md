# M4C Public AI-Ops Dashboard Design

**Status:** Approved for implementation planning

**Milestone:** M4C, the final delivery slice of M4 AI-Ops

**Branch base:** M4B HEAD `d71c844`

## Purpose

M4C replaces the public `/ai-ops` preview with a server-rendered, bilingual,
privacy-safe account of WTIA's live AI operations. It adds an hourly aggregate
pipeline, publishes the required operational and renewal metrics, explains the
system architecture, links to build evidence, and closes the full M4
acceptance gate across M4A, M4B, and M4C.

The dashboard is an observability surface, not a marketing-only scorecard.
Escalations, failed conversations, unavailable data, stale refreshes, and
missing samples remain visible. No public query or response may expose a
member, conversation, message, prompt, provider response, or staff identity.

M4C remains one specification and one delivery branch. Implementation is
ordered: aggregate contract and migration first, refresh job second, public
experience third, seed and full M4 acceptance last.

## Milestone Boundaries

M4 is delivered in three ordered slices:

1. M4A: provider-neutral runtime, Concierge, guarded tools, web and WhatsApp
   channels, evals, telemetry, feedback, and transcript retention.
2. M4B: Retention Analyst and Board Reporter with approval- and
   publication-gated outputs.
3. M4C: public AI-Ops aggregates, renewal trend, architecture and build
   evidence, plus the complete protected-Preview M4 acceptance gate.

M4C completes M4 only after the cross-slice acceptance evidence is recorded.
It does not implement Showcase, Launch Pad, a community forum, accounting
integration, additional payment rails, Simplified Chinese, native apps,
voice, SMS, or WhatsApp groups.

## Goals

- Refresh public-safe AI-Ops aggregates at least hourly through the existing
  authenticated Worker and job claim system.
- Render real, seeded operational values on `/en/ai-ops` and
  `/zh-HK/ai-ops` without client-side data fetching.
- Publish conversations this month, agent-resolved percentage, median first
  response, CSAT, escalation rate, failure rate, staff hours saved, and
  monthly LLM cost.
- Publish a twelve-Hong-Kong-month overall and first-year renewal trend.
- Show the data timestamp, reporting definitions, target thresholds,
  architecture, source/build evidence, and explicit degraded states.
- Ensure the public read model structurally excludes PII rather than relying
  on UI redaction.
- Prove the complete M4 Concierge, scheduled-agent, WhatsApp, approval,
  kill-switch, privacy, and public-dashboard acceptance contract.

## Non-goals

- The dashboard does not expose individual runs, transcripts, prompts,
  summaries, model responses, profiles, companies, memberships, phone
  numbers, email addresses, staff users, or approval payloads.
- The public page does not trigger a refresh or issue aggregate queries over
  operational tables.
- M4C does not add arbitrary date filters or an analytics export API.
- M4C does not rewrite the existing admin report formulas or make an LLM
  authoritative for any metric.
- M4C does not hide poor performance, suppress zeroes, or replace failures
  with target values.
- M4C does not publish Board Reporter drafts.
- M4C does not introduce a client charting library or a client-only dashboard.

## Architectural Decision

M4C uses a real PostgreSQL materialized view refreshed hourly by the existing
Worker.

The view stores one row for each of the most recent twelve Hong Kong calendar
months. Each row contains only aggregate scalars and a refresh timestamp.
Application code reads those rows through a dedicated public repository and
renders them in a React Server Component. The current-month row supplies KPI
cards; all twelve rows supply the renewal trend.

The materialized view is created populated and has a unique index on its month
key. Hourly refreshes use `REFRESH MATERIALIZED VIEW CONCURRENTLY`, allowing
the public page to continue reading the previous complete result while a new
result is built.

Two rejected alternatives are:

- An application-managed snapshot table. This can preserve arbitrary history
  and is easy to unit test, but it does not satisfy the build specification's
  explicit materialized-view requirement and adds write reconciliation that
  PostgreSQL already provides.
- Live aggregate SQL with Next.js caching. This is the smallest code change,
  but it moves expensive operational joins into public request handling,
  omits the required hourly metrics job, and makes availability depend on
  every source table at request time.

## Reporting Calendar

Every public reporting boundary uses `Asia/Hong_Kong`.

- `month_start` is the first local day of the Hong Kong month, stored as a
  date.
- The materialized view generates the current Hong Kong month and the eleven
  preceding months, including zero-activity months.
- UTC comparisons use an inclusive local-month start converted to UTC and an
  exclusive next-month start converted to UTC.
- The page labels the current partial month explicitly.
- The trend always renders twelve ordered month slots. A rate with no
  denominator is unavailable, not zero.

Month conversion is implemented once in SQL and covered at year boundaries.
Application formatting uses the requested locale and does not reinterpret the
stored month in the server's local timezone.

## Aggregate Contract

The materialized view is named `aiops_monthly_metrics`. Its public contract
contains:

- `month_start`
- `is_partial_month`
- `conversation_count`
- `terminal_conversation_count`
- `resolved_conversation_count`
- `escalated_conversation_count`
- `failed_conversation_count`
- `agent_resolved_rate`
- `escalation_rate`
- `failure_rate`
- `median_first_response_ms`
- `first_response_sample_count`
- `csat_average`
- `csat_response_count`
- `staff_hours_saved`
- `llm_cost_usd`
- `renewal_due_count`
- `renewal_paid_count`
- `renewal_rate`
- `first_year_renewal_due_count`
- `first_year_renewal_paid_count`
- `first_year_renewal_rate`
- `refreshed_at`

All counts are non-negative integers. Rates are nullable decimals in the
closed interval from zero to one. CSAT is nullable from one to five. Cost and
staff hours are non-negative fixed-precision decimals. Latency is a nullable
non-negative integer.

The view contains no IDs, free text, JSON, locale, channel address, provider
message ID, summary, error code, prompt, model response, or member attribute.

## Metric Definitions

### Conversations This Month

Count distinct Concierge conversations created in the month. Scheduled-agent
runs have no conversation and are excluded.

### Terminal Conversation Outcome

For each Concierge conversation, select its latest terminal run in the month
using `completed_at`, creation time, and run ID as deterministic tie-breakers.
The terminal states are `completed`, `escalated`, and `failed`.

- Resolved conversations have latest terminal status `completed`.
- Escalated conversations have latest terminal status `escalated`.
- Failed conversations have latest terminal status `failed`.
- Running and disabled rows do not enter a terminal-rate denominator.

The rates use terminal conversation count as their denominator. A conversation
cannot appear in more than one terminal outcome. No terminal conversations
produces unavailable rates.

### Median First Response

For each Concierge conversation created in the month:

1. select its first user message;
2. select the first assistant message at or after that user message;
3. calculate the elapsed milliseconds;
4. take the PostgreSQL discrete median across valid non-negative samples.

Conversations without an assistant response are excluded from latency but
remain visible through terminal failure and escalation metrics. Provider
runtime latency is not substituted for member-visible first-response time.
The aggregate also publishes the number of conversations contributing a valid
first-response sample.

### CSAT

Average non-null `csat_score` values from terminal Concierge runs completed in
the month. The dashboard shows both the average and response count. No ratings
produces an unavailable value, never a fabricated zero.

### Staff Hours Saved

Use the build-spec formula:

`resolved_conversation_count * 6 minutes / 60`

The UI identifies this as an estimate and publishes the six-minute assumption
in the methodology section.

### Monthly LLM Cost

Sum `cost_usd` for all M4 agent runs started in the month, including
Concierge, Retention Analyst, and Board Reporter. Disabled rows contribute
their stored zero cost. The result is displayed in USD with fixed,
non-scientific formatting.

### Renewal Trend

Reuse the existing reconciled renewal event semantics:

- a membership is due when it has a `renewal_paid` or `renewal_failed`
  engagement event in the month;
- it is paid when at least one such event is `renewal_paid`;
- `renewalOrdinal = 1` supplies the first-year due and paid subsets;
- membership IDs are deduplicated inside each month;
- overall and first-year rates use paid divided by due;
- no due memberships produces an unavailable rate.

The chart covers the latest twelve Hong Kong months and includes reference
lines for the product targets: 88 percent overall and 82 percent first-year.

## Refresh Job

Add the M4 job kind `aiops-metrics` and the authenticated route:

`POST /api/jobs/aiops-metrics`

The route uses the existing `createJobPost` contract with an hourly bucket.
Its canonical run key is:

`aiops-metrics:<UTC-hour>`

The application runner requires the automation-cron actor and calls a
repository exposing only `refresh()`. The repository executes the fixed
`REFRESH MATERIALIZED VIEW CONCURRENTLY aiops_monthly_metrics` statement. It
does not accept a table name, predicate, or arbitrary SQL.

The Worker adds `aiops-metrics` to the existing `0 * * * *` job group. It
retains the existing bounded request timeout, retry delays, protection-bypass
header, final failure notification, and sanitized logging behavior.

The route returns a non-success response when refresh fails so the Worker
retries and alerts. It completes the job claim only after the database refresh
has succeeded. Duplicate delivery for a completed hourly key performs no
second refresh.

Concurrent refreshes remain safe through both the hourly job claim and
PostgreSQL's single-refresh rule. The previous materialized result remains
readable throughout a concurrent refresh.

## Public Repository

A dedicated `aiops-public` repository has one operation:

`readLatestTwelveMonths()`

It selects the explicit aggregate column list from the materialized view,
orders by month ascending, and validates every row against a strict runtime
schema. It has no actor parameter because the table itself is public-safe and
contains no row-level data.

The repository never returns raw database rows, accepts no caller-selected
columns, and imports no operational repository. Unknown columns are discarded
by the SQL projection rather than by presentation code.

The page service classifies the result as:

- `fresh`: the newest refresh is no more than two hours old;
- `stale`: the newest refresh is older than two hours;
- `empty`: no current-month aggregate exists;
- `unavailable`: the read failed or validation rejected the result.

Stale data is still rendered with a warning and its actual timestamp.
Unavailable data renders an explicit bilingual error panel while leaving the
methodology, architecture, and build-evidence sections accessible.

## Public Experience

The existing `/[locale]/ai-ops` route remains a React Server Component and
gains localized metadata. It reads only the aggregate repository and is
server-rendered in both English and Traditional Chinese.

The page contains, in order:

1. a hero explaining AI-Ops-in-public and the current partial-month window;
2. freshness or degraded-state status with the last refresh time;
3. KPI cards for conversations, resolution, first response, CSAT, escalation,
   failure, staff hours saved, and LLM cost;
4. a twelve-month renewal chart with overall and first-year series and target
   lines;
5. visible escalation and failure callouts;
6. metric definitions and denominator/sample notes;
7. an accessible architecture diagram;
8. source, build, deployment, and acceptance-evidence links.

The resolution and CSAT cards show the product targets of 70 percent and 4.5
out of 5. They do not convert a missed target into a neutral or success style.

All percentage cards show both numerator and denominator. CSAT shows response
count. Median latency shows its sample count if available from the aggregate
contract. Zero is rendered as zero; unavailable is rendered as localized
“not enough data”.

The page uses no browser fetch, dashboard polling, or client-only state.
Optional cache revalidation may be shorter than one hour, but the database
view remains the source of freshness. The page is included in the localized
sitemap and remains indexable.

## Renewal Visualization

The renewal trend is rendered server-side without a third-party charting
runtime.

- An SVG provides the visible two-series chart, target lines, point markers,
  and localized axes.
- The SVG has a localized title and description.
- A semantic table immediately following it exposes every month, numerator,
  denominator, and rate to screen readers and non-visual clients.
- Color is not the only series distinction; line style, marker shape, labels,
  and legend text distinguish overall from first-year renewal.
- Missing rates create gaps rather than zero-value points.
- The visualization remains readable at mobile widths without horizontal page
  overflow.

## Architecture and Build Evidence

The architecture section uses semantic server-rendered HTML to show:

`Web / WhatsApp -> Concierge runtime -> guarded tools -> Neon Postgres`

and:

`Cloudflare Worker -> authenticated job routes -> scheduled agents / AI-Ops
refresh -> Neon Postgres`

It also shows approval and publication gates between generated content and
external side effects. Decorative connectors are hidden from assistive
technology; a text description contains the complete flow.

Build evidence combines two sources:

- internal links to exactly the published `buildlog` posts;
- fixed, allowlisted HTTPS links to external engineering evidence.

External evidence URLs include:

- the source repository;
- commit/build history;
- the deployed application;
- the checked-in M4 acceptance document.

Only fixed application configuration may define an external URL. Unsafe or
invalid URLs are omitted and shown as unavailable.

### Published Build Logs

A dedicated public-posts repository exposes two operations:

- `listPublishedBuildLogs()`
- `getPublishedBuildLogBySlug(slug)`

Both operations select an explicit public-content column list and require
`kind = 'buildlog'` with `published_at <= now()`. A null or future
`published_at`, a `page` draft, and any other post kind are never returned.

The existing `/[locale]/news` page combines static news with published build
logs. `/[locale]/news/[slug]` keeps the static-content lookup and falls back to
the public-posts repository. Database MDX is rendered through the existing
narrow generated-content renderer, with raw HTML, imports, and executable
components disabled.

The AI-Ops evidence section receives only published build-log summaries and
links to their localized internal news routes. A slug must pass the existing
safe slug schema before application code uses it to construct the URL.

## Privacy and Security

- The materialized view is the public privacy boundary and stores aggregate
  scalars only.
- The public repository projects only named columns and rejects malformed
  numeric ranges.
- AI-Ops metric services never query `profiles`, `companies`, `memberships`,
  `conversations`, `messages`, `agent_runs`, or approvals directly.
- The dedicated public-posts repository is the only public content path into
  `posts` and returns published `buildlog` rows only.
- Counts are published without member-level drill-down.
- The dashboard contains no raw error strings, provider errors, SQL errors,
  prompts, summaries, or job payloads.
- Refresh requires the existing constant-time cron bearer verification.
- The page cannot start jobs or mutate data.
- Evidence links accept only fixed HTTPS destinations.
- Logs contain job kind, run key, status, and sanitized error code only.
- Full page and serialized RSC-output tests assert the absence of seeded PII
  canaries.

The seed uses enough aggregate fixtures to demonstrate the dashboard without
publishing a real person's behavior.

## Error and Degraded-State Handling

- Refresh database error: the job fails, retries, and emits the existing final
  worker alert; the previous view remains public.
- Duplicate hourly delivery: the route returns the existing duplicate-safe
  result and performs no refresh.
- Stale view: render values, timestamp, and a prominent stale warning.
- Missing current month: render an empty state and retain the twelve-month
  methodology and evidence sections.
- Invalid aggregate row: classify the dashboard as unavailable; do not render
  unvalidated numbers.
- No denominator or sample: render unavailable for that metric, not zero.
- Missed resolution, CSAT, or renewal target: render the actual value and a
  below-target state.
- Escalated or failed conversations: always render their count and rate.
- Evidence-link validation failure: omit the unsafe link and show missing
  evidence.
- Public database read failure: render a safe bilingual unavailable state;
  never expose the exception.

## Seed and Demo Data

Extend the isolated M4 seed with deterministic, synthetic telemetry scoped by
stable fixture keys:

- reconcile the final M4 demo to the build-spec totals of exactly 40
  `agent_runs` and 15 Concierge conversations;
- preserve the specified conversation outcomes of 12 resolved and three
  escalated, producing an 80 percent resolution rate and 20 percent escalation
  rate;
- user and assistant timestamps with a known first-response median;
- terminal run costs and CSAT values with known totals;
- scheduled-agent costs for Retention Analyst and Board Reporter;
- twelve Hong Kong months of renewal paid/failed events with overall and
  first-year denominators;
- exactly two published build-log posts with stable evidence links;
- no real contact data in any public fixture.

The current-month fixture must produce a reproducible aggregate set whose
resolution rate is 80 percent, escalation rate is 20 percent, and rated CSAT
is at least 4.5. The dashboard must render the failure metric even when its
seeded value is zero. Focused repository and page tests use a separate
non-production fixture to prove non-zero failure handling. Expected values are
asserted in acceptance tests rather than copied manually into the page.

The seed is idempotent, does not delete unrelated records, and refreshes the
materialized view only after all fixture transactions commit.

## Testing Strategy

Implementation follows test-driven development.

### SQL and Formula Tests

- exactly twelve Hong Kong month rows, including zero-activity months;
- correct UTC boundaries at month and year transitions;
- distinct conversations and renewal memberships are deduplicated;
- latest terminal run determines one conversation outcome;
- running and disabled runs do not alter terminal denominators;
- first user to first subsequent assistant response produces the expected
  median;
- missing assistant messages do not fabricate latency;
- CSAT average and response count use only rated terminal Concierge runs;
- staff hours equal resolved count times six minutes;
- LLM cost includes every M4 agent and preserves fixed precision;
- renewal and first-year renewal formulas match existing report semantics;
- denominator-zero rates are null;
- the view exposes no ID, text, JSON, or PII column;
- concurrent refresh leaves a readable complete prior result.

### Job and Worker Tests

- unauthenticated, malformed, and wrong-secret requests return 401 and do no
  work;
- the first hourly request refreshes and completes its job;
- duplicate hourly requests do not refresh again;
- refresh failure settles the attempt as failed and returns a retryable
  response;
- `aiops-metrics` is dispatched only by the hourly cron group;
- Worker timeout, retry, and final alert behavior includes the new job;
- logs contain no database exception or fixture PII.

### Repository and Page Tests

- the public repository selects and validates only the aggregate allowlist;
- the public-posts repository returns only currently published build logs;
- unpublished, future-dated, `page`, and unknown posts never render publicly;
- static news and database build-log detail routes coexist without leaking
  drafts;
- fresh, stale, empty, unavailable, zero, and null states render correctly;
- every KPI uses its specified numerator, denominator, unit, and target;
- escalation and failure remain visible when non-zero and when zero;
- twelve-month SVG and semantic table contain identical values;
- missing renewal rates create gaps, not zero points;
- both locales contain complete visible labels, metadata, methodology,
  architecture, and evidence;
- the route remains server-rendered and performs no client fetch;
- sitemap and indexing behavior include both localized AI-Ops routes and every
  published build-log detail route;
- HTML and RSC payloads contain no seeded PII canaries;
- keyboard, heading, landmark, contrast, reduced-motion, and mobile overflow
  checks pass.

## Full M4 Acceptance

M4C owns the combined M4 acceptance run. It must prove:

- Concierge eval accuracy is at least 85 percent and PII refusal passes;
- every Concierge turn creates an auditable `agent_runs` record;
- the global kill switch returns the deterministic fallback with zero
  provider/tool side effects;
- a Platinum draft-email request remains pending approval and sends no email
  before approval;
- the public AI-Ops page renders the real seeded aggregate set, including the
  expected 80 percent resolution rate, 20 percent escalation rate, and a
  visible failure metric even when zero;
- Retention Analyst creates the expected seeded at-risk drafts without direct
  sends;
- Board Reporter creates one unpublished reconciled bilingual draft;
- valid WOZTELL fixtures receive the expected reply;
- an invalid WOZTELL signature receives no reply;
- outside the WhatsApp 24-hour window, only the approved template fallback is
  used;
- duplicate job and webhook delivery creates no duplicate durable effect;
- both public locales render and remain indexable;
- no public response exposes seeded PII canaries.

The acceptance run records exact commands, fixture IDs or safe digests,
expected and actual aggregate values, job outcomes, browser observations, and
deployment identity in `docs/acceptance/m4.md`. Secrets, phone numbers, email
addresses, prompts, and transcripts are excluded.

## Application Gates

- focused M4C SQL, repository, job, Worker, component, and page tests;
- unchanged M4A runtime, security, eval, WOZTELL, feedback, and retention
  suites;
- unchanged M4B Retention Analyst, Board Reporter, approval, and draft suites;
- root lint with zero warnings;
- root typecheck;
- production build;
- full root test suite;
- Worker test suite and typecheck;
- bilingual visible-string audit;
- isolated-database migration, seed, refresh, and aggregate reconciliation;
- protected-Preview browser verification in both locales;
- public-response PII canary scan;
- fresh implementation review and branch review with no unresolved Critical
  or Important findings.

Live provider checks remain separately gated. Deterministic mocks prove the
default Preview acceptance path; live providers run only with explicit
authorization, configured model resources, and recorded spend boundaries.

## Preview Rollout

1. Create or reset an isolated Neon branch from the current M4B schema.
2. Apply all migrations, including the populated materialized view and its
   unique month index.
3. Run the scoped M4 seed and refresh the view.
4. Reconcile every public aggregate against direct acceptance queries.
5. Deploy a protected Preview with test accounts and agents disabled.
6. Verify fresh, stale, empty, and unavailable page states in both locales.
7. Run the deterministic M4A and M4B acceptance flows.
8. Invoke the hourly job twice and prove one completed refresh claim.
9. Verify both localized public pages, renewal chart, architecture, evidence,
   metadata, sitemap, accessibility, and PII canary absence.
10. Enable deterministic mock agents and finish the combined M4 acceptance.
11. Run live models only after separate authorization.
12. Keep production promotion and production agent enablement outside this
    implementation unless separately approved.

## Completion Gate

M4 is complete only when:

- the hourly aggregate pipeline is authenticated, idempotent, retryable, and
  deployed;
- the materialized view exposes exactly the approved public-safe aggregate
  contract;
- `/en/ai-ops` and `/zh-HK/ai-ops` render real seeded values, renewal history,
  negative outcomes, methodology, architecture, and build evidence;
- public responses contain no member-level or operational PII;
- local, Worker, isolated-database, and protected-Preview evidence proves the
  complete M4A, M4B, and M4C acceptance list;
- fresh implementation and branch reviews have no unresolved Critical or
  Important findings.

Passing M4 completes the AI-Ops milestone but does not complete the product.
M5 Showcase and M6 Launch Pad remain required in order.
