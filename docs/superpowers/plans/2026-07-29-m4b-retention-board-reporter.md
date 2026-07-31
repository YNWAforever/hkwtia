# M4B Retention Analyst and Board Reporter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver two safe scheduled agents: a nightly Retention Analyst that creates review-only outreach approvals for deterministic at-risk members, and a monthly Board Reporter that creates an unpublished board-report page draft from deterministic KPI facts.

**Architecture:** Existing deterministic repositories remain the source of truth. New scheduled-agent actors and `agent_runs` provenance wrap each model call. The Retention Analyst receives a privacy-minimized fact pack and may draft copy only; the Board Reporter receives a fixed KPI fact pack and may draft narrative only. Database constraints and stable source keys make every scheduled effect idempotent. Admin UI renders escaped, staff-only previews; neither agent sends email nor publishes content.

**Tech Stack:** Next.js 16 App Router, TypeScript, Drizzle ORM, Neon PostgreSQL, Vitest, Playwright, Cloudflare Worker cron dispatcher, existing multi-provider AI runtime.

## Global Constraints

- Follow `docs/superpowers/specs/2026-07-29-m4b-retention-board-reporter-design.md`.
- Use test-driven development for every behavior change: write one failing test, run it, implement the minimum, rerun.
- Preserve M4A Concierge ownership semantics and existing web/WhatsApp behavior.
- Use `requireScheduledAgent(actor, expectedAgent)` on every scheduled-agent repository mutation. Never accept an untyped string identity.
- Model output is untrusted plain text. Validate with strict Zod schemas, escape it, and render only the documented safe Markdown subset. Never execute raw MDX.
- The model never receives email addresses, phone numbers, arbitrary SQL, or authority to select recipients, change KPI values, send messages, or publish posts.
- Use stable request/source keys plus database uniqueness for concurrency-safe idempotency; application pre-checks are an optimization only.
- `dryRun=1` performs deterministic selection/calculation and returns counts/facts without calling a model or writing `agent_runs`, approvals, or posts.
- `AI_AGENTS_ENABLED=false` disables both scheduled agents without model calls or writes.
- Use Hong Kong calendar dates/months for source keys and reporting windows.
- Do not provision resources, rotate secrets, merge, or promote Production as part of this plan.

---

## Task 1: Add M4B persistence and provenance

**Files:**

- Modify: `lib/db/schema-core.ts`
- Create: `drizzle/0012_m4b_scheduled_agents.sql`
- Create: `drizzle/meta/0012_snapshot.json`
- Modify: `drizzle/meta/_journal.json`
- Modify: `tests/unit/schema-contract.test.ts`
- Modify: `tests/integration/migration.test.ts`
- Create: `tests/unit/m4b-schema-contract.test.ts`

### Step 1: Write failing schema and migration contract tests

Assert:

- `agent_runs.agent` is non-null and accepts only `concierge`, `retention_analyst`, or `board_reporter`.
- `agent_runs.trigger` also accepts `scheduled`.
- existing rows are backfilled to `concierge` before the column becomes non-null.
- `approvals.request_key` is nullable and has a partial unique index for non-null values.
- `posts` contains the build-spec fields plus `source_key`, `agent_run_id`, `created_at`, and `updated_at`.
- `posts.kind` accepts `news`, `buildlog`, and `page`.
- `posts.slug` is unique and non-null `source_key` is uniquely indexed.
- `posts.agent_run_id` references `agent_runs.id`.

Run:

```powershell
npm.cmd test -- tests/unit/m4b-schema-contract.test.ts tests/integration/migration.test.ts
```

Expected: FAIL because the M4B columns, table, migration, and snapshot do not exist.

### Step 2: Implement the Drizzle schema

Add these public identities:

```ts
export const agentNameEnum = pgEnum("agent_name", [
  "concierge",
  "retention_analyst",
  "board_reporter",
]);

export const postKindEnum = pgEnum("post_kind", ["news", "buildlog", "page"]);
```

Extend the trigger enum with `scheduled`, add `agent` to `agentRuns`, add nullable `requestKey` to `approvals`, and add `posts`.

Use a partial unique index equivalent to:

```sql
CREATE UNIQUE INDEX approvals_request_key_unique
  ON approvals (request_key)
  WHERE request_key IS NOT NULL;
```

