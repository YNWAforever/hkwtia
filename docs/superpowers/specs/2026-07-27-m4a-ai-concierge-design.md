# M4A AI Framework and Concierge Design

**Status:** Approved for implementation planning

**Milestone:** M4A, the first delivery slice of M4 AI-Ops

**Branch base:** M3 HEAD `d4ac009`

## Purpose

M4A establishes the provider-neutral AI runtime and delivers the first
production-shaped agent: the bilingual WTIA Concierge on web chat and
WhatsApp. It turns the existing M0 AI-Ops placeholder and M3 WOZTELL outbound
adapter into an auditable conversational system without allowing an agent to
change membership, billing, roles, or approval decisions.

M4 remains one product milestone, delivered in three ordered slices:

1. M4A builds the AI runtime, knowledge retrieval, Concierge, web and WhatsApp
   channels, approval-draft tool, golden evals, and transcript retention.
2. M4B adds the Retention Analyst and Board Reporter on the same runtime.
3. M4C replaces the public AI-Ops placeholder with real aggregate metrics and
   completes the full M4 Preview acceptance gate.

This decomposition does not remove or weaken any M4 requirement. M4 is not
complete until M4A, M4B, and M4C all pass the build-spec acceptance checklist.

## Goals

- Answer public and authenticated member questions in English or Traditional
  Chinese using WTIA-owned knowledge and cite source titles.
- Record every user turn, agent response, tool execution outcome, token usage,
  cost, latency, and escalation without copying email addresses or phone
  numbers into `agent_runs` summaries.
- Enforce the eight-step tool limit, repository allowlist, conversation
  ownership, global kill switch, provider selection, and mutation prohibitions
  in code rather than prompts.
- Support the same Concierge policy through the web widget and the existing
  WOZTELL channel boundary.
- Escalate payment, complaint, privacy, safety, and low-confidence requests to
  staff instead of inventing an answer or taking a protected action.
- Provide deterministic mock-provider and golden-eval coverage suitable for
  every-commit CI, with live provider evals available only through an explicit
  opt-in.
- Retain chat transcripts for no longer than 12 months and provide a
  deterministic purge job.

## Non-goals

- M4A does not implement the Retention Analyst, Board Reporter, public
  aggregate dashboard, renewal trend chart, or build-log publishing. Those are
  M4B and M4C deliverables.
- M4A does not implement Showcase, Launch Pad cohort operations, a community
  forum, native mobile apps, voice, SMS, or WhatsApp groups.
- M4A does not allow an LLM to send email, change a membership, change billing,
  assign a role, approve or reject an approval, or execute arbitrary SQL.
- M4A does not claim live WOZTELL or live LLM acceptance when the corresponding
  credentials are absent. Mock mode remains explicit and auditable.
- M4A does not introduce Cloudflare Queues, Durable Objects, an external vector
  database, or a second application service.

## Architectural Approach

The application owns a small `lib/ai` contract. Its provider implementations
wrap Vercel AI SDK providers for OpenAI and Anthropic, while the rest of the
code depends only on WTIA types. Vercel AI SDK supplies normalized streaming,
tool calls, usage, and step termination; the WTIA wrapper owns policy,
persistence, pricing, redaction, provider selection, and error codes.

The runtime remains inside the existing Next.js application. A route handler
accepts a validated user turn, resolves an anonymous or authenticated
conversation, persists the user message and a running `agent_runs` record,
then invokes the Concierge. The provider can call only tools registered for
that agent. The runtime persists tool outcomes, final usage, cost, status, and
the agent reply before closing the stream.

Provider selection is configured per agent as
`<provider>:<provider-model-id>`. Production accepts `openai` and `anthropic`;
tests additionally accept an injected mock adapter. There is no automatic
cross-provider retry after a tool executes because replaying a turn could
duplicate side effects. Operators switch the configured provider explicitly.

Embeddings use a separate `EmbeddingAdapter`. Production M4A provides the
OpenAI 1,536-dimension embedding implementation required by the locked schema;
tests use a deterministic local adapter. Chat may use Anthropic while
retrieval uses the embedding adapter. Missing production embedding
configuration fails retrieval closed and causes escalation rather than an
uncited answer.

