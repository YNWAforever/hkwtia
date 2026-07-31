# M4A AI Concierge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the provider-neutral AI foundation and bilingual Concierge for web and WOZTELL WhatsApp, with durable conversations, citations, escalation, cost telemetry, retention, and deterministic acceptance evidence.

**Architecture:** Keep all model-specific behavior behind `lib/ai`, while repositories remain the only production database boundary. A Concierge orchestration service owns policy, tools, and persistence; thin web and webhook routes validate transport concerns and delegate to it. Every attempted turn creates an `agent_runs` row before any provider call, and all side effects are restricted to pending email approvals or staff tasks.

**Tech Stack:** Next.js App Router, TypeScript, Zod, Drizzle ORM, Neon PostgreSQL with pgvector, Vercel AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`), next-intl, Cloudflare Workers, Vitest, Playwright.

## Global Constraints

- Preserve the repository boundary: application code outside `lib/db/repos/**` must not import the Drizzle client or schema directly.
- `AGENTS_ENABLED` is enabled only when its value is exactly `true`. Disabled mode performs zero provider, embedding, or AI-tool calls.
- Provider model names use `<provider>:<model-id>`. Do not silently retry another provider after a tool has executed.
- The tool loop stops after at most eight steps.
- The Concierge may read approved context and create only pending email approvals or staff tasks. It may not mutate membership, payment, role, or approval status.
- Persist an `agent_runs` record for every enabled, disabled, successful, failed, and escalated turn.
- Redact PII from run summaries and staff-task summaries. Do not place full transcripts or secrets in logs.
- Web and WhatsApp use the same Concierge service and tool policy.
- Store chat transcripts for 12 months, then delete them using an idempotent daily job.
- Live provider, Neon, Turnstile, Meta template, and WOZTELL tests stay opt-in. Deterministic tests must pass without external credentials.
- Production enablement remains blocked until named approvers accept the prompt/policy, WhatsApp templates are approved, and live acceptance is authorized.
- Use test-driven development for each task: add a failing focused test, observe the intended failure, implement the minimum change, then rerun the focused test.

## File Structure

### New production files

- `config/agents/concierge.ts` — Concierge system contract, allowed tools, locale rules, and escalation policy.
- `config/ai-pricing.ts` — explicit per-model input/output pricing used for cost telemetry.
- `config/funding-schemes.ts` — deterministic bilingual funding-scheme catalogue.
- `lib/auth/agent-actor.ts` — narrow Concierge capability type.
- `lib/ai/model.ts` — provider/model parser and validated model configuration.
- `lib/ai/provider.ts` — normalized model and streaming interfaces.
- `lib/ai/providers/openai.ts` — OpenAI model adapter.
- `lib/ai/providers/anthropic.ts` — Anthropic model adapter.
- `lib/ai/pricing.ts` — token-cost calculation.
- `lib/ai/redaction.ts` — PII-safe summaries and log metadata.
- `lib/ai/runtime.ts` — provider-neutral eight-step streaming runtime.
- `lib/ai/embeddings.ts` — production and deterministic test embedding adapters.
- `lib/ai/conversation-cookie.ts` — signed anonymous-conversation owner cookie.
- `lib/ai/tools/registry.ts` — typed Concierge tool registry.
- `lib/ai/tools/kb-search.ts` — cited knowledge-base search.
- `lib/ai/tools/member-context.ts` — member-safe context lookup.
- `lib/ai/tools/events.ts` — locale-aware event listing.
- `lib/ai/tools/funding.ts` — deterministic funding lookup.
- `lib/ai/tools/draft-email.ts` — pending approval creation.
- `lib/ai/tools/staff-task.ts` — task creation and escalation.
- `lib/ai/agents/concierge.ts` — shared web/WhatsApp Concierge orchestration.
- `lib/ai/woztell-webhook.ts` — inbound WhatsApp handling and reply-window policy.
- `lib/ai/retention.ts` — 12-month transcript-retention job.
- `lib/security/request-origin.ts` — trusted client-IP and same-origin checks.
- `lib/security/rate-limit.ts` — public chat per-IP limiter.
- `lib/security/turnstile.ts` — Turnstile verification with honeypot fallback.
- `lib/db/repos/conversations.ts` — ownership-safe conversation/message persistence.
- `lib/db/repos/agent-runs.ts` — run lifecycle, usage, latency, and feedback persistence.
- `lib/db/repos/kb-documents.ts` — vector search and deterministic seed operations.
- `lib/db/repos/agent-tools.ts` — scoped member/event reads and safe tool side effects.
- `app/api/ai/concierge/route.ts` — authenticated/anonymous web SSE endpoint.
- `app/api/ai/conversations/[id]/feedback/route.ts` — CSAT endpoint.
- `app/api/webhooks/woztell/route.ts` — verified WOZTELL webhook endpoint.
- `app/api/jobs/chat-retention/route.ts` — cron-authenticated retention endpoint.
- `components/ai/concierge-widget.tsx` — accessible bilingual chat launcher and panel.
- `scripts/seed-m4a.ts` — deterministic M4A knowledge-base seed.
- `evals/concierge.golden.jsonl` — exactly 25 bilingual golden cases.
- `evals/grader.ts` — deterministic and opt-in live evaluation runner.
- `drizzle/0010_m4a_ai_concierge.sql` — pgvector, AI tables, and staff-task extension.

### Modified production files

- `package.json`, `package-lock.json` — AI SDK dependencies and M4A scripts.
- `.env.example`, `lib/config/env.ts` — validated AI, security, and WOZTELL configuration.
- `lib/db/schema-core.ts`, `lib/db/schema.ts`, `lib/db/server-schema.ts`, `lib/db/repos/index.ts` — schema and repository exports.
- `lib/db/repos/staff-tasks.ts`, `lib/db/repos/approvals.ts` — bounded agent side effects.
- `lib/channels/types.ts`, `lib/channels/woztell.ts` — provider IDs, receive time, and 24-hour outbound policy.
- `config/whatsapp-templates.ts` — locale-specific Concierge follow-up templates.
- `app/[locale]/(public)/layout.tsx`, `app/[locale]/(member)/layout.tsx` — Concierge mount points.
- `messages/en.json`, `messages/zh-HK.json` — exact bilingual UI and error copy.
- `workers/src/index.ts`, `workers/wrangler.toml` — daily retention trigger.
- `README.md` — setup, safety, evaluation, and production-gate documentation.

### Test files

- `tests/unit/ai-model.test.ts`
- `tests/unit/ai-pricing.test.ts`
- `tests/unit/ai-redaction.test.ts`
- `tests/unit/ai-runtime.test.ts`
- `tests/unit/ai-tools.test.ts`
- `tests/unit/conversation-cookie.test.ts`
- `tests/unit/concierge-security.test.ts`
- `tests/unit/concierge-service.test.ts`
- `tests/unit/concierge-widget.test.tsx`
- `tests/unit/woztell-concierge.test.ts`
- `tests/unit/chat-retention.test.ts`
- `tests/unit/m4a-seed.test.ts`
- `tests/integration/ai-repositories.test.ts`
- `tests/integration/concierge-route.test.ts`
- `tests/integration/woztell-webhook.test.ts`
- `tests/integration/chat-retention-route.test.ts`
- `tests/e2e/concierge.spec.ts`
- `workers/test/chat-retention.test.ts`

## Task 1: Add M4A dependencies, configuration, and durable schema

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`
- Modify: `lib/config/env.ts`
- Modify: `lib/db/schema-core.ts`
- Modify: `lib/db/schema.ts`
- Modify: `lib/db/server-schema.ts`
- Create: `drizzle/0010_m4a_ai_concierge.sql`
- Modify: `drizzle/meta/_journal.json`
- Create: `drizzle/meta/0010_snapshot.json`
- Create: `tests/unit/ai-model.test.ts`
- Modify: `tests/unit/schema-contract.test.ts`

- [ ] Write tests that require exact-`true` parsing for `AGENTS_ENABLED`, `<provider>:<model-id>` parsing, all new relations, a nullable `staff_tasks.profile_id`, and bounded JSON `staff_tasks.context`.
- [ ] Run `npm.cmd test -- tests/unit/ai-model.test.ts tests/unit/schema-contract.test.ts` and confirm failure because the parser and schema do not exist.
- [ ] Install the pinned current-compatible packages:

```powershell
npm.cmd install ai @ai-sdk/openai @ai-sdk/anthropic
```

- [ ] Extend `ServerEnv` with:

```ts
AGENTS_ENABLED: z.string().optional().transform((value) => value === "true"),
AGENT_MODEL_CONCIERGE: z.string().default("openai:gpt-4.1-mini"),
OPENAI_API_KEY: z.string().optional(),
ANTHROPIC_API_KEY: z.string().optional(),
CONCIERGE_COOKIE_SECRET: z.string().min(32).optional(),
WOZTELL_API_TOKEN: z.string().optional(),
WOZTELL_CHANNEL_ID: z.string().optional(),
WOZTELL_WEBHOOK_SECRET: z.string().optional(),
TURNSTILE_SECRET: z.string().optional(),
```

- [ ] Add Drizzle tables and enums for `kb_documents`, `conversations`, `messages`, and `agent_runs`. Use `customType` for `vector(1536)`, `jsonb` for metadata/citations, timestamps for lifecycle fields, and indexes for owner, provider message ID, conversation time, run time, and retention scans.
- [ ] Define `messages.channel` as `web | whatsapp`, make provider message IDs unique when non-null, and store CSAT on `agent_runs` as nullable integer constrained to 1–5.
- [ ] Change `staff_tasks.profile_id` to nullable and add:

```ts
context: jsonb("context")
  .$type<{
    contactEmail?: string;
    conversationId?: string;
    agentRunId?: string;
    reasonCode?: string;
    locale?: "en" | "zh-HK";
  }>()
  .notNull()
  .default({}),
```

- [ ] Generate and inspect migration metadata, ensuring `CREATE EXTENSION IF NOT EXISTS vector` precedes vector columns and existing staff tasks retain `{}` context.
- [ ] Run the focused tests again and expect all to pass.
- [ ] Run `npm.cmd run typecheck`.
- [ ] Commit:

```powershell
git add package.json package-lock.json .env.example lib/config/env.ts lib/db/schema-core.ts lib/db/schema.ts lib/db/server-schema.ts drizzle tests/unit/ai-model.test.ts tests/unit/schema-contract.test.ts
git commit -m "feat: add M4A AI schema and configuration"
```

## Task 2: Add agent capability and ownership-safe repositories

**Files:**

- Create: `lib/auth/agent-actor.ts`
- Create: `lib/db/repos/conversations.ts`
- Create: `lib/db/repos/agent-runs.ts`
- Modify: `lib/db/repos/staff-tasks.ts`
- Modify: `lib/db/repos/approvals.ts`
- Modify: `lib/db/repos/index.ts`
- Create: `tests/integration/ai-repositories.test.ts`
- Modify: `tests/unit/repository-boundary.test.ts`
- Modify: `tests/unit/repository-production-security.test.ts`

- [ ] Write repository tests for member ownership, anonymous cookie-hash ownership, cross-owner denial, idempotent provider message insert, run lifecycle transitions, CSAT ownership, nullable-profile escalation, and pending-only `agent.draft_email`.
- [ ] Run `npm.cmd test -- tests/integration/ai-repositories.test.ts tests/unit/repository-boundary.test.ts tests/unit/repository-production-security.test.ts` and confirm the expected missing repository/capability failures.
- [ ] Add the narrow actor:

```ts
export type ConciergeAgentActor = {
  kind: "agent";
  agent: "concierge";
  runId: string;
  conversationId: string;
  profileId: string | null;
  trigger: "web" | "whatsapp";
};
```

- [ ] Implement conversation methods `create`, `getOwned`, `appendMessage`, `listMessages`, and `deleteExpired`, taking either a profile owner or a signed anonymous owner hash.
- [ ] Implement run methods `start`, `finish`, `fail`, `escalate`, `disable`, and `recordFeedback`; enforce legal transitions and calculate latency from persisted timestamps.
- [ ] Extend staff-task input with nullable `profileId` and a strict context schema capped at 4096 serialized bytes. Accept only automation or Concierge actors.
- [ ] Add approval type `agent.draft_email` with a strict payload `{to, subject, text, locale, conversationId, agentRunId}`. The repository creates `pending` only; the agent actor cannot decide approvals.
- [ ] Preserve existing M3 callers with required member profiles and empty context defaults.
- [ ] Rerun the focused tests and expect all to pass.
- [ ] Commit:

```powershell
git add lib/auth/agent-actor.ts lib/db/repos tests/integration/ai-repositories.test.ts tests/unit/repository-boundary.test.ts tests/unit/repository-production-security.test.ts
git commit -m "feat: add guarded AI repositories"
```

## Task 3: Build the provider-neutral eight-step runtime

**Files:**

- Create: `config/ai-pricing.ts`
- Create: `lib/ai/model.ts`
- Create: `lib/ai/provider.ts`
- Create: `lib/ai/providers/openai.ts`
- Create: `lib/ai/providers/anthropic.ts`
- Create: `lib/ai/pricing.ts`
- Create: `lib/ai/redaction.ts`
- Create: `lib/ai/runtime.ts`
- Create: `tests/unit/ai-pricing.test.ts`
- Create: `tests/unit/ai-redaction.test.ts`
- Create: `tests/unit/ai-runtime.test.ts`

- [ ] Write failing tests for model resolution, missing provider credentials, maximum eight steps, streaming deltas, normalized citations, usage/cost capture, error finalization, disabled zero-call behavior, and no cross-provider retry after a tool result.
- [ ] Run `npm.cmd test -- tests/unit/ai-pricing.test.ts tests/unit/ai-redaction.test.ts tests/unit/ai-runtime.test.ts` and confirm failures.
- [ ] Define a normalized provider interface:

```ts
export type AgentStreamRequest = {
  model: string;
  system: string;
  messages: AgentMessage[];
  tools: AgentToolSet;
  abortSignal?: AbortSignal;
};

export type AgentStreamResult = {
  textStream: AsyncIterable<string>;
  finish: Promise<{
    usage: { inputTokens: number; outputTokens: number };
    finishReason: string;
    steps: number;
  }>;
};
```

- [ ] Implement OpenAI and Anthropic factories under this interface using `streamText`, tools defined with `inputSchema`, `stopWhen: stepCountIs(8)`, and final aggregate usage.
- [ ] Resolve only configured provider/model pairs and fail before a provider call when the provider key is absent.
- [ ] Store explicit pricing as decimal USD per million tokens and round run cost to six decimal places. Unknown models must fail configuration validation rather than report a misleading zero.
- [ ] Redact email addresses, phone numbers, membership identifiers, access tokens, and long user text from operational summaries.
- [ ] Implement runtime lifecycle so `agentRuns.start` happens before model construction, every terminal path updates the row, and streamed route errors expose stable codes rather than provider messages.
- [ ] Rerun focused tests and expect all to pass.
- [ ] Commit:

```powershell
git add config/ai-pricing.ts lib/ai/model.ts lib/ai/provider.ts lib/ai/providers lib/ai/pricing.ts lib/ai/redaction.ts lib/ai/runtime.ts tests/unit/ai-pricing.test.ts tests/unit/ai-redaction.test.ts tests/unit/ai-runtime.test.ts
git commit -m "feat: add provider-neutral AI runtime"
```

## Task 4: Add knowledge base, embeddings, and deterministic funding data

**Files:**

- Create: `config/funding-schemes.ts`
- Create: `lib/ai/embeddings.ts`
- Create: `lib/db/repos/kb-documents.ts`
- Create: `scripts/seed-m4a.ts`
- Modify: `package.json`
- Create: `tests/unit/m4a-seed.test.ts`
- Add: `tests/fixtures/kb/membership-en.md`
- Add: `tests/fixtures/kb/membership-zh-hk.md`

- [ ] Write failing tests for fixed 1536-dimension deterministic embeddings, namespace replacement, locale filtering, top-k bounds, stable citations, and deterministic bilingual funding results.
- [ ] Run `npm.cmd test -- tests/unit/m4a-seed.test.ts` and confirm failures.
- [ ] Implement an embedding adapter with `embed(text)` and `dimensions: 1536`. Use OpenAI in production and a deterministic hash-based vector in tests.
- [ ] Implement repository methods `replaceNamespace` and `search`; constrain `k` to 1–10 and return `{title, url, excerpt, score}` without raw embeddings.
- [ ] Add immutable funding rules with eligibility inputs and bilingual source URLs. Funding lookup must not call a model or database.
- [ ] Add `npm run db:seed:m4a`, using namespace `m4a-core-v1` and transactionally replacing only that namespace.
- [ ] Rerun focused tests and expect all to pass.
- [ ] Commit:

```powershell
git add config/funding-schemes.ts lib/ai/embeddings.ts lib/db/repos/kb-documents.ts scripts/seed-m4a.ts package.json tests/unit/m4a-seed.test.ts tests/fixtures/kb
git commit -m "feat: add M4A knowledge base"
```

## Task 5: Implement policy-safe Concierge tools

**Files:**

- Create: `lib/db/repos/agent-tools.ts`
- Create: `lib/ai/tools/registry.ts`
- Create: `lib/ai/tools/kb-search.ts`
- Create: `lib/ai/tools/member-context.ts`
- Create: `lib/ai/tools/events.ts`
- Create: `lib/ai/tools/funding.ts`
- Create: `lib/ai/tools/draft-email.ts`
- Create: `lib/ai/tools/staff-task.ts`
- Create: `tests/unit/ai-tools.test.ts`

- [ ] Write failing tests covering `kb_search(query,k)`, authenticated-only `get_member_context`, public/member event visibility, deterministic funding answers, pending draft-email approval, task creation, escalation, strict schemas, and forbidden state mutations.
- [ ] Run `npm.cmd test -- tests/unit/ai-tools.test.ts` and confirm failures.
- [ ] Implement a typed tool context containing the actor, locale, repositories, and an audit callback. Do not expose raw repository clients to provider code.
- [ ] Return citation objects from KB and event tools; include only profile fields required for the current answer and omit payment details, role assignments, and internal notes.
- [ ] Require a confirmed recipient email before `draft_email`. Create an approval and return its ID/status without sending or writing an email log.
- [ ] Make `create_task` and `escalate` write PII-redacted summaries with bounded context keys. Escalation returns a stable reference shown to the user.
- [ ] Export only the seven approved tools:

```ts
[
  "kb_search",
  "get_member_context",
  "list_events",
  "get_funding_schemes",
  "draft_email",
  "create_task",
  "escalate",
]
```

- [ ] Rerun the focused tests and repository-boundary test.
- [ ] Commit:

```powershell
git add lib/db/repos/agent-tools.ts lib/ai/tools tests/unit/ai-tools.test.ts
git commit -m "feat: add guarded Concierge tools"
```

## Task 6: Build the Concierge service and secure web API

**Files:**

- Create: `config/agents/concierge.ts`
- Create: `lib/ai/conversation-cookie.ts`
- Create: `lib/security/request-origin.ts`
- Create: `lib/security/rate-limit.ts`
- Create: `lib/security/turnstile.ts`
- Create: `lib/ai/agents/concierge.ts`
- Create: `app/api/ai/concierge/route.ts`
- Create: `app/api/ai/conversations/[id]/feedback/route.ts`
- Create: `tests/unit/conversation-cookie.test.ts`
- Create: `tests/unit/concierge-security.test.ts`
- Create: `tests/unit/concierge-service.test.ts`
- Create: `tests/integration/concierge-route.test.ts`

- [ ] Write failing tests for bilingual prompt selection, same-origin enforcement, 20 requests/minute/IP, valid signed cookie ownership, cookie tamper rejection, honeypot rejection, Turnstile behavior, member/anonymous continuity, kill switch, SSE events, disconnect cancellation, escalation, citations, and CSAT ownership.
- [ ] Run:

```powershell
npm.cmd test -- tests/unit/conversation-cookie.test.ts tests/unit/concierge-security.test.ts tests/unit/concierge-service.test.ts tests/integration/concierge-route.test.ts
```

and confirm failures.

- [ ] Define the strict request schema:

```ts
z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(2000),
  locale: z.enum(["en", "zh-HK"]),
  website: z.string().max(0).optional(),
  turnstileToken: z.string().max(4096).optional(),
}).strict();
```

- [ ] Sign anonymous ownership using HMAC-SHA256 with `CONCIERGE_COOKIE_SECRET`; store only a random owner token in the HttpOnly, Secure, SameSite=Lax cookie and its one-way hash in the database.
- [ ] Build the Concierge service sequence: resolve owner → persist user message → create run → apply kill switch → execute runtime/tools → persist assistant message/citations → finalize run.
- [ ] Disabled mode must persist the user message, a zero-cost `disabled` run, and one deduplicated leave-message staff task. It must not create a provider or embedding client.
- [ ] Stream the custom SSE protocol:

```text
event: meta      data: {"conversationId":"...","runId":"..."}
event: delta     data: {"text":"..."}
event: done      data: {"citations":[...],"escalationId":null}
event: disabled  data: {"taskId":"..."}
event: error     data: {"code":"AI_TEMPORARILY_UNAVAILABLE"}
```

- [ ] Implement feedback as a separate owned route accepting `{score: 1..5}` once per run.
- [ ] Rerun focused tests and expect all to pass.
- [ ] Commit:

```powershell
git add config/agents/concierge.ts lib/ai/conversation-cookie.ts lib/security lib/ai/agents app/api/ai tests/unit/conversation-cookie.test.ts tests/unit/concierge-security.test.ts tests/unit/concierge-service.test.ts tests/integration/concierge-route.test.ts
git commit -m "feat: add secure web Concierge service"
```

## Task 7: Add the accessible bilingual web chat

**Files:**

- Create: `components/ai/concierge-widget.tsx`
- Modify: `app/[locale]/(public)/layout.tsx`
- Modify: `app/[locale]/(member)/layout.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh-HK.json`
- Create: `tests/unit/concierge-widget.test.tsx`
- Create: `tests/e2e/concierge.spec.ts`

- [ ] Write component tests for launcher labeling, keyboard focus, Escape close, message submit, streaming output, citations, retry, disabled leave-message state, escalation reference, and 1–5 CSAT.
- [ ] Write an e2e scenario for anonymous bilingual continuity and a member-only context scenario guarded by the existing test-account environment.
- [ ] Run `npm.cmd test -- tests/unit/concierge-widget.test.tsx` and confirm the missing component failure.
- [ ] Build a client widget using the custom SSE events, `aria-live="polite"`, a labelled dialog, visible focus, a 2000-character counter, submit/cancel controls, and reduced-motion-safe transitions.
- [ ] Mount it only in public and member layouts. Do not mount on admin or join/payment pages.
- [ ] Add exact English and Traditional Chinese copy under a matching `Concierge` namespace; set `_review: true` for new `zh-HK` keys and preserve message parity.
- [ ] Render citations as safe external links with title and host. Never render provider-produced HTML.
- [ ] Rerun component tests plus `npm.cmd test -- tests/unit/message-contract.test.ts`.
- [ ] Commit:

```powershell
git add components/ai/concierge-widget.tsx app messages tests/unit/concierge-widget.test.tsx tests/e2e/concierge.spec.ts
git commit -m "feat: add bilingual Concierge widget"
```

## Task 8: Add verified WOZTELL inbound and 24-hour reply handling

**Files:**

- Modify: `lib/channels/types.ts`
- Modify: `lib/channels/woztell.ts`
- Modify: `config/whatsapp-templates.ts`
- Create: `lib/ai/woztell-webhook.ts`
- Create: `app/api/webhooks/woztell/route.ts`
- Create: `tests/unit/woztell-concierge.test.ts`
- Create: `tests/integration/woztell-webhook.test.ts`

- [ ] Write failing tests for raw-body HMAC validation, invalid-secret 401, provider message ID extraction, WhatsApp channel persistence, duplicate delivery idempotency, STOP/取消, profile matching by normalized E.164, anonymous senders, 24-hour session replies, blocked free-form replies, and locale-template fallback.
- [ ] Run `npm.cmd test -- tests/unit/woztell-concierge.test.ts tests/integration/woztell-webhook.test.ts` and confirm failures.
- [ ] Extend normalized inbound data with `providerMessageId` and `receivedAt`; require valid timestamps and reject unsupported event types without invoking the Concierge.
- [ ] Extend outbound results with:

```ts
{ status: "blocked"; reason: "outside_customer_service_window" }
```

and require `lastCustomerMessageAt` for session sends.

- [ ] Verify the webhook against the exact raw body before JSON parsing. Respond 401 on invalid or missing production secret.
- [ ] Route accepted text through the shared Concierge service with `trigger: "whatsapp"` and persist both messages with `channel: "whatsapp"`.
- [ ] Outside the 24-hour window, block free-form output and use only `concierge_follow_up_en` or `concierge_follow_up_zh_hk` with ordered variables `memberName`, `supportUrl`. If templates are not configured/approved, escalate instead of sending.
- [ ] Keep fixture tests credential-free; gate a recorded live WOZTELL acceptance behind explicit environment flags.
- [ ] Rerun focused tests and expect all to pass.
- [ ] Commit:

```powershell
git add lib/channels config/whatsapp-templates.ts lib/ai/woztell-webhook.ts app/api/webhooks/woztell tests/unit/woztell-concierge.test.ts tests/integration/woztell-webhook.test.ts
git commit -m "feat: add WOZTELL Concierge channel"
```

## Task 9: Add 12-month transcript retention

**Files:**

- Create: `lib/ai/retention.ts`
- Create: `app/api/jobs/chat-retention/route.ts`
- Modify: `workers/src/index.ts`
- Modify: `workers/wrangler.toml`
- Create: `tests/unit/chat-retention.test.ts`
- Create: `tests/integration/chat-retention-route.test.ts`
- Create: `workers/test/chat-retention.test.ts`

- [ ] Write failing tests for the exact 12-month cutoff, batched deletion, child message/run cleanup, dry-run counts, daily job idempotency, cron authentication, and the `0 3 * * *` Worker schedule.
- [ ] Run:

```powershell
npm.cmd test -- tests/unit/chat-retention.test.ts tests/integration/chat-retention-route.test.ts
npm.cmd --prefix workers test -- chat-retention.test.ts
```

and confirm failures.

- [ ] Implement bounded batches and repeat until fewer than the batch size remain. Use a persisted daily run key so retries do not duplicate operational job records.
- [ ] Add `/api/jobs/chat-retention` with the existing cron-secret contract and stable JSON result.
- [ ] Add a distinct M4 AI job kind rather than altering the exact M3 route-kind contract.
- [ ] Dispatch the new route from the Worker only for `0 3 * * *`; preserve all three M3 schedules.
- [ ] Rerun focused app and Worker tests.
- [ ] Commit:

```powershell
git add lib/ai/retention.ts app/api/jobs/chat-retention workers tests/unit/chat-retention.test.ts tests/integration/chat-retention-route.test.ts
git commit -m "feat: add AI transcript retention"
```

## Task 10: Add exactly 25 deterministic golden evaluations

**Files:**

- Create: `evals/concierge.golden.jsonl`
- Create: `evals/grader.ts`
- Modify: `package.json`
- Create: `tests/unit/concierge-evals.test.ts`

- [ ] Write a contract test requiring exactly 25 unique cases, both locales, KB citations, events, funding, member-context denial, escalation, draft-email pending state, kill switch, adversarial PII, prompt injection, and WhatsApp policy.
- [ ] Run `npm.cmd test -- tests/unit/concierge-evals.test.ts` and confirm the missing corpus/runner failure.
- [ ] Create 25 JSONL cases with stable IDs and explicit assertions. Include at least five adversarial cases and require every PII exfiltration case to refuse.
- [ ] Implement a deterministic mock provider that exercises tool calls and a grader that reports:

```ts
{
  total: 25,
  passed: number,
  score: number,
  piiRefusalsPassed: boolean,
  failures: Array<{ id: string; reason: string }>
}
```

- [ ] Make `npm run eval:concierge` deterministic and fail below 85% or on any PII-refusal failure.
- [ ] Add `npm run eval:concierge:live` as an explicit opt-in requiring `RUN_LIVE_AI_EVALS=true`; it must never run in the default test command.
- [ ] Run `npm.cmd run eval:concierge` and require at least 22/25 plus all PII refusals.
- [ ] Commit:

```powershell
git add evals package.json tests/unit/concierge-evals.test.ts
git commit -m "test: add Concierge golden evaluations"
```

## Task 11: Prove end-to-end M4A acceptance

**Files:**

- Modify: `scripts/seed-m4a.ts`
- Create: `tests/integration/m4a-acceptance.test.ts`
- Modify: `tests/e2e/concierge.spec.ts`
- Modify: `README.md`
- Modify: `.env.example`

- [ ] Add a deterministic acceptance test proving:
  - every web and WhatsApp turn has an `agent_runs` row with status and cost;
  - kill-switch mode records a leave-message task and performs zero provider calls;
  - a platinum email request creates a pending approval and no email log;
  - cited bilingual answers originate from approved KB/event sources;
  - invalid WOZTELL secrets return 401;
  - free-form WhatsApp replies outside 24 hours are blocked;
  - the retention cutoff deletes only expired conversations.
- [ ] Run `npm.cmd test -- tests/integration/m4a-acceptance.test.ts` and confirm it fails until all M4A behavior is wired.
- [ ] Make the seed idempotent for a fixed M4A test member, events, KB namespace, and approval/task cleanup without touching M1–M3 seed data.
- [ ] Run database-backed acceptance only when `RUN_DATABASE_TESTS=true`; keep a deterministic repository-double path in the default suite.
- [ ] Run Playwright against a production build with the mock provider and capture desktop/mobile English and Traditional Chinese flows.
- [ ] Document environment setup, migration/seed order, kill switch, named production approvals, template approval gate, retention, deterministic evals, live-test authorization, and rollback.
- [ ] Rerun the acceptance test and expect it to pass.
- [ ] Commit:

```powershell
git add scripts/seed-m4a.ts tests/integration/m4a-acceptance.test.ts tests/e2e/concierge.spec.ts README.md .env.example
git commit -m "test: prove M4A Concierge acceptance"
```

## Task 12: Full verification, review, and handoff

**Files:**

- Review all M4A files and the complete branch diff.
- Update this plan's checkboxes while executing; do not add implementation placeholders.

- [ ] Run placeholder and accidental-secret scans:

```powershell
rg -n "TODO|FIXME|TBD|sk-[A-Za-z0-9]|postgresql://[^ ]+:[^@ ]+@" lib app components config scripts evals tests workers README.md .env.example
```

Expected result: no implementation placeholders or committed secrets.

- [ ] Run focused security and repository checks:

```powershell
npm.cmd test -- tests/unit/repository-boundary.test.ts tests/unit/repository-production-security.test.ts tests/unit/concierge-security.test.ts tests/integration/woztell-webhook.test.ts
```

- [ ] Run the deterministic evaluation:

```powershell
npm.cmd run eval:concierge
```

Expected result: at least 85% and all adversarial PII cases pass.

- [ ] Run the full application suite:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

- [ ] Run the Worker suite and typecheck:

```powershell
npm.cmd --prefix workers test
npm.cmd --prefix workers run typecheck
```

- [ ] Run the mock-provider browser suite:

```powershell
npm.cmd run test:e2e -- tests/e2e/concierge.spec.ts
```

- [ ] With separate live authorization, run database, provider, Turnstile, and WOZTELL acceptance; otherwise report those checks as gated, not passed.
- [ ] Compare any failure to the M4A baseline: 152 files passed, 831 tests passed, 11 files/31 environment-gated tests skipped, and 27 pre-existing audit findings. Fix new regressions; label unrelated baseline debt separately.
- [ ] Review `git diff d4ac009142258895f51bc381d4aac7b5f8d831ea...HEAD` for scope, PII, secret leakage, generated migration correctness, and exact bilingual copy.
- [ ] Invoke `superpowers:requesting-code-review`, address actionable findings with `superpowers:receiving-code-review`, and rerun affected verification.
- [ ] Invoke `superpowers:verification-before-completion` before claiming M4A complete.
- [ ] Commit any final review fixes as a focused commit. Do not squash unless requested.
- [ ] Invoke `superpowers:finishing-a-development-branch` and present merge/push/PR options after verified completion.

## M4A Completion Gate

M4A is complete only when all of the following are evidenced:

- Provider-neutral OpenAI/Anthropic runtime with an eight-step maximum.
- An `agent_runs` row with status, tokens, latency, and cost for every turn.
- Exact kill switch behavior with zero AI calls and a leave-message staff task.
- Web and WhatsApp Concierge parity, bilingual answers, citations, escalation, and CSAT.
- Pending-only email drafting with no send or email log before approval.
- Invalid WOZTELL secret returns 401; inbound messages record `channel = whatsapp`.
- Free-form WhatsApp output is blocked outside 24 hours and uses only an approved template fallback.
- Exactly 25 golden cases score at least 85%, with every adversarial PII case refusing.
- Twelve-month transcript retention is scheduled and idempotent.
- Default tests need no live credentials; all skipped live gates are listed explicitly.

M4A completion does not complete M4. Retention Analyst and Board Reporter remain M4B; AI-Ops aggregates and full milestone acceptance remain M4C.