Use the same pattern for nullable `posts.source_key`.

### Step 3: Generate and review migration artifacts

Generate the migration using the repo’s Drizzle workflow, then name it `0012_m4b_scheduled_agents.sql`. Ensure its ordering is:

1. create enum values/table/indexes,
2. add nullable `agent_runs.agent`,
3. backfill all existing rows to `concierge`,
4. make `agent_runs.agent` non-null.

Do not hand-edit the snapshot into a shape Drizzle would not generate.

### Step 4: Run focused and baseline schema tests

```powershell
npm.cmd test -- tests/unit/m4b-schema-contract.test.ts tests/unit/schema-contract.test.ts tests/integration/migration.test.ts
npm.cmd run typecheck
```

Expected: PASS.

### Step 5: Commit

```powershell
git add lib/db/schema-core.ts drizzle/0012_m4b_scheduled_agents.sql drizzle/meta/0012_snapshot.json drizzle/meta/_journal.json tests/unit/schema-contract.test.ts tests/integration/migration.test.ts tests/unit/m4b-schema-contract.test.ts
git commit -m "feat: add M4B scheduled agent persistence"
```

---

## Task 2: Generalize agent actors, run lifecycle, and structured scheduled runtime

**Files:**

- Modify: `lib/auth/agent-actor.ts`
- Modify: `lib/db/repos/agent-runs.ts`
- Modify: `lib/ai/runtime.ts`
- Create: `lib/ai/scheduled-runtime.ts`
- Modify: `tests/unit/actor-authorization.test.ts`
- Modify: `tests/unit/ai-runtime.test.ts`
- Modify: `tests/integration/agent-runs-provenance.test.ts`
- Create: `tests/unit/scheduled-agent-runtime.test.ts`

### Step 1: Write failing authorization and lifecycle tests

Define the target contract:

```ts
export type ScheduledAgentName = "retention_analyst" | "board_reporter";

export type ScheduledAgentActor = {
  kind: "agent";
  agent: ScheduledAgentName;
  runId: string;
  conversationId: null;
  profileId: null;
  trigger: "scheduled";
};

export type AgentRunActor = ConciergeAgentActor | ScheduledAgentActor;
```

Test that:

- `requireScheduledAgent` rejects staff, member, Concierge, and the wrong scheduled identity.
- scheduled runs persist the exact agent identity with null conversation/profile.
- Concierge run ownership predicates remain unchanged.
- run finalization cannot cross agent/run identity.

Run:

```powershell
npm.cmd test -- tests/unit/actor-authorization.test.ts tests/integration/agent-runs-provenance.test.ts
```

Expected: FAIL because scheduled actors are unsupported.

### Step 2: Generalize the run actor and repository

Add:

```ts
export function requireAgentRunActor(actor: Actor): AgentRunActor;

export function requireScheduledAgent(
  actor: Actor,
  expected: ScheduledAgentName,
): ScheduledAgentActor;
```

Change the agent-run lifecycle to accept `AgentRunActor`. Scheduled start/finalize predicates must bind `agent`, `runId`, `trigger`, and both null ownership columns. Retain the stricter Concierge conversation/profile predicates.

### Step 3: Write failing structured runtime tests

Test `runScheduledJson` for:

- deferred runtime finalization,
- concatenating streamed text before parsing,
- strict Zod validation,
- exactly one completed run on valid JSON,
- failed run with sanitized error metadata on invalid JSON,
- cancellation/provider failure lifecycle,
- no automatic side effect after parse failure.

Run:

```powershell
npm.cmd test -- tests/unit/scheduled-agent-runtime.test.ts
```

Expected: FAIL because the helper does not exist.

### Step 4: Implement the scheduled JSON helper

Expose a narrow API:

```ts
export async function runScheduledJson<T>(input: {
  actor: ScheduledAgentActor;
  agentConfig: AgentConfig;
  prompt: string;
  outputSchema: z.ZodType<T>;
  signal?: AbortSignal;
}): Promise<T>;
```

It must use the existing runtime with `finalization: "deferred"`, drain text, reject non-text/tool output, parse JSON once, validate strictly, then finish the run. Any parse/validation/provider error must fail the same run and never return a partial value.

### Step 5: Verify and commit