## Module Boundaries

### AI configuration

`config/agents/concierge.ts` owns the Concierge model key, system behavior,
tool allowlist, escalation categories, confidence threshold, and the rule that
all email drafts require approval. `config/ai-pricing.ts` maps supported model
IDs to input and output prices per million tokens. A live model not present in
the price table is rejected before a provider request so every completed run
has a calculable cost.

`lib/config/env.ts` exposes server-only AI, WOZTELL, Turnstile, and model
configuration. `AGENTS_ENABLED` is enabled only by the exact value `true`.
Preview and production validate any configured live model and its matching
provider credential. Client bundles receive no provider key, webhook secret,
or model configuration. `CONCIERGE_COOKIE_SECRET` is a dedicated server-only
secret for anonymous conversation cookies and must not reuse the Neon Auth
cookie secret. Turnstile site and secret keys must be configured as a complete
pair; a partial pair is rejected.

### Provider runtime

`lib/ai/provider.ts` defines the normalized provider, stream, tool-call, usage,
and finish-reason contracts. `lib/ai/providers/openai.ts` and
`lib/ai/providers/anthropic.ts` adapt Vercel AI SDK providers to that contract.
`lib/ai/runtime.ts` owns the maximum eight-step loop, run lifecycle,
abort/timeout behavior, final persistence, and sanitized error mapping.

The runtime creates the `agent_runs` row before any provider call. It updates
that row exactly once to `ok`, `escalated`, `error`, or `disabled`. A killed,
timed-out, or provider-failed turn therefore remains visible instead of
disappearing from metrics. Disabled and pre-usage error runs record zero tokens
and zero cost; live runs calculate cost from their recorded usage and the
validated static price entry.

### Agent and tool policy

`lib/ai/tools/registry.ts` registers zod input and output schemas with an
executor. Each executor receives a server-created `AgentToolContext` containing
the agent name, trigger, conversation ID, authenticated profile ID when
present, and staff-trigger flag. Client input can never supply or override
this context.

M4A registers:

- `kb_search(query, k)` with `k` constrained to 1–8.
- `get_member_context()` with no client-supplied profile ID. It uses the
  authenticated conversation owner, or a staff-triggered context that contains
  an authorized target profile.
- `list_events(filter)`.
- `get_funding_schemes(answers)` backed by deterministic rules in
  `config/funding-schemes.ts`; the model phrases results but never selects
  eligibility.
- `draft_email(template, vars)` which creates a pending `approvals` row and
  never sends. The Concierge policy has no auto-send exception, so patron,
  platinum, and every other tier remain pending in M4A.
- `create_task(kind, payload)` through the existing staff-task repository.
- `escalate(reason)` which marks the run and conversation escalated and creates
  one idempotent staff task.

The agent actor has a distinct repository capability. Repository tests fail if
it can reach functions outside the explicit M4A allowlist. No tool accepts raw
SQL, table names, arbitrary repository names, membership status, payment
instructions, role changes, or approval decisions.

### Knowledge retrieval

Each `kb_documents` row is one searchable chunk with a stable source identity,
source title, locale, content hash, metadata, and 1,536-dimension vector.
Source text is treated as untrusted data, never as system instructions.
`kb_search` embeds the sanitized query, performs cosine similarity with an
HNSW pgvector index, filters to `en` or `zh-HK`, and returns at most eight
chunks with document IDs, source titles, source URLs, and similarity scores.

`scripts/seed-m4a.ts` deterministically seeds chunks from:

- public WTIA site content;
- membership tiers and FAQ;
- published event records;
- the deterministic funding-scheme rule catalogue.

The seed upserts by stable source key and content hash. It deletes only stale
chunks within the M4A seed namespace and never truncates shared tables.
Production indexing requires the live embedding adapter; unit and isolated
acceptance use deterministic embeddings.

The Concierge may state a factual WTIA answer only when at least one cited
source passes the configured similarity threshold. Otherwise it escalates or
offers the leave-message flow.

## Data Model

Migration `0010_m4a_ai_concierge.sql` enables `vector` and adds the M4A tables
and indexes additively.