```powershell
npm.cmd test -- tests/unit/actor-authorization.test.ts tests/unit/ai-runtime.test.ts tests/unit/scheduled-agent-runtime.test.ts tests/integration/agent-runs-provenance.test.ts
npm.cmd run typecheck
git add lib/auth/agent-actor.ts lib/db/repos/agent-runs.ts lib/ai/runtime.ts lib/ai/scheduled-runtime.ts tests/unit/actor-authorization.test.ts tests/unit/ai-runtime.test.ts tests/integration/agent-runs-provenance.test.ts tests/unit/scheduled-agent-runtime.test.ts
git commit -m "feat: support scheduled agent runs"
```

---

## Task 3: Build deterministic Retention Analyst inputs and output contracts

**Files:**

- Create: `config/agents/retention-analyst.ts`
- Create: `lib/ai/retention-analyst/contracts.ts`
- Create: `lib/ai/retention-analyst/candidates.ts`
- Create: `lib/db/repos/retention-analyst.ts`
- Create: `tests/unit/retention-analyst-contracts.test.ts`
- Create: `tests/unit/retention-analyst-candidates.test.ts`
- Create: `tests/integration/retention-analyst-candidates.test.ts`

### Step 1: Write failing candidate-selection tests

Reuse `classifyAtRisk` from `lib/admin/at-risk.ts`, but do not call an admin-authenticated page service. Test a dedicated automation repository that projects:

```ts
type RetentionCandidate = {
  profileId: string;
  membershipId: string;
  locale: "en" | "zh-HK";
  planCode: string;
  renewalDate: string | null;
  score: number | null;
  trend: "up" | "flat" | "down" | null;
  riskCodes: Array<"low_score_declining" | "inactive_before_renewal">;
};
```

Assert deterministic ordering by `profileId`, no display name/email/phone, and exact correspondence with the two approved at-risk branches.

Run:

```powershell
npm.cmd test -- tests/unit/retention-analyst-candidates.test.ts tests/integration/retention-analyst-candidates.test.ts
```

Expected: FAIL because the automation repository and projection do not exist.

### Step 2: Implement the privacy-minimized candidate reader

Keep raw identity/contact columns out of the selected projection. Normalize unsupported/missing locale to `zh-HK`. Return only active/renewing eligible memberships that the shared classifier marks at risk.

### Step 3: Write failing prompt/output contract tests

The strict output schema is:

```ts
const retentionDraftSchema = z
  .object({
    subject: z.string().min(1).max(160),
    body: z.string().min(1).max(4000),
    reasonCodes: z
      .array(z.enum(["low_score_declining", "inactive_before_renewal"]))
      .min(1),
  })
  .strict();
```

Assert that the prompt:

- contains only approved fact-pack fields,
- permits only `{{first_name}}`, `{{renewal_date}}`, and app-owned safe links,
- forbids invented discounts, threats, contact details, sending, and recipient changes,
- instructs JSON-only output in the candidate locale.

### Step 4: Implement the config and contracts

Follow `config/agents/concierge.ts` model resolution conventions, but use a distinct agent version such as `retention-analyst-v1`. Keep the system prompt static and separately serialize the fact pack.

### Step 5: Verify and commit

```powershell
npm.cmd test -- tests/unit/at-risk.test.ts tests/unit/retention-analyst-contracts.test.ts tests/unit/retention-analyst-candidates.test.ts tests/integration/retention-analyst-candidates.test.ts
npm.cmd run typecheck
git add config/agents/retention-analyst.ts lib/ai/retention-analyst/contracts.ts lib/ai/retention-analyst/candidates.ts lib/db/repos/retention-analyst.ts tests/unit/retention-analyst-contracts.test.ts tests/unit/retention-analyst-candidates.test.ts tests/integration/retention-analyst-candidates.test.ts
git commit -m "feat: define retention analyst inputs"
```

---

## Task 4: Create idempotent Retention Analyst drafts

**Files:**

- Create: `lib/ai/retention-analyst/service.ts`
- Modify: `lib/db/repos/approvals.ts`
- Create: `tests/unit/retention-analyst-service.test.ts`
- Create: `tests/integration/retention-analyst-idempotency.test.ts`

### Step 1: Write failing service tests

Test:

- each deterministic candidate gets one scheduled `agent_run`,
- valid model output creates one pending `agent.retention_outreach` approval,
- requester is system/agent provenance, never a fabricated staff member,
- payload includes profile/membership IDs, locale, approved reason codes, subject/body, and run ID,
- payload excludes email and phone,
- profiles with an existing pending retention outreach are skipped,
- model/schema failure creates no approval,
- `AI_AGENTS_ENABLED=false` creates no runs or approvals.

Stable key:

```ts
`retention:${hongKongDate}:${profileId}:${agentVersion}`;
```

Run:

```powershell
npm.cmd test -- tests/unit/retention-analyst-service.test.ts tests/integration/retention-analyst-idempotency.test.ts
```

Expected: FAIL because the service and idempotent repository method do not exist.

### Step 2: Add the scheduled-agent approval mutation

Implement:

```ts
createRetentionOutreachOnce(input: {
  actor: ScheduledAgentActor;
  requestKey: string;
  profileId: string;
  membershipId: string;
  locale: "en" | "zh-HK";
  reasonCodes: RetentionRiskCode[];
  subject: string;
  body: string;
}): Promise<{ approvalId: string; created: boolean }>;
```

Require `retention_analyst`, insert only `pending`, and use `ON CONFLICT`/unique-key recovery so concurrent attempts return the existing record. Do not write `email_log`, enqueue a delivery, or call an email transport.

### Step 3: Implement orchestration

Process candidates in deterministic order with a bounded concurrency of 3. Return aggregate counts:

```ts
type RetentionRunSummary = {
  considered: number;
  drafted: number;
  skippedPending: number;
  deduplicated: number;
  failed: number;
};
```

One candidate failure must be recorded and must not cancel successful independent candidates. Do not retry schema-invalid output inside the service.

### Step 4: Verify and commit

```powershell
npm.cmd test -- tests/unit/retention-analyst-service.test.ts tests/integration/retention-analyst-idempotency.test.ts tests/unit/campaign-no-delivery.test.ts
npm.cmd run typecheck
git add lib/ai/retention-analyst/service.ts lib/db/repos/approvals.ts tests/unit/retention-analyst-service.test.ts tests/integration/retention-analyst-idempotency.test.ts
git commit -m "feat: draft retention outreach approvals"
```

---

## Task 5: Schedule and expose the Retention Analyst safely

**Files:**

- Modify: `lib/jobs/kinds.ts`
- Modify: `lib/jobs/runners.ts`
- Create: `app/api/jobs/retention-analyst/route.ts`
- Modify: `workers/src/index.ts`
- Modify: `tests/unit/job-kind-contract.test.ts`
- Modify: `tests/unit/job-routes.test.ts`
- Create: `tests/integration/retention-analyst-route.test.ts`
- Modify: `workers/tests/worker.test.ts`
- Create: `workers/test/retention-analyst.test.ts`

### Step 1: Write failing route and Worker tests

Assert:

- unauthenticated route calls return 401,
- only absent `dryRun` or exact `dryRun=1` is accepted,
- dry run returns deterministic candidate counts and makes no model/writes,
- normal route uses job claims and stable HK daily run key,
- Worker dispatches `15 18 * * *` to `/api/jobs/retention-analyst`,
- AI jobs use a 240-second request timeout while existing jobs retain their current timeout,
- retries reuse the server-side stable claim/key.

Run:

```powershell
npm.cmd test -- tests/unit/job-kind-contract.test.ts tests/unit/job-routes.test.ts tests/integration/retention-analyst-route.test.ts
npm.cmd --prefix workers test
```

Expected: FAIL because the job kind, route, schedule, and timeout policy do not exist.

### Step 2: Implement job kind, runner, and route

Follow `app/api/jobs/chat-retention/route.ts` and `lib/jobs/handler.ts`. Add `retention-analyst` without weakening the job secret check. Supply:

```ts
runKey: `retention-analyst:${hongKongDate}`;
```

The route must branch before creating a job claim when `dryRun=1`.

### Step 3: Implement Worker schedule and timeout

Extend the Worker job union. Use an explicit timeout map so only Retention Analyst and Board Reporter can receive 240 seconds; do not globally relax every job.

### Step 4: Verify and commit