### `kb_documents`

- UUID primary key.
- Stable `source_key`, `source_title`, optional `source_url`, and `locale`.
- Chunk `content`, `content_hash`, JSON metadata, and `embedding vector(1536)`.
- Unique `(source_key, locale, content_hash)`.
- HNSW cosine index on `embedding` plus source and locale indexes.

### `conversations`

- UUID primary key.
- Optional `profile_id`; anonymous web sessions remain valid.
- `channel` constrained to `web` or `whatsapp`.
- `locale` constrained to `en` or `zh-HK`.
- Optional one-way `anonymous_session_hash`; raw browser tokens are never
  stored.
- `status` constrained to `open`, `closed`, or `escalated`.
- Optional CSAT constrained to 1–5.
- Optional `resolved_by` constrained to `agent`, `staff`, or `abandoned`.
- `last_customer_message_at`, `started_at`, `updated_at`, and `closed_at`.
- Indexes for profile history, open conversations, channel, and retention.

### `messages`

- Identity primary key and required conversation foreign key.
- `role` constrained to `user`, `agent`, or `staff`.
- `channel` constrained to `web` or `whatsapp`; this directly proves the M4
  WhatsApp acceptance requirement on the message row.
- Text content, optional `agent_run_id`, optional provider message ID, and
  creation timestamp.
- Unique provider message ID when present for inbound webhook idempotency.
- Conversation/time and retention indexes.

### `agent_runs`

- UUID primary key and optional conversation foreign key.
- Agent, trigger, provider, model, redacted input/output summaries.
- Token counts, static-table USD cost, latency, tool-step count, and finish
  reason.
- Status constrained to `running`, `ok`, `error`, `escalated`, or `disabled`.
- Stable sanitized error code and timestamps.
- No email address, phone number, raw webhook body, provider key, cookie,
  Turnstile token, or conversation transcript.

The existing `approvals`, `staff_tasks`, `profiles`, `events`, and audit tables
remain authoritative. M4A extends their repositories but does not duplicate
them.

## Conversation Ownership

Authenticated web conversations bind to the profile resolved from the Neon
Auth session. Anonymous conversations receive a random, signed, HTTP-only,
same-site cookie; only its HMAC hash is stored. Every read, send, close, and
CSAT operation rechecks one of those ownership proofs in the repository.

The client sends a conversation ID only as a lookup hint. It cannot attach a
conversation to a profile, choose another profile, or request member context
for a supplied ID. A member attempting to read or continue another member's
conversation receives a real 404.

WhatsApp conversations bind by normalized E.164 number. The server maps that
number to a profile when exactly one opted-in profile matches. Unknown senders
remain anonymous and no inferred identity is sent to the model.

## Web Chat Flow

The bilingual `ConciergeWidget` is a keyboard-accessible client island mounted
from the locale layout so it is available on public and member pages without
changing server rendering or metadata.

1. The widget obtains the current locale and posts one turn to
   `/api/ai/concierge`.
2. The route validates origin, JSON size, message length, honeypot, optional
   Turnstile proof, and a 20 requests/minute/IP limiter.
3. The route resolves the Neon Auth actor or signed anonymous conversation
   cookie and ignores any client-supplied identity.
4. The service persists the user message and starts an `agent_runs` row in one
   transaction.
5. With `AGENTS_ENABLED=false`, it creates an idempotent staff task, marks the
   run `disabled`, and returns localized leave-message state without calling
   an embedding or chat provider.
6. With agents enabled, the Concierge retrieves sources, executes only
   allowlisted tools, streams localized text, and appends citation markers
   tied to returned document IDs.
7. The service persists the final reply and settles the run. If the client
   disconnects, the server still settles the run through an abort-safe
   completion path.
8. The widget offers thumbs feedback and an optional 1–5 CSAT control.
   Submission is ownership-checked and may update the conversation once.

The fallback leave-message form accepts a message and optional contact email.
The email is stored only inside the staff-task payload and is removed from
agent summaries. The fallback never silently re-enables an agent.

## WhatsApp Flow