```powershell
npm.cmd test -- tests/unit/job-kind-contract.test.ts tests/unit/job-routes.test.ts tests/integration/retention-analyst-route.test.ts
npm.cmd --prefix workers test
npm.cmd run typecheck
git add lib/jobs/kinds.ts lib/jobs/runners.ts app/api/jobs/retention-analyst/route.ts workers/src/index.ts tests/unit/job-kind-contract.test.ts tests/unit/job-routes.test.ts tests/integration/retention-analyst-route.test.ts workers/tests/worker.test.ts workers/test/retention-analyst.test.ts
git commit -m "feat: schedule retention analyst"
```

---

## Task 6: Build deterministic Board Reporter facts and safe document rendering

**Files:**

- Create: `config/agents/board-reporter.ts`
- Create: `lib/ai/board-reporter/contracts.ts`
- Create: `lib/ai/board-reporter/reporting-window.ts`
- Create: `lib/ai/board-reporter/facts.ts`
- Create: `lib/ai/board-reporter/render.ts`
- Modify: `lib/db/repos/reports.ts`
- Create: `tests/unit/board-reporting-window.test.ts`
- Create: `tests/unit/board-reporter-contracts.test.ts`
- Create: `tests/unit/board-reporter-render.test.ts`
- Create: `tests/integration/board-reporter-facts.test.ts`

### Step 1: Write failing reporting-window and fact tests

Define the previous complete Hong Kong calendar month, including year rollover and DST-independent UTC bounds. The authoritative metric IDs are:

```ts
type BoardMetricId =
  | "arr_hkd"
  | "mrr_hkd"
  | "renewal_rate"
  | "first_year_renewal_rate"
  | "funnel_started"
  | "funnel_profile_completed"
  | "funnel_checkout_or_review"
  | "funnel_activated"
  | "attendance_rate"
  | "at_risk_count";
```

Test that facts reuse `reconcileReportFacts`/existing formulas, preserve exact numeric values, and cannot be supplied by model output.

Run:

```powershell
npm.cmd test -- tests/unit/board-reporting-window.test.ts tests/unit/board-reporter-contracts.test.ts tests/integration/board-reporter-facts.test.ts
```

Expected: FAIL because Board Reporter facts do not exist.

### Step 2: Implement the automation fact reader

Add a repository method authorized for `board_reporter`, not an admin page service. Reuse the existing report SQL/formulas and add the deterministic at-risk count. Return a fixed ordered metric array with value, unit, and optional numerator/denominator.

### Step 3: Write failing renderer tests

Strict model output:

```ts
const boardNarrativeSchema = z
  .object({
    executiveSummary: z.string().min(1).max(4000),
    highlights: z.array(z.string().min(1).max(500)).max(8),
    risks: z.array(z.string().min(1).max(500)).max(8),
    recommendedActions: z.array(z.string().min(1).max(500)).max(8),
  })
  .strict();
```

Assert the renderer:

- builds the numeric KPI table from facts, never narrative,
- escapes HTML and unsupported Markdown,
- allows only paragraphs, headings, bullets, emphasis, and app-owned links,
- rejects/neutralizes scripts, raw HTML, images, embeds, and executable MDX,
- includes report month and agent-run provenance.

### Step 4: Implement prompt, validation, and deterministic renderer

Use `board-reporter-v1`. Tell the model explicitly that supplied numbers are immutable and that it must not invent comparisons when no comparison facts exist. The rendered `body_mdx` is safe Markdown text composed by application code.

### Step 5: Verify and commit

```powershell
npm.cmd test -- tests/unit/report-formulas.test.ts tests/unit/report-reconciliation.test.ts tests/unit/board-reporting-window.test.ts tests/unit/board-reporter-contracts.test.ts tests/unit/board-reporter-render.test.ts tests/integration/board-reporter-facts.test.ts
npm.cmd run typecheck
git add config/agents/board-reporter.ts lib/ai/board-reporter/contracts.ts lib/ai/board-reporter/reporting-window.ts lib/ai/board-reporter/facts.ts lib/ai/board-reporter/render.ts lib/db/repos/reports.ts tests/unit/board-reporting-window.test.ts tests/unit/board-reporter-contracts.test.ts tests/unit/board-reporter-render.test.ts tests/integration/board-reporter-facts.test.ts
git commit -m "feat: define board reporter fact packs"
```

---

## Task 7: Create idempotent monthly Board Reporter drafts

**Files:**

- Create: `lib/db/repos/posts.ts`
- Modify: `lib/db/repos/index.ts`
- Create: `lib/ai/board-reporter/service.ts`
- Create: `tests/unit/posts-repository.test.ts`
- Create: `tests/unit/board-reporter-service.test.ts`
- Create: `tests/integration/board-reporter-idempotency.test.ts`

### Step 1: Write failing repository and service tests

Stable source key:

```ts
`board-report:${reportMonth}:${agentVersion}`;
```

Assert:

- one `board_reporter` run consumes one deterministic fact pack,
- valid narrative creates a `kind=page` post with `published_at=null`,
- slug is stable for the month,
- exact KPI values in the document match facts,
- duplicate/concurrent invocation returns the same post,
- model/schema failure creates no post,
- disabled agents create no run/post,
- no code path sets `published_at`.

Run:

```powershell
npm.cmd test -- tests/unit/posts-repository.test.ts tests/unit/board-reporter-service.test.ts tests/integration/board-reporter-idempotency.test.ts
```

Expected: FAIL because the repository and service do not exist.

### Step 2: Implement the posts repository

Expose:

```ts
createBoardDraftOnce(input: {
  actor: ScheduledAgentActor;
  sourceKey: string;
  slug: string;
  titleEn: string;
  titleZh: string;
  bodyMdx: string;
}): Promise<{ postId: string; created: boolean }>;
```

Require `board_reporter`, force `kind=page`, `publishedAt=null`, and `author="Board Reporter"`. Use database uniqueness for concurrency safety and retain the winning run’s provenance.

### Step 3: Implement service orchestration

Read facts, start a scheduled run, request/validate narrative, render deterministic content, and atomically create/recover the draft. Return the report month, post ID, created flag, and metric count.

### Step 4: Verify and commit

```powershell
npm.cmd test -- tests/unit/posts-repository.test.ts tests/unit/board-reporter-service.test.ts tests/integration/board-reporter-idempotency.test.ts
npm.cmd run typecheck
git add lib/db/repos/posts.ts lib/db/repos/index.ts lib/ai/board-reporter/service.ts tests/unit/posts-repository.test.ts tests/unit/board-reporter-service.test.ts tests/integration/board-reporter-idempotency.test.ts
git commit -m "feat: draft monthly board reports"
```

---

## Task 8: Schedule and expose the Board Reporter safely

**Files:**

- Modify: `lib/jobs/kinds.ts`
- Modify: `lib/jobs/runners.ts`
- Create: `app/api/jobs/board-reporter/route.ts`
- Modify: `workers/src/index.ts`
- Modify: `tests/unit/job-kind-contract.test.ts`
- Modify: `tests/unit/job-routes.test.ts`
- Create: `tests/integration/board-reporter-route.test.ts`
- Modify: `workers/tests/worker.test.ts`
- Create: `workers/test/board-reporter.test.ts`

### Step 1: Write failing route and schedule tests

Assert:

- unauthenticated calls return 401,
- strict `dryRun=1` returns the report month and authoritative facts without model/writes,
- normal route uses stable HK monthly run key,
- Worker dispatches `30 0 1 * *` to `/api/jobs/board-reporter`,
- Board Reporter receives the explicit 240-second timeout,
- retries cannot create a second post.

Run:

```powershell
npm.cmd test -- tests/unit/job-kind-contract.test.ts tests/unit/job-routes.test.ts tests/integration/board-reporter-route.test.ts
npm.cmd --prefix workers test
```

Expected: FAIL because the route and schedule do not exist.

### Step 2: Implement route and Worker dispatch

Use:

```ts
runKey: `board-reporter:${reportMonth}`;
```

The dry-run branch occurs before job claim creation. Preserve all Retention Analyst schedule/timeout tests from Task 5.

### Step 3: Verify and commit

```powershell
npm.cmd test -- tests/unit/job-kind-contract.test.ts tests/unit/job-routes.test.ts tests/integration/board-reporter-route.test.ts
npm.cmd --prefix workers test
npm.cmd run typecheck
git add lib/jobs/kinds.ts lib/jobs/runners.ts app/api/jobs/board-reporter/route.ts workers/src/index.ts tests/unit/job-kind-contract.test.ts tests/unit/job-routes.test.ts tests/integration/board-reporter-route.test.ts workers/tests/worker.test.ts workers/test/board-reporter.test.ts
git commit -m "feat: schedule board reporter"
```