`POST /api/webhooks/woztell` reads the raw request body, verifies the existing
HMAC adapter before parsing, and returns 401 for a missing or invalid
signature. Accepted payloads are normalized by `ChannelAdapter`; route code
does not depend on WOZTELL payload shapes.

The normalized inbound contract adds provider message ID and received time.
The service claims the provider message ID before any agent or channel call,
making webhook retries idempotent.

For a normal inbound text:

1. Normalize the E.164 sender and resolve or create the WhatsApp conversation.
2. Record the user message with `channel='whatsapp'` and update
   `last_customer_message_at`.
3. Run the same Concierge policy and tool registry used by web chat.
4. Persist the agent message before sending it through the channel adapter.
5. Send a free-form session message only when the most recent customer message
   is within 24 hours. The adapter enforces this from a server-provided
   timestamp.
6. Outside the window, reject the free-form operation with a typed policy
   result. A caller may use only an approved template key through
   `sendTemplateMessage`; no raw template name is accepted.

An inbound `STOP` or `取消` updates `whatsapp_opt_in=false`, records the inbound
message, and does not call an LLM. Unsupported event types return an
idempotent 202 response without creating an agent run.

Live credentials use WOZTELL. When credentials are absent outside production,
the adapter returns deterministic `mock:` provider IDs. Production refuses to
boot a live webhook path with only a partial credential set.

## Language and Citation Policy

The route locale or conversation locale selects English or Traditional
Chinese. For WhatsApp, the first recognized message selects locale by a
deterministic script heuristic and the member profile preference wins when
available. The agent is instructed to remain in that locale, while code owns
all fixed UI, fallback, error, consent, and escalation copy in
`messages/en.json` and `messages/zh-HK.json`.

Every knowledge-grounded factual paragraph includes at least one citation
token referencing a source returned by `kb_search`. The server converts tokens
to safe source-title links. Unknown IDs, arbitrary URLs, and provider-generated
links are discarded.

## Escalation and Protected Actions

The following categories always call `escalate` and stop autonomous tool work:

- payment disputes, refunds, failed charges, or card details;
- complaints, legal threats, privacy requests, or data deletion;
- requests for another member's personal or company-confidential data;
- role, seat, approval, membership, or billing changes;
- low retrieval confidence or conflicting source facts;
- provider safety refusal or repeated tool failure.

`draft_email` stores a structured payload containing profile, template key,
validated variables, locale, agent run, and an expiry timestamp. It never
writes `email_log`. Existing staff approval logic remains the only path to an
approved decision, and a later M4 task will connect approved drafts to the
audited email sender. M4A acceptance proves that a platinum draft remains
pending and no email row exists.

## Privacy, Security, and Abuse Controls

- `redactAgentSummary` removes email addresses, Hong Kong and international
  phone patterns, bearer-like tokens, cookies, and webhook signatures before
  persistence.
- Providers receive only the current question, relevant non-PII history,
  retrieved source chunks, and the minimum tool result required to answer.
- `get_member_context` returns tier, renewal date, upcoming events, and
  engagement summary, never email, phone, billing IDs, role lists, or notes.
- Raw webhook bodies are never logged. Public errors expose stable codes only.
- Prompt text and retrieved documents cannot add tools, expand permissions, or
  override system policy.
- Public chat enforces zod validation, 20 requests/minute/IP, maximum body and
  turn lengths, Turnstile when configured, and honeypot fallback otherwise.
- Transcript reads and mutations are repository-authorized and covered by the
  existing repository-boundary CI guard.
- A daily authenticated `chat-retention` job deletes messages older than 12
  months, closes or removes empty conversations, and retains aggregate
  `agent_runs` only after their conversation link and summaries are cleared.
  The job is idempotent and records an audit count without message content.

## Failure Handling

- Invalid input returns 400; failed Turnstile returns 403; ownership denial
  returns 404; rate limit returns 429 with `Retry-After`.
- Invalid WOZTELL signature returns 401 before JSON parsing or persistence.
- Provider rate limits and transient network failures map to sanitized retryable
  error codes. A web turn may retry only before any tool executes.