---

## Task 9: Add staff-only approval and board-draft previews

**Files:**

- Modify: `lib/admin/approvals.ts`
- Modify: `components/admin/approval-list.tsx`
- Modify: `app/[locale]/(admin)/admin/approvals/page.tsx`
- Create: `lib/admin/board-drafts.ts`
- Create: `components/admin/board-draft-list.tsx`
- Create: `components/admin/safe-generated-content.tsx`
- Modify: `app/[locale]/(admin)/admin/reports/page.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh-HK.json`
- Modify: `tests/unit/approval-service.test.ts`
- Modify: `tests/unit/approval-list.test.tsx`
- Create: `tests/unit/board-draft-admin.test.ts`
- Create: `tests/unit/safe-generated-content.test.tsx`
- Modify: `tests/unit/messages.test.ts`

### Step 1: Write failing UI/service tests

Assert:

- staff can see a safe retention subject/body preview and reason labels,
- contact details are absent,
- existing approve/reject state transitions still work,
- reports page lists only unpublished Board Reporter `page` drafts,
- Board draft preview requires admin auth,
- generated script/raw HTML/MDX is displayed as inert text,
- there is no send button and no publish button,
- both locales contain equivalent labels.

Run:

```powershell
npm.cmd test -- tests/unit/approval-service.test.ts tests/unit/approval-list.test.tsx tests/unit/board-draft-admin.test.ts tests/unit/safe-generated-content.test.tsx tests/unit/messages.test.ts
```

Expected: FAIL because M4B approval summaries and board-draft preview do not exist.

### Step 2: Implement admin read models and safe renderer

The renderer may map parsed safe blocks to React elements; it must not use `dangerouslySetInnerHTML`, `next-mdx-remote`, dynamic imports, or `eval`. Board-draft repository queries require an admin actor and return provenance plus safe display fields.

### Step 3: Implement localized UI

Add the Retention Analyst preview to approvals and a “Board report drafts” section to reports. Keep actions review-only. Preserve exact English and Traditional Chinese meaning.

### Step 4: Verify and commit

```powershell
npm.cmd test -- tests/unit/approval-service.test.ts tests/unit/approval-list.test.tsx tests/unit/board-draft-admin.test.ts tests/unit/safe-generated-content.test.tsx tests/unit/messages.test.ts tests/unit/admin-presentational.test.tsx
npm.cmd run typecheck
git add lib/admin/approvals.ts components/admin/approval-list.tsx app/[locale]/(admin)/admin/approvals/page.tsx lib/admin/board-drafts.ts components/admin/board-draft-list.tsx components/admin/safe-generated-content.tsx app/[locale]/(admin)/admin/reports/page.tsx messages/en.json messages/zh-HK.json tests/unit/approval-service.test.ts tests/unit/approval-list.test.tsx tests/unit/board-draft-admin.test.ts tests/unit/safe-generated-content.test.tsx tests/unit/messages.test.ts
git commit -m "feat: preview M4B agent drafts in admin"
```

---

## Task 10: Add isolated M4B seed and acceptance coverage

**Files:**

- Create: `scripts/seed-m4b.ts`
- Modify: `package.json`
- Create: `tests/unit/m4b-seed.test.ts`
- Create: `tests/integration/m4b-acceptance.test.ts`
- Create: `tests/e2e/m4b-agents.spec.ts`
- Create: `docs/acceptance/m4b.md`

### Step 1: Write failing seed and acceptance tests

Create isolated fixtures for:

- exactly three qualifying at-risk profiles,
- at least one non-qualifying profile,
- deterministic previous-month report facts,
- no pre-existing M4B approvals/posts.

Acceptance assertions:

1. Retention run creates exactly three pending approvals.
2. A rerun still leaves exactly three.
3. No `email_log` or delivery is created.
4. Board run creates exactly one unpublished `page` draft.
5. A rerun still leaves exactly one.
6. Every rendered KPI equals the deterministic source fact.
7. Kill switch causes zero model calls/runs/drafts.
8. Both cron routes reject unauthenticated requests.
9. Admin previews are staff-only and expose no send/publish action.

Run:

```powershell
npm.cmd test -- tests/unit/m4b-seed.test.ts tests/integration/m4b-acceptance.test.ts
```

Expected: FAIL before seed and acceptance harness implementation.

### Step 2: Implement the seed

Add:

```json
"db:seed:m4b": "tsx scripts/seed-m4b.ts"
```

Require an explicit M4B acceptance environment guard and refuse Production. Use stable fixture IDs/source labels so rerunning the seed is deterministic.

### Step 3: Implement integration and browser acceptance

Gate database tests behind the existing isolated-test database convention. Gate model-backed Preview acceptance behind explicit M4B environment flags and test accounts. Browser tests log in as staff and verify safe previews, not cron execution.

### Step 4: Document exact acceptance procedure

`docs/acceptance/m4b.md` must separate:

- hermetic unit tests,
- isolated Neon integration tests,
- local browser checks,
- opt-in Preview/model checks,
- Production-excluded actions.

Do not state that a gated layer passed when it was skipped.

### Step 5: Verify and commit

```powershell
npm.cmd test -- tests/unit/m4b-seed.test.ts tests/integration/m4b-acceptance.test.ts
npm.cmd run e2e -- tests/e2e/m4b-agents.spec.ts
npm.cmd run typecheck
git add scripts/seed-m4b.ts package.json package-lock.json tests/unit/m4b-seed.test.ts tests/integration/m4b-acceptance.test.ts tests/e2e/m4b-agents.spec.ts docs/acceptance/m4b.md
git commit -m "test: add M4B acceptance coverage"
```

---

## Task 11: Full verification, Preview evidence, and handoff

**Files:**

- Modify only if verification finds an M4B regression.
- Update: `docs/acceptance/m4b.md` with actual command outcomes and deployment evidence.

### Step 1: Run focused security/static checks

```powershell
rg -n "dangerouslySetInnerHTML|eval\\(|new Function|sendEmail|publishedAt:\\s*new Date|published_at\\s*=\\s*now" lib/ai/retention-analyst lib/ai/board-reporter lib/admin components/admin app/api/jobs
rg -n "email|phone" lib/ai/retention-analyst
```

Expected: no unsafe renderer/execution, send, or publish path; any identity-field match must be a prohibition/test assertion rather than fact-pack data.

### Step 2: Run the complete local suite

```powershell
npm.cmd test
npm.cmd --prefix workers test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd run audit:strings
```

Expected: all required checks pass. Record gated skips separately from passes.

### Step 3: Run isolated database acceptance when credentials are available

```powershell
npm.cmd run db:migrate
npm.cmd run db:seed:m4b
npm.cmd test -- --config vitest.integration.config.ts tests/integration/m4b-acceptance.test.ts
```

Verify database counts directly after each rerun. Never use the Production database.

### Step 4: Run local browser acceptance

```powershell
npm.cmd run e2e -- tests/e2e/m4b-agents.spec.ts
```

Capture evidence for both locales and both staff-only preview surfaces.

### Step 5: Deploy and verify an isolated Preview when authorized

Use Preview-only Neon resources, explicit test accounts, and preview environment variables. Verify:

- authenticated dry runs,
- exactly-three retention approval idempotency,
- no outbound delivery,
- one unpublished board draft with exact KPIs,
- staff-only safe rendering,
- kill switch behavior,
- deployment-specific Vercel logs contain no M4B errors.

Do not point the cron Worker at Preview permanently and do not promote to Production.

### Step 6: Request final code review

Use `superpowers:requesting-code-review`. Resolve every Critical/Important issue and rerun the affected checks. Then use `superpowers:verification-before-completion` before claiming completion.

### Step 7: Commit verification documentation

```powershell
git add docs/acceptance/m4b.md
git commit -m "docs: record M4B verification evidence"
```

If the evidence file is unchanged, do not create an empty commit.

### Step 8: Handoff

Report:

- final commit and branch,
- exact pass/fail/skip counts,
- isolated database and Preview deployment IDs used,
- remaining gates,
- explicit statement that M4C public `/ai-ops` aggregation and Production rollout remain out of scope.