- A provider failure after a tool executes never replays the turn. The run is
  marked `error`, the conversation is escalated, and one staff task is created.
- Tool schema errors are returned to the model once for correction and count
  toward the eight-step limit. Policy denials stop the loop immediately.
- Timeout or step exhaustion settles the run as `escalated`.
- Database failure before the user message/run transaction returns 503 with no
  partial turn. A failure after that transaction preserves the incomplete run
  for diagnosis and marks it error on the recovery path.
- WhatsApp send failure keeps the persisted agent reply and records the typed
  channel failure; webhook retries do not invoke the agent again.

## Evaluation and Test Strategy

### Unit tests

- Provider selection, normalized usage, model pricing, unknown-model rejection,
  timeout, abort, and eight-step termination.
- PII redaction for email, phone, bearer token, cookie, and webhook examples.
- Tool input/output schemas and agent allowlist.
- Member-context ownership and absence of PII fields.
- Deterministic funding-scheme rules.
- Citation allowlist and low-confidence escalation.
- Kill switch proves zero embedding, provider, and tool calls.
- Public rate limit, Turnstile, honeypot, body-size, and locale validation.
- WOZTELL invalid signature, inbound normalization, webhook idempotency,
  opt-out, 24-hour session rule, and template-only fallback.
- Platinum `draft_email` creates a pending approval and no `email_log` row.
- Twelve-month retention boundary and idempotent purge.

### Repository and integration tests

- Migration applies on a clean database and after migrations 0001–0009.
- pgvector query returns the expected locale-scoped deterministic fixture.
- Every user turn creates one `agent_runs` row and every successful response
  links the message to that run.
- Member A cannot access Member B's conversation or context; anonymous tokens
  cannot cross conversations; the agent actor is denied by every repository
  outside its allowlist.
- Concurrent duplicate WOZTELL deliveries create one inbound message and one
  reply.
- A failed post-tool provider turn creates one escalation task and does not
  repeat the tool action.

### Browser and webhook acceptance

- English and zh-HK public chat render, remain keyboard accessible, cite seeded
  sources, accept feedback, and preserve locale.
- Authenticated member chat can answer that member's tier/renewal question and
  receives 404 when replaying another member's conversation ID.
- Kill switch renders the localized leave-message flow and creates a staff task
  with no provider call.
- WOZTELL fixture produces a recorded user and agent message with
  `channel='whatsapp'`; invalid secret returns 401.

### Golden evals

`evals/concierge.golden.jsonl` contains exactly 25 versioned cases covering
membership, tiers, pricing, events, funding rules, language, citations,
payment/complaint escalation, low confidence, and an adversarial request to
reveal another member's email.

`evals/grader.ts` applies deterministic required/forbidden assertions first
and an injectable judge second. CI uses the deterministic mock provider and
must score at least 85 percent with the PII case refused. Live providers run
only with `RUN_LIVE_EVALS=1`, use a separate command, and never gate ordinary
commits on network variability.

## Delivery and Rollout

M4A development occurs in the isolated `codex/m4a-ai-concierge` worktree.
Implementation follows TDD and additive migrations. Provider credentials,
WOZTELL credentials, Turnstile secrets, conversation cookies, and Preview
database URLs stay outside source control.

Preview acceptance uses a new Neon branch derived from the M4A schema and a
protected Vercel Preview. Mock provider and mock WOZTELL mode prove the full
flow first. Live eval or live WOZTELL traffic requires separate explicit
authorization and approved provider resources. Named HITL approvers remain a
go-live dependency for M4; their absence does not block building or verifying
pending approval creation in M4A, but production agent enablement remains
off until that owner-supplied configuration exists.

M4A is complete only when:

- the M4A unit, authz, integration, browser, webhook, retention, and golden
  eval gates pass;
- root lint, typecheck, build, and unchanged milestone suites pass;
- the isolated database proves conversation, message, run, approval, and
  idempotency state;
- no production database, production alias, live provider recipient, or
  unapproved template is mutated;
- the implementation is reviewed and the Preview evidence is recorded.

M4A completion is not M4 completion. M4B and M4C remain required before the
public AI-Ops milestone can be declared delivered.
