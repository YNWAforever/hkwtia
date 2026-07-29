# M4C Public AI-Ops Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete M4 by shipping an hourly refreshed, privacy-safe PostgreSQL materialized view; a bilingual server-rendered public AI-Ops dashboard; published build-log evidence; deterministic demo telemetry; and the complete M4 acceptance gate.

**Architecture:** Drizzle declares `aiops_monthly_metrics` as a PostgreSQL materialized view and application code refreshes it concurrently through the existing authenticated hourly Worker/job pipeline. The public route reads only a strict aggregate projection and published `buildlog` posts, classifies freshness in a pure service, and renders server-only KPI, renewal, architecture, and evidence components. Stable M4C seed ownership creates the exact build-spec demo counts without deleting unrelated records.

**Tech Stack:** Next.js 16 App Router, React 19 Server Components, TypeScript, Drizzle ORM 0.45, Neon PostgreSQL, next-intl, Zod, Vitest, Playwright, Cloudflare Worker Cron Triggers.

## Global Constraints

- Follow `docs/superpowers/specs/2026-07-29-m4c-ai-ops-public-dashboard-design.md`.
- Use test-driven development for every behavior change: write one failing test, run it, implement the minimum, rerun.
- Keep the materialized view to exactly twelve `Asia/Hong_Kong` calendar months, including zero-activity months.
- Public aggregate rows contain scalars only: no IDs, free text, JSON, locale, channel address, provider message ID, summary, error code, prompt, or model response.
- Keep the public dashboard server-rendered. Do not add browser fetches, polling, or a client charting runtime.
- Preserve the final demo contract: exactly 40 seeded `agent_runs`, 15 Concierge conversations, 12 resolved, three escalated, zero failed, CSAT at least 4.5, and exactly two published build-log posts.
- Always render escalation and failure counts/rates, including zero.
- Use the existing cron bearer verification, `jobs.run_key` attempt fence, three Worker attempts, bounded timeouts, and final staff alert.
- Published build-log readers require `kind = 'buildlog'` and `published_at <= now()`; drafts, future posts, `page` posts, and unknown kinds are never public.
- Render database MDX as inert structured text. Never use `dangerouslySetInnerHTML`, executable MDX, dynamic imports, `eval`, raw HTML, or external Markdown links.
- Use exact English and Traditional Chinese copy specified in Task 7. Do not introduce visible untranslated strings.
- Do not provision Production resources, rotate secrets, merge, promote Production, publish Board Reporter drafts, or enable live agents as part of this plan.
- Run live model checks only after separate explicit authorization. Deterministic mocks are the default acceptance provider.

---

## File Structure

### Database and aggregation

- `lib/db/schema-core.ts`: declare `aiopsMonthlyMetrics` and its public scalar columns.
- `drizzle/0013_m4c_aiops_metrics.sql`: create the populated materialized view and unique month index.
- `drizzle/meta/0013_snapshot.json`: Drizzle-generated schema snapshot.
- `drizzle/meta/_journal.json`: register migration `0013_m4c_aiops_metrics`.
- `lib/aiops/contracts.ts`: strict public aggregate Zod schemas and TypeScript types.
- `lib/db/repos/aiops-public.ts`: read the latest twelve validated aggregate rows.
- `lib/db/repos/aiops-metrics.ts`: automation-only concurrent refresh capability.

### Scheduling

- `lib/jobs/kinds.ts`: add `aiops-metrics`.
- `lib/jobs/runners.ts`: production refresh runner and injectable test override.
- `app/api/jobs/aiops-metrics/route.ts`: authenticated hourly job endpoint.
- `workers/src/index.ts`: add the hourly Worker dispatch and timeout entry.

### Public content and UI

- `lib/db/repos/public-posts.ts`: published build-log summary/detail reader.
- `components/content/safe-structured-content.tsx`: inert structured-content parser shared by admin and public surfaces.
- `components/admin/safe-generated-content.tsx`: compatibility wrapper for Board Reporter previews.
- `components/marketing/build-log-card.tsx`: localized published build-log list item.
- `components/marketing/build-log-detail.tsx`: localized build-log detail and safe body.
- `lib/aiops/dashboard.ts`: freshness/degraded-state builder.
- `config/aiops-evidence.ts`: fixed HTTPS external evidence allowlist.
- `components/marketing/aiops/metric-grid.tsx`: KPI cards and denominators.
- `components/marketing/aiops/renewal-chart.tsx`: accessible server-rendered SVG plus semantic table.
- `components/marketing/aiops/architecture-diagram.tsx`: semantic system and approval-gate flow.
- `components/marketing/aiops/evidence-links.tsx`: published build logs and external evidence.
- `components/marketing/aiops/dashboard.tsx`: page composition.
- `app/[locale]/(public)/ai-ops/page.tsx`: server data loading, metadata, and safe degraded state.
- `app/[locale]/(public)/news/page.tsx`: combine static news and published build logs.
- `app/[locale]/(public)/news/[slug]/page.tsx`: static lookup with published build-log fallback.
- `app/sitemap.ts`: include every localized published build-log detail route.
- `messages/en.json`, `messages/zh-HK.json`: exact bilingual dashboard/build-log copy.

### Demo and acceptance

- `lib/acceptance/m4c-ownership.ts`: stable fixture namespace and ownership marker.
- `scripts/seed-m4c.ts`: guarded, idempotent M4C seed and post-commit view refresh.
- `package.json`: add `db:seed:m4c`.
- `tests/unit/*`, `tests/integration/*`, `tests/e2e/*`: focused contracts listed per task.
- `docs/acceptance/m4.md`: exact local, isolated-database, Preview, and browser evidence.

---

## Task 1: Declare and migrate the AI-Ops materialized view

**Files:**

- Modify: `lib/db/schema-core.ts`
- Create: `drizzle/0013_m4c_aiops_metrics.sql`
- Create: `drizzle/meta/0013_snapshot.json`
- Modify: `drizzle/meta/_journal.json`
- Create: `tests/unit/m4c-schema-contract.test.ts`
- Modify: `tests/integration/migration.test.ts`

**Interfaces:**

- Produces: `aiopsMonthlyMetrics`, a Drizzle `pgMaterializedView`.
- Produces columns: `monthStart`, `isPartialMonth`, `conversationCount`, `terminalConversationCount`, `resolvedConversationCount`, `escalatedConversationCount`, `failedConversationCount`, `agentResolvedRate`, `escalationRate`, `failureRate`, `medianFirstResponseMs`, `firstResponseSampleCount`, `csatAverage`, `csatResponseCount`, `staffHoursSaved`, `llmCostUsd`, `renewalDueCount`, `renewalPaidCount`, `renewalRate`, `firstYearRenewalDueCount`, `firstYearRenewalPaidCount`, `firstYearRenewalRate`, `refreshedAt`.
- Later tasks consume: `typeof aiopsMonthlyMetrics.$inferSelect` and `db.refreshMaterializedView(aiopsMonthlyMetrics).concurrently()`.

- [ ] **Step 1: Write the failing schema contract**

Create `tests/unit/m4c-schema-contract.test.ts` and assert:

```ts
const view = (serverSchema as Record<string, unknown>).aiopsMonthlyMetrics;
expect(view).toBeDefined();

const migration = readFileSync(
  resolve("drizzle/0013_m4c_aiops_metrics.sql"),
  "utf8",
);
expect(migration).toMatch(/CREATE MATERIALIZED VIEW "aiops_monthly_metrics"/);
expect(migration).toMatch(
  /CREATE UNIQUE INDEX "aiops_monthly_metrics_month_start_unique"/,
);
expect(migration).toContain("Asia/Hong_Kong");
expect(migration).toContain("generate_series");
expect(migration).toContain("percentile_disc");
expect(migration).toContain("renewal_paid");
expect(migration).toContain("renewal_failed");
expect(migration).not.toMatch(
  /\b(profile_id|conversation_id|message_id|content|metadata|summary|error_code)\b\s+AS\s+"/i,
);
```

Parse `drizzle/meta/0013_snapshot.json` and assert it contains
`public.aiops_monthly_metrics`. Parse `_journal.json` and assert its last tag
is `0013_m4c_aiops_metrics`.

- [ ] **Step 2: Run the test and verify the expected failure**

```powershell
npm.cmd test -- tests/unit/m4c-schema-contract.test.ts
```

Expected: FAIL because the materialized view and migration artifacts do not
exist.

- [ ] **Step 3: Add the Drizzle materialized-view declaration**

Add `date` and `pgMaterializedView` to the `drizzle-orm/pg-core` imports. Place
the view after all source tables and before inferred row types:

```ts
export const aiopsMonthlyMetrics = pgMaterializedView(
  "aiops_monthly_metrics",
  {
    monthStart: date("month_start").notNull(),
    isPartialMonth: boolean("is_partial_month").notNull(),
    conversationCount: integer("conversation_count").notNull(),
    terminalConversationCount: integer("terminal_conversation_count").notNull(),
    resolvedConversationCount: integer("resolved_conversation_count").notNull(),
    escalatedConversationCount: integer("escalated_conversation_count").notNull(),
    failedConversationCount: integer("failed_conversation_count").notNull(),
    agentResolvedRate: numeric("agent_resolved_rate", {precision: 7, scale: 6}),
    escalationRate: numeric("escalation_rate", {precision: 7, scale: 6}),
    failureRate: numeric("failure_rate", {precision: 7, scale: 6}),
    medianFirstResponseMs: integer("median_first_response_ms"),
    firstResponseSampleCount: integer("first_response_sample_count").notNull(),
    csatAverage: numeric("csat_average", {precision: 4, scale: 2}),
    csatResponseCount: integer("csat_response_count").notNull(),
    staffHoursSaved: numeric("staff_hours_saved", {precision: 12, scale: 2}).notNull(),
    llmCostUsd: numeric("llm_cost_usd", {precision: 12, scale: 6}).notNull(),
    renewalDueCount: integer("renewal_due_count").notNull(),
    renewalPaidCount: integer("renewal_paid_count").notNull(),
    renewalRate: numeric("renewal_rate", {precision: 7, scale: 6}),
    firstYearRenewalDueCount: integer("first_year_renewal_due_count").notNull(),
    firstYearRenewalPaidCount: integer("first_year_renewal_paid_count").notNull(),
    firstYearRenewalRate: numeric("first_year_renewal_rate", {precision: 7, scale: 6}),
    refreshedAt: timestamp("refreshed_at", {withTimezone: true}).notNull(),
  },
).as(sql`
  WITH settings AS (
    SELECT
      date_trunc('month', timezone('Asia/Hong_Kong', now()))::date
        AS current_month,
      now() AS refreshed_at
  ),
  months AS (
    SELECT
      generated.month_start::date AS month_start,
      generated.month_start::date = settings.current_month AS is_partial_month,
      generated.month_start::timestamp AT TIME ZONE 'Asia/Hong_Kong' AS month_from,
      (generated.month_start + interval '1 month')::timestamp
        AT TIME ZONE 'Asia/Hong_Kong' AS month_to,
      settings.refreshed_at
    FROM settings
    CROSS JOIN LATERAL generate_series(
      settings.current_month - interval '11 months',
      settings.current_month,
      interval '1 month'
    ) AS generated(month_start)
  ),
  month_conversations AS (
    SELECT months.month_start, months.month_to, conversations.id
    FROM months
    INNER JOIN conversations
      ON conversations.agent_kind = 'concierge'
     AND conversations.created_at >= months.month_from
     AND conversations.created_at < months.month_to
  ),
  latest_terminal AS (
    SELECT DISTINCT ON (month_conversations.month_start, agent_runs.conversation_id)
      month_conversations.month_start,
      agent_runs.conversation_id,
      agent_runs.status
    FROM month_conversations
    INNER JOIN agent_runs
      ON agent_runs.conversation_id = month_conversations.id
     AND agent_runs.agent = 'concierge'
     AND agent_runs.status IN ('completed', 'escalated', 'failed')
     AND agent_runs.completed_at IS NOT NULL
     AND agent_runs.completed_at < month_conversations.month_to
    ORDER BY month_conversations.month_start, agent_runs.conversation_id,
      agent_runs.completed_at DESC, agent_runs.created_at DESC,
      agent_runs.id DESC
  ),
  first_user AS (
    SELECT DISTINCT ON (month_conversations.month_start, messages.conversation_id)
      month_conversations.month_start,
      messages.conversation_id,
      messages.created_at,
      messages.id
    FROM month_conversations
    INNER JOIN messages ON messages.conversation_id = month_conversations.id
    WHERE messages.role = 'user'
    ORDER BY month_conversations.month_start, messages.conversation_id,
      messages.created_at, messages.id
  ),
  first_response AS (
    SELECT
      first_user.month_start,
      first_user.conversation_id,
      floor(extract(epoch FROM (
        min(messages.created_at) - first_user.created_at
      )) * 1000)::integer AS latency_ms
    FROM first_user
    INNER JOIN messages
      ON messages.conversation_id = first_user.conversation_id
     AND messages.role = 'assistant'
     AND messages.created_at >= first_user.created_at
    GROUP BY first_user.month_start, first_user.conversation_id,
      first_user.created_at
    HAVING min(messages.created_at) >= first_user.created_at
  ),
  conversation_aggregates AS (
    SELECT
      months.month_start,
      count(DISTINCT month_conversations.id)::integer AS conversation_count,
      count(DISTINCT latest_terminal.conversation_id)::integer
        AS terminal_conversation_count,
      count(DISTINCT latest_terminal.conversation_id)
        FILTER (WHERE latest_terminal.status = 'completed')::integer
        AS resolved_conversation_count,
      count(DISTINCT latest_terminal.conversation_id)
        FILTER (WHERE latest_terminal.status = 'escalated')::integer
        AS escalated_conversation_count,
      count(DISTINCT latest_terminal.conversation_id)
        FILTER (WHERE latest_terminal.status = 'failed')::integer
        AS failed_conversation_count
    FROM months
    LEFT JOIN month_conversations
      ON month_conversations.month_start = months.month_start
    LEFT JOIN latest_terminal
      ON latest_terminal.month_start = months.month_start
     AND latest_terminal.conversation_id = month_conversations.id
    GROUP BY months.month_start
  ),
  response_aggregates AS (
    SELECT
      months.month_start,
      percentile_disc(0.5) WITHIN GROUP (ORDER BY first_response.latency_ms)
        FILTER (WHERE first_response.latency_ms >= 0)::integer
        AS median_first_response_ms,
      count(first_response.latency_ms)
        FILTER (WHERE first_response.latency_ms >= 0)::integer
        AS first_response_sample_count
    FROM months
    LEFT JOIN first_response ON first_response.month_start = months.month_start
    GROUP BY months.month_start
  ),
  cost_aggregates AS (
    SELECT
      months.month_start,
      coalesce(sum(agent_runs.cost_usd), 0)::numeric(12, 6) AS llm_cost_usd
    FROM months
    LEFT JOIN agent_runs
      ON agent_runs.started_at >= months.month_from
     AND agent_runs.started_at < months.month_to
    GROUP BY months.month_start
  ),
  csat_aggregates AS (
    SELECT
      months.month_start,
      avg(agent_runs.csat_score)::numeric(4, 2) AS csat_average,
      count(agent_runs.csat_score)::integer AS csat_response_count
    FROM months
    LEFT JOIN agent_runs
      ON agent_runs.agent = 'concierge'
     AND agent_runs.status IN ('completed', 'escalated', 'failed')
     AND agent_runs.csat_score IS NOT NULL
     AND agent_runs.completed_at >= months.month_from
     AND agent_runs.completed_at < months.month_to
    GROUP BY months.month_start
  ),
  renewal_per_membership AS (
    SELECT
      months.month_start,
      engagement_events.metadata ->> 'membershipId' AS membership_id,
      bool_or(engagement_events.type = 'renewal_paid') AS paid,
      bool_or(
        jsonb_typeof(engagement_events.metadata -> 'renewalOrdinal') = 'number'
        AND engagement_events.metadata -> 'renewalOrdinal' = '1'::jsonb
      ) AS first_year_due,
      bool_or(
        engagement_events.type = 'renewal_paid'
        AND jsonb_typeof(engagement_events.metadata -> 'renewalOrdinal') = 'number'
        AND engagement_events.metadata -> 'renewalOrdinal' = '1'::jsonb
      ) AS first_year_paid
    FROM months
    INNER JOIN engagement_events
      ON engagement_events.occurred_at >= months.month_from
     AND engagement_events.occurred_at < months.month_to
     AND engagement_events.type IN ('renewal_paid', 'renewal_failed')
    INNER JOIN memberships
      ON memberships.id::text =
        engagement_events.metadata ->> 'membershipId'
    GROUP BY months.month_start,
      engagement_events.metadata ->> 'membershipId'
  ),
  renewal_aggregates AS (
    SELECT
      months.month_start,
      count(renewal_per_membership.membership_id)::integer
        AS renewal_due_count,
      count(renewal_per_membership.membership_id)
        FILTER (WHERE renewal_per_membership.paid)::integer
        AS renewal_paid_count,
      count(renewal_per_membership.membership_id)
        FILTER (WHERE renewal_per_membership.first_year_due)::integer
        AS first_year_renewal_due_count,
      count(renewal_per_membership.membership_id)
        FILTER (WHERE renewal_per_membership.first_year_paid)::integer
        AS first_year_renewal_paid_count
    FROM months
    LEFT JOIN renewal_per_membership
      ON renewal_per_membership.month_start = months.month_start
    GROUP BY months.month_start
  )
  SELECT
    months.month_start,
    months.is_partial_month,
    conversation_aggregates.conversation_count,
    conversation_aggregates.terminal_conversation_count,
    conversation_aggregates.resolved_conversation_count,
    conversation_aggregates.escalated_conversation_count,
    conversation_aggregates.failed_conversation_count,
    CASE WHEN conversation_aggregates.terminal_conversation_count = 0
      THEN NULL ELSE
      conversation_aggregates.resolved_conversation_count::numeric
        / conversation_aggregates.terminal_conversation_count END
      ::numeric(7, 6) AS agent_resolved_rate,
    CASE WHEN conversation_aggregates.terminal_conversation_count = 0
      THEN NULL ELSE
      conversation_aggregates.escalated_conversation_count::numeric
        / conversation_aggregates.terminal_conversation_count END
      ::numeric(7, 6) AS escalation_rate,
    CASE WHEN conversation_aggregates.terminal_conversation_count = 0
      THEN NULL ELSE
      conversation_aggregates.failed_conversation_count::numeric
        / conversation_aggregates.terminal_conversation_count END
      ::numeric(7, 6) AS failure_rate,
    response_aggregates.median_first_response_ms,
    response_aggregates.first_response_sample_count,
    csat_aggregates.csat_average,
    csat_aggregates.csat_response_count,
    (conversation_aggregates.resolved_conversation_count::numeric / 10)
      ::numeric(12, 2) AS staff_hours_saved,
    cost_aggregates.llm_cost_usd,
    renewal_aggregates.renewal_due_count,
    renewal_aggregates.renewal_paid_count,
    CASE WHEN renewal_aggregates.renewal_due_count = 0
      THEN NULL ELSE
      renewal_aggregates.renewal_paid_count::numeric
        / renewal_aggregates.renewal_due_count END
      ::numeric(7, 6) AS renewal_rate,
    renewal_aggregates.first_year_renewal_due_count,
    renewal_aggregates.first_year_renewal_paid_count,
    CASE WHEN renewal_aggregates.first_year_renewal_due_count = 0
      THEN NULL ELSE
      renewal_aggregates.first_year_renewal_paid_count::numeric
        / renewal_aggregates.first_year_renewal_due_count END
      ::numeric(7, 6) AS first_year_renewal_rate,
    months.refreshed_at
  FROM months
  INNER JOIN conversation_aggregates USING (month_start)
  INNER JOIN response_aggregates USING (month_start)
  INNER JOIN cost_aggregates USING (month_start)
  INNER JOIN csat_aggregates USING (month_start)
  INNER JOIN renewal_aggregates USING (month_start)
  ORDER BY months.month_start
`);
```

- [ ] **Step 4: Generate and review migration artifacts**

```powershell
npm.cmd exec drizzle-kit generate -- --config=drizzle.config.ts --name=m4c_aiops_metrics
```

Expected: creates `0013_m4c_aiops_metrics.sql`,
`drizzle/meta/0013_snapshot.json`, and a journal entry. Add this index after
the generated view:

```sql
CREATE UNIQUE INDEX "aiops_monthly_metrics_month_start_unique"
  ON "aiops_monthly_metrics" ("month_start");
```

Do not replace the generated snapshot with hand-authored metadata.

- [ ] **Step 5: Extend the migration integration assertions**

In `tests/integration/migration.test.ts`, query `pg_matviews` and `pg_indexes`:

```ts
const view = await pool.query(
  `SELECT matviewname, ispopulated
     FROM pg_matviews
    WHERE schemaname = 'public'
      AND matviewname = 'aiops_monthly_metrics'`,
);
expect(view.rows).toEqual([{
  matviewname: "aiops_monthly_metrics",
  ispopulated: true,
}]);

const index = await pool.query(
  `SELECT indexname
     FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'aiops_monthly_metrics_month_start_unique'`,
);
expect(index.rows).toEqual([{
  indexname: "aiops_monthly_metrics_month_start_unique",
}]);
```

- [ ] **Step 6: Run focused schema checks**

```powershell
npm.cmd test -- tests/unit/m4c-schema-contract.test.ts tests/unit/m4b-schema-contract.test.ts tests/unit/schema-contract.test.ts
npm.cmd run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add lib/db/schema-core.ts drizzle/0013_m4c_aiops_metrics.sql drizzle/meta/0013_snapshot.json drizzle/meta/_journal.json tests/unit/m4c-schema-contract.test.ts tests/integration/migration.test.ts
git commit -m "feat: add M4C AI-Ops materialized view"
```

---

## Task 2: Validate aggregate rows and prove every formula

**Files:**

- Create: `lib/aiops/contracts.ts`
- Create: `lib/db/repos/aiops-public.ts`
- Create: `tests/unit/aiops-public-repository.test.ts`
- Create: `tests/integration/aiops-materialized-view.test.ts`

**Interfaces:**

- Produces: `AiOpsMonthlyMetric`, `aiOpsMonthlyMetricSchema`.
- Produces: `AiOpsPublicRepository.readLatestTwelveMonths(): Promise<readonly AiOpsMonthlyMetric[]>`.
- Later tasks consume the validated rows only; they never consume Drizzle rows.

- [ ] **Step 1: Write failing public-row schema tests**

Use a complete valid fixture and mutate one field per case:

```ts
const valid = {
  monthStart: "2026-07-01",
  isPartialMonth: true,
  conversationCount: 15,
  terminalConversationCount: 15,
  resolvedConversationCount: 12,
  escalatedConversationCount: 3,
  failedConversationCount: 0,
  agentResolvedRate: 0.8,
  escalationRate: 0.2,
  failureRate: 0,
  medianFirstResponseMs: 800,
  firstResponseSampleCount: 15,
  csatAverage: 4.5,
  csatResponseCount: 10,
  staffHoursSaved: 1.2,
  llmCostUsd: 0.068,
  renewalDueCount: 10,
  renewalPaidCount: 9,
  renewalRate: 0.9,
  firstYearRenewalDueCount: 5,
  firstYearRenewalPaidCount: 4,
  firstYearRenewalRate: 0.8,
  refreshedAt: new Date("2026-07-30T00:00:00.000Z"),
} as const;

expect(aiOpsMonthlyMetricSchema.parse(valid)).toEqual(valid);
expect(() => aiOpsMonthlyMetricSchema.parse({
  ...valid,
  profileId: "private-profile",
})).toThrow();
expect(() => aiOpsMonthlyMetricSchema.parse({
  ...valid,
  agentResolvedRate: 1.01,
})).toThrow();
expect(() => aiOpsMonthlyMetricSchema.parse({
  ...valid,
  failedConversationCount: -1,
})).toThrow();
```

The schema must be `.strict()`, use exact `YYYY-MM-01`, finite non-negative
numbers, nullable rates/latency/CSAT, and CSAT from one to five.

- [ ] **Step 2: Run and verify failure**

```powershell
npm.cmd test -- tests/unit/aiops-public-repository.test.ts
```

Expected: FAIL because the contract and repository do not exist.

- [ ] **Step 3: Implement the strict contract and reader**

`lib/aiops/contracts.ts` exports:

```ts
export const aiOpsMonthlyMetricSchema = z.object({
  monthStart: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/),
  isPartialMonth: z.boolean(),
  conversationCount: z.number().int().nonnegative(),
  terminalConversationCount: z.number().int().nonnegative(),
  resolvedConversationCount: z.number().int().nonnegative(),
  escalatedConversationCount: z.number().int().nonnegative(),
  failedConversationCount: z.number().int().nonnegative(),
  agentResolvedRate: z.number().finite().min(0).max(1).nullable(),
  escalationRate: z.number().finite().min(0).max(1).nullable(),
  failureRate: z.number().finite().min(0).max(1).nullable(),
  medianFirstResponseMs: z.number().int().nonnegative().nullable(),
  firstResponseSampleCount: z.number().int().nonnegative(),
  csatAverage: z.number().finite().min(1).max(5).nullable(),
  csatResponseCount: z.number().int().nonnegative(),
  staffHoursSaved: z.number().finite().nonnegative(),
  llmCostUsd: z.number().finite().nonnegative(),
  renewalDueCount: z.number().int().nonnegative(),
  renewalPaidCount: z.number().int().nonnegative(),
  renewalRate: z.number().finite().min(0).max(1).nullable(),
  firstYearRenewalDueCount: z.number().int().nonnegative(),
  firstYearRenewalPaidCount: z.number().int().nonnegative(),
  firstYearRenewalRate: z.number().finite().min(0).max(1).nullable(),
  refreshedAt: z.date(),
}).strict().superRefine((value, context) => {
  if (
    value.resolvedConversationCount
      + value.escalatedConversationCount
      + value.failedConversationCount
    !== value.terminalConversationCount
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "terminal outcome counts must reconcile",
    });
  }
});

export type AiOpsMonthlyMetric =
  z.infer<typeof aiOpsMonthlyMetricSchema>;
```

`lib/db/repos/aiops-public.ts` maps decimal strings with `Number`, projects
every named field explicitly, parses each row, orders ascending, and rejects
any result whose length is not twelve or whose month keys are not unique.

- [ ] **Step 4: Write the database formula fixture**

`tests/integration/aiops-materialized-view.test.ts` is guarded by
`DATABASE_URL_TEST`. Use only stable `m4c-formula-*` IDs on an isolated test
database. Seed:

- 15 conversations in the current Hong Kong month;
- 12 latest `completed`, three latest `escalated`, and an earlier failed run
  whose later completion proves latest-terminal selection;
- first-response latencies `100, 200, ... 1500`, producing median `800`;
- ten CSAT scores: five `5` and five `4`, producing `4.5`;
- 38 Concierge run costs plus one Retention and one Board cost totalling
  `0.068000`;
- duplicate paid/failed renewal events for one membership to prove distinct
  membership reconciliation;
- no activity eleven months ago to prove a zero row remains present.

Refresh the view and assert:

```ts
expect(current).toMatchObject({
  conversation_count: 15,
  terminal_conversation_count: 15,
  resolved_conversation_count: 12,
  escalated_conversation_count: 3,
  failed_conversation_count: 0,
  agent_resolved_rate: "0.800000",
  escalation_rate: "0.200000",
  failure_rate: "0.000000",
  median_first_response_ms: 800,
  first_response_sample_count: 15,
  csat_average: "4.50",
  csat_response_count: 10,
  staff_hours_saved: "1.20",
  llm_cost_usd: "0.068000",
});
expect(rows).toHaveLength(12);
expect(new Set(rows.map(({month_start}) => month_start)).size).toBe(12);
```

Also assert renewal overall/first-year rates, year-boundary month ordering,
null rates when denominators are zero, and absence of PII columns through
`information_schema.columns`.

- [ ] **Step 5: Run unit and isolated-database checks**

```powershell
npm.cmd test -- tests/unit/aiops-public-repository.test.ts
$env:DATABASE_URL_TEST="<isolated-neon-url>"
$env:DATABASE_URL=$env:DATABASE_URL_TEST
npm.cmd run db:migrate
npm.cmd test -- tests/integration/aiops-materialized-view.test.ts tests/integration/migration.test.ts
Remove-Item Env:DATABASE_URL
Remove-Item Env:DATABASE_URL_TEST
```

Expected: 12 ordered rows and all exact aggregate assertions PASS. Never print
the database URL.

- [ ] **Step 6: Commit**

```powershell
git add lib/aiops/contracts.ts lib/db/repos/aiops-public.ts tests/unit/aiops-public-repository.test.ts tests/integration/aiops-materialized-view.test.ts
git commit -m "feat: add validated AI-Ops aggregate reader"
```

---

## Task 3: Add the authenticated concurrent refresh job

**Files:**

- Create: `lib/db/repos/aiops-metrics.ts`
- Modify: `lib/jobs/kinds.ts`
- Modify: `lib/jobs/runners.ts`
- Create: `app/api/jobs/aiops-metrics/route.ts`
- Create: `tests/unit/aiops-metrics-repository.test.ts`
- Create: `tests/unit/aiops-metrics-route.test.ts`
- Modify: `tests/unit/job-kind-contract.test.ts`

**Interfaces:**

- Produces: `AiOpsMetricsRepository.refresh(actor: AutomationRepositoryActor): Promise<void>`.
- Produces: `jobRunners.aiOpsMetrics(now: Date): Promise<{refreshed: 1}>`.
- Produces: `POST /api/jobs/aiops-metrics`, hourly run key
  `aiops-metrics:YYYY-MM-DDTHH`.

- [ ] **Step 1: Write failing repository capability tests**

Use an injected database with:

```ts
const concurrently = vi.fn(async () => undefined);
const refreshMaterializedView = vi.fn(() => ({concurrently}));
```

Assert `automationCronActor()` invokes the exact view once, and member, staff,
Stripe-system, and scheduled-agent actors fail with `FORBIDDEN` before the
database loader runs.

- [ ] **Step 2: Write failing route lifecycle tests**

Create the route through an injectable `createAiOpsMetricsPost` factory and
assert:

```ts
expect(unauthorized.status).toBe(401);
expect(methodNotAllowed.status).toBe(405);
expect(firstBody).toEqual({
  duplicate: false,
  summary: {refreshed: 1},
});
expect(secondBody).toEqual({duplicate: true});
expect(run).toHaveBeenCalledOnce();
expect(claim).toHaveBeenCalledWith(
  automationCronActor(),
  "aiops-metrics:2026-07-30T03",
  "aiops-metrics",
);
```

When `refresh` throws a secret-bearing error, assert the response is exactly
`{error: "JOB_RUN_FAILED"}`, status 500, the attempt is failed, and neither
response nor console contains the thrown text.

- [ ] **Step 3: Run and verify failure**

```powershell
npm.cmd test -- tests/unit/aiops-metrics-repository.test.ts tests/unit/aiops-metrics-route.test.ts tests/unit/job-kind-contract.test.ts
```

Expected: FAIL because the repository, job kind, runner, and route are absent.

- [ ] **Step 4: Implement the repository and runner**

`lib/db/repos/aiops-metrics.ts`:

```ts
export function createAiOpsMetricsRepository(
  loadDatabase: () => Promise<Database> = getDb,
) {
  return {
    async refresh(actor: AutomationRepositoryActor): Promise<void> {
      requireAutomationCron(actor);
      const database = await loadDatabase();
      await database
        .refreshMaterializedView(aiopsMonthlyMetrics)
        .concurrently();
    },
  };
}

export const aiOpsMetricsRepository =
  createAiOpsMetricsRepository();
```

Add:

```ts
M4_AI_JOB_KIND.AI_OPS_METRICS = "aiops-metrics";
```

and include it in `M4_AI_JOB_KINDS`.

In `createJobRunners`, add an injectable `runAiOpsMetrics` defaulting to:

```ts
export async function runProductionAiOpsMetrics(
  _now: Date,
): Promise<{refreshed: 1}> {
  await aiOpsMetricsRepository.refresh(automationCronActor());
  return {refreshed: 1};
}
```

- [ ] **Step 5: Implement the route**

`app/api/jobs/aiops-metrics/route.ts`:

```ts
import {
  createJobPost,
  type JobHandlerRepository,
} from "@/lib/jobs/handler";
import {M4_AI_JOB_KIND} from "@/lib/jobs/kinds";
import {jobRunners} from "@/lib/jobs/runners";

type AiOpsMetricsRouteOptions = Readonly<{
  jobs?: JobHandlerRepository;
  now?: () => Date;
  secret?: () => string | null | undefined;
  runner?: (now: Date) => Promise<unknown>;
}>;

export function createAiOpsMetricsPost(
  options: AiOpsMetricsRouteOptions = {},
) {
  return createJobPost({
    kind: M4_AI_JOB_KIND.AI_OPS_METRICS,
    bucket: "hourly",
    jobs: options.jobs,
    now: options.now,
    secret: options.secret,
    run: ({now}) =>
      (options.runner ?? jobRunners.aiOpsMetrics)(now),
  });
}

export const POST = createAiOpsMetricsPost();
```

- [ ] **Step 6: Run focused job tests**

```powershell
npm.cmd test -- tests/unit/aiops-metrics-repository.test.ts tests/unit/aiops-metrics-route.test.ts tests/unit/job-kind-contract.test.ts tests/unit/job-handler.test.ts
npm.cmd run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add lib/db/repos/aiops-metrics.ts lib/jobs/kinds.ts lib/jobs/runners.ts app/api/jobs/aiops-metrics/route.ts tests/unit/aiops-metrics-repository.test.ts tests/unit/aiops-metrics-route.test.ts tests/unit/job-kind-contract.test.ts
git commit -m "feat: add hourly AI-Ops refresh job"
```

---

## Task 4: Dispatch AI-Ops refresh from the Cloudflare Worker

**Files:**

- Modify: `workers/src/index.ts`
- Modify: `workers/tests/worker.test.ts`
- Modify: `workers/tests/package-contract.test.ts`
- Verify: `workers/wrangler.toml`

**Interfaces:**

- Consumes: `POST /api/jobs/aiops-metrics`.
- Produces: hourly Worker dispatch with bearer auth, 10-second timeout, three
  attempts, delays `[250, 1000]`, and one final alert.

- [ ] **Step 1: Update failing Worker expectations**

Change the hourly mapping assertion to:

```ts
["0 * * * *", [
  "aiops-metrics",
  "approvals-expirer",
  "journey-runner",
]],
```

Add a failure test whose fetch returns 503 only for `/aiops-metrics`. Assert
three attempts, delays `[250, 1000]`, and:

```ts
expect(alertPayload).toEqual({
  job: "aiops-metrics",
  scheduledTime: "2026-07-26T02:00:00.123Z",
  attemptCount: 3,
  errorCode: "JOB_HTTP_ERROR",
});
```

- [ ] **Step 2: Run and verify failure**

```powershell
Set-Location workers
npm.cmd test -- tests/worker.test.ts tests/package-contract.test.ts
Set-Location ..
```

Expected: FAIL because `aiops-metrics` is not a Worker job.

- [ ] **Step 3: Add the Worker job**

Extend `WorkerJob`, add `"aiops-metrics"` to `BASE_JOBS`, and add a
`REQUEST_TIMEOUT_BY_JOB` entry of `10_000`. Keep
`workers/wrangler.toml` hourly cron unchanged because `0 * * * *` already
exists.

Do not add a second hourly trigger or a body to the request.

- [ ] **Step 4: Run Worker gates**

```powershell
Set-Location workers
npm.cmd test
npm.cmd run typecheck
Set-Location ..
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add workers/src/index.ts workers/tests/worker.test.ts workers/tests/package-contract.test.ts
git commit -m "feat: schedule hourly AI-Ops refresh"
```

---

## Task 5: Publish safe build-log posts through the news routes

**Files:**

- Create: `lib/db/repos/public-posts.ts`
- Create: `tests/unit/public-posts-repository.test.ts`
- Create: `components/content/safe-structured-content.tsx`
- Modify: `components/admin/safe-generated-content.tsx`
- Modify: `tests/unit/safe-generated-content.test.tsx`
- Create: `components/marketing/build-log-card.tsx`
- Create: `components/marketing/build-log-detail.tsx`
- Modify: `app/[locale]/(public)/news/page.tsx`
- Modify: `app/[locale]/(public)/news/[slug]/page.tsx`
- Modify: `app/sitemap.ts`
- Create: `tests/unit/build-log-pages.test.tsx`
- Create: `tests/unit/sitemap.test.ts`

**Interfaces:**

- Produces: `PublishedBuildLogSummary` and `PublishedBuildLogDetail`.
- Produces:
  `listPublishedBuildLogs(asOf?: Date): Promise<readonly PublishedBuildLogSummary[]>`.
- Produces:
  `getPublishedBuildLogBySlug(slug: string, asOf?: Date): Promise<PublishedBuildLogDetail | null>`.
- Produces: `SafeStructuredContent` modes `board-report` and `build-log`.

- [ ] **Step 1: Write failing repository privacy tests**

With a pg-proxy database, assert generated SQL:

```ts
expect(query.sql).toMatch(/FROM "posts"/i);
expect(query.sql).toMatch(/kind.*=.*buildlog/i);
expect(query.sql).toMatch(/published_at.*IS NOT NULL/i);
expect(query.sql).toMatch(/published_at.*<=/i);
expect(query.sql).not.toMatch(
  /agent_run_id|source_key|profile|email|phone|summary/i,
);
```

The summary shape is:

```ts
type PublishedBuildLogSummary = Readonly<{
  slug: string;
  titleEn: string;
  titleZh: string;
  publishedAt: Date;
  author: string;
}>;
```

The detail adds only `bodyMdx`. Test invalid slugs are rejected before database
access. Test future, null-published, `page`, and `news` rows never appear.

- [ ] **Step 2: Write failing safe-renderer and route tests**

Test build-log mode renders arbitrary bounded bilingual `##` headings,
paragraphs, bold text, lists, and root-relative links, while leaving these
inert:

```ts
const hostile = [
  "<script>alert(1)</script>",
  "import Widget from './widget'",
  "{dangerousExpression()}",
  "[external](https://attacker.example)",
  "[unsafe](javascript:alert(1))",
].join("\n");
```

Assert `/news` combines static entries and published build-log cards. Assert
`/news/[slug]` returns a published DB detail, but calls `notFound()` for a
draft/future/unknown slug. Assert metadata selects `titleEn` for `en` and
`titleZh` for `zh-HK`.

- [ ] **Step 3: Run and verify failure**

```powershell
npm.cmd test -- tests/unit/public-posts-repository.test.ts tests/unit/safe-generated-content.test.tsx tests/unit/build-log-pages.test.tsx tests/unit/sitemap.test.ts
```

Expected: FAIL because the reader, shared renderer, and dynamic public content
paths do not exist.

- [ ] **Step 4: Implement the public-posts repository**

Use strict Zod row schemas and an explicit Drizzle selection. The only where
predicate is:

```ts
and(
  eq(posts.kind, "buildlog"),
  isNotNull(posts.publishedAt),
  lte(posts.publishedAt, asOf),
)
```

Detail adds `eq(posts.slug, parsedSlug)` and `.limit(1)`. List ordering is
`publishedAt DESC, slug ASC`.

- [ ] **Step 5: Extract the inert structured-content engine**

Move the parser engine to
`components/content/safe-structured-content.tsx`:

```ts
export type SafeStructuredContentMode =
  | "board-report"
  | "build-log";

export function SafeStructuredContent({
  content,
  mode,
  tableHeaders,
}: Readonly<{
  content: string;
  mode: SafeStructuredContentMode;
  tableHeaders: Readonly<{kpi: string; value: string}>;
}>) {
  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4 text-foreground">
      {safeBlocks(content, mode, tableHeaders)}
    </div>
  );
}
```

Board mode retains the exact existing title, heading, and KPI grammar.
Build-log mode accepts no `#` title because the page owns the single `<h1>`;
it accepts `##` text only when length is 1–120 and it contains none of
`<`, `>`, `{`, or `}`. Both modes keep the existing safe internal-link regex
and React escaping.

Keep `SafeGeneratedContent` as a compatibility wrapper that passes
`mode="board-report"`. Update its source-contract test path.

- [ ] **Step 6: Integrate news routes and sitemap**

The news index loads published summaries and renders localized
`BuildLogCard`s after static news. The detail route checks static content
first, then queries the published detail. Render `BuildLogDetail` with the
locale-selected title and `SafeStructuredContent mode="build-log"`.

Make `sitemap()` async, append each published slug through
`localizedEntries`, and catch only the public-post repository read at the
sitemap boundary so static URLs remain available during a transient build-log
read failure.

- [ ] **Step 7: Run focused public-content checks**

```powershell
npm.cmd test -- tests/unit/public-posts-repository.test.ts tests/unit/safe-generated-content.test.tsx tests/unit/build-log-pages.test.tsx tests/unit/sitemap.test.ts tests/unit/detail-pages.test.ts
npm.cmd run typecheck
```

Expected: PASS with no draft content and no executable markup.

- [ ] **Step 8: Commit**

```powershell
git add lib/db/repos/public-posts.ts tests/unit/public-posts-repository.test.ts components/content/safe-structured-content.tsx components/admin/safe-generated-content.tsx tests/unit/safe-generated-content.test.tsx components/marketing/build-log-card.tsx components/marketing/build-log-detail.tsx app/[locale]/(public)/news/page.tsx app/[locale]/(public)/news/[slug]/page.tsx app/sitemap.ts tests/unit/build-log-pages.test.tsx tests/unit/sitemap.test.ts
git commit -m "feat: publish safe M4 build logs"
```

---

## Task 6: Build the dashboard state and fixed evidence contract

**Files:**

- Create: `lib/aiops/dashboard.ts`
- Create: `config/aiops-evidence.ts`
- Create: `tests/unit/aiops-dashboard.test.ts`
- Create: `tests/unit/aiops-evidence.test.ts`

**Interfaces:**

- Produces: `AiOpsDashboardState` status
  `"fresh" | "stale" | "empty" | "unavailable"`.
- Produces:
  `buildAiOpsDashboardState(rows, now): AiOpsDashboardState`.
- Produces: `AI_OPS_EXTERNAL_EVIDENCE`, a frozen validated HTTPS list.

- [ ] **Step 1: Write failing state tests**

Define:

```ts
export type AiOpsDashboardState =
  | Readonly<{
      status: "fresh" | "stale";
      current: AiOpsMonthlyMetric;
      months: readonly AiOpsMonthlyMetric[];
      ageMs: number;
    }>
  | Readonly<{
      status: "empty";
      current: null;
      months: readonly AiOpsMonthlyMetric[];
    }>
  | Readonly<{
      status: "unavailable";
      current: null;
      months: readonly [];
    }>;
```

Test:

- 120 minutes old is `fresh`;
- more than 120 minutes old is `stale`;
- twelve rows without the current Hong Kong month are `empty`;
- negative age, invalid clock, unsorted rows, duplicate months, or more/less
  than twelve rows throw a fixed safe error;
- `unavailableAiOpsDashboardState()` contains no error argument or message.

- [ ] **Step 2: Write failing evidence tests**

Require exactly:

```ts
[
  {
    id: "source",
    href: "https://github.com/YNWAforever/hkwtia",
  },
  {
    id: "commits",
    href: "https://github.com/YNWAforever/hkwtia/commits/main",
  },
  {
    id: "deployment",
    href: "https://hkwtia.vercel.app",
  },
  {
    id: "acceptance",
    href: "https://github.com/YNWAforever/hkwtia/blob/main/docs/acceptance/m4.md",
  },
]
```

Validate each with `new URL`, require protocol `https:`, blank username,
blank password, and a hostname. Freeze the array and entries.

- [ ] **Step 3: Run and verify failure**

```powershell
npm.cmd test -- tests/unit/aiops-dashboard.test.ts tests/unit/aiops-evidence.test.ts
```

Expected: FAIL because the state and evidence contracts are absent.

- [ ] **Step 4: Implement the pure state builder**

Derive the current Hong Kong month using
`Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit"})`.
Do not use the machine timezone. Compute freshness from the newest
`refreshedAt` and reject future timestamps.

Export only safe fixed error codes:

```ts
export const AI_OPS_DASHBOARD_INVALID =
  "AI_OPS_DASHBOARD_INVALID";
```

- [ ] **Step 5: Run and commit**

```powershell
npm.cmd test -- tests/unit/aiops-dashboard.test.ts tests/unit/aiops-evidence.test.ts
npm.cmd run typecheck
git add lib/aiops/dashboard.ts config/aiops-evidence.ts tests/unit/aiops-dashboard.test.ts tests/unit/aiops-evidence.test.ts
git commit -m "feat: add AI-Ops dashboard state contract"
```

---

## Task 7: Replace the AI-Ops placeholder with a bilingual SSR dashboard

**Files:**

- Create: `components/marketing/aiops/metric-grid.tsx`
- Create: `components/marketing/aiops/renewal-chart.tsx`
- Create: `components/marketing/aiops/architecture-diagram.tsx`
- Create: `components/marketing/aiops/evidence-links.tsx`
- Create: `components/marketing/aiops/dashboard.tsx`
- Modify: `app/[locale]/(public)/ai-ops/page.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh-HK.json`
- Create: `tests/unit/aiops-components.test.tsx`
- Create: `tests/unit/aiops-page.test.tsx`
- Modify: `tests/e2e/core-pages.spec.ts`

**Interfaces:**

- Consumes: `AiOpsDashboardState`,
  `readonly PublishedBuildLogSummary[]`, and fixed external evidence.
- Produces: fully server-rendered `/en/ai-ops` and `/zh-HK/ai-ops`.

- [ ] **Step 1: Write failing component accessibility tests**

Render one fresh fixture and assert:

```ts
expect(screen.getByText("15")).toBeInTheDocument();
expect(screen.getByText("80.0%")).toBeInTheDocument();
expect(screen.getByText("12 / 15")).toBeInTheDocument();
expect(screen.getByText("20.0%")).toBeInTheDocument();
expect(screen.getByText("0.0%")).toBeInTheDocument();
expect(screen.getByText("800 ms")).toBeInTheDocument();
expect(screen.getByText("15 samples")).toBeInTheDocument();
expect(screen.getByText("4.50 / 5")).toBeInTheDocument();
expect(screen.getByText("10 responses")).toBeInTheDocument();
expect(screen.getByText("1.20 hours")).toBeInTheDocument();
expect(screen.getByText("US$0.068000")).toBeInTheDocument();
```

Assert one `<svg role="img">` with localized `<title>` and `<desc>`, a
twelve-row semantic renewal table, overall/first-year labels, 88% and 82%
target text, and visible failure/escalation cards. Render missing rates and
assert “Not enough data” with no `0.0%`.

Assert architecture text includes both flows and explicit approval and
publication gates. Assert evidence contains two internal build-log links and
four external HTTPS links.

- [ ] **Step 2: Write failing page boundary tests**

Inject or mock the repository readers and assert:

- the route source contains no `"use client"`, `fetch(`, interval, or polling;
- a successful read passes 12 rows to the dashboard;
- a repository exception renders `unavailable` without its message;
- metadata uses the new localized title/description;
- HTML and serialized props do not contain
  `M4C_PRIVATE_CANARY_private@example.test`.

- [ ] **Step 3: Run and verify failure**

```powershell
npm.cmd test -- tests/unit/aiops-components.test.tsx tests/unit/aiops-page.test.tsx
```

Expected: FAIL because the placeholder is still present.

- [ ] **Step 4: Add exact English copy**

Replace `AiOps` in `messages/en.json` with these values:

```json
{
  "metaTitle": "AI-Ops in public | WTIA",
  "metaDescription": "Live, privacy-safe metrics showing how WTIA's AI agents perform, escalate and cost.",
  "eyebrow": "AI-Ops in public",
  "title": "Operational AI, measured in public",
  "description": "Hourly, privacy-safe evidence from WTIA's Concierge and scheduled agents.",
  "currentMonth": "Current Hong Kong month",
  "partialMonth": "Month to date",
  "lastUpdated": "Last updated",
  "fresh": "Metrics refreshed on schedule",
  "stale": "Metrics may be delayed",
  "empty": "No metrics are available for this month yet",
  "unavailable": "Metrics are temporarily unavailable",
  "notEnoughData": "Not enough data",
  "conversations": "Conversations",
  "resolved": "Agent resolved",
  "firstResponse": "Median first response",
  "csat": "CSAT",
  "escalation": "Escalation rate",
  "failure": "Failure rate",
  "hoursSaved": "Estimated staff hours saved",
  "llmCost": "Monthly LLM cost",
  "responses": "responses",
  "samples": "samples",
  "hours": "hours",
  "resolutionTarget": "Target: 70% or higher",
  "csatTarget": "Target: 4.5 / 5 or higher",
  "renewalHeading": "Twelve-month renewal trend",
  "overallRenewal": "Overall renewal",
  "firstYearRenewal": "First-year renewal",
  "overallTarget": "Overall target: 88%",
  "firstYearTarget": "First-year target: 82%",
  "renewalChartTitle": "Monthly renewal rates",
  "renewalChartDescription": "Overall and first-year renewal rates for the latest twelve Hong Kong months.",
  "month": "Month",
  "paid": "Paid",
  "due": "Due",
  "rate": "Rate",
  "methodologyHeading": "How these metrics are calculated",
  "methodologyDescription": "Aggregates refresh hourly. Estimated time saved equals agent-resolved conversations multiplied by six minutes. No member-level data is published.",
  "architectureHeading": "How WTIA AI-Ops works",
  "architectureDescription": "Web and WhatsApp requests pass through the Concierge runtime and guarded tools. Scheduled jobs use authenticated routes. Generated actions remain behind approval or publication gates.",
  "approvalGate": "Human approval gate",
  "publicationGate": "Publication gate",
  "evidenceHeading": "Build evidence",
  "buildLogs": "Published build logs",
  "source": "Source repository",
  "commits": "Commit and build history",
  "deployment": "Live deployment",
  "acceptance": "M4 acceptance evidence",
  "noBuildLogs": "No published build logs are available."
}
```

- [ ] **Step 5: Add exact Traditional Chinese copy**

Replace `AiOps` in `messages/zh-HK.json` with:

```json
{
  "metaTitle": "公開 AI-Ops｜WTIA",
  "metaDescription": "公開 WTIA AI 代理的即時、保障私隱表現、升級處理及成本指標。",
  "eyebrow": "公開 AI-Ops",
  "title": "公開量度 AI 營運",
  "description": "每小時更新、保障私隱的 WTIA Concierge 及排程代理實證。",
  "currentMonth": "香港本月",
  "partialMonth": "本月至今",
  "lastUpdated": "最後更新",
  "fresh": "指標已按時更新",
  "stale": "指標可能延遲",
  "empty": "本月暫未有指標",
  "unavailable": "指標暫時無法提供",
  "notEnoughData": "資料不足",
  "conversations": "對話數目",
  "resolved": "代理已解決",
  "firstResponse": "首次回應時間中位數",
  "csat": "客戶滿意度",
  "escalation": "升級處理率",
  "failure": "失敗率",
  "hoursSaved": "估算節省職員工時",
  "llmCost": "本月 LLM 成本",
  "responses": "份回應",
  "samples": "個樣本",
  "hours": "小時",
  "resolutionTarget": "目標：70% 或以上",
  "csatTarget": "目標：4.5 / 5 或以上",
  "renewalHeading": "十二個月續會趨勢",
  "overallRenewal": "整體續會率",
  "firstYearRenewal": "首年續會率",
  "overallTarget": "整體目標：88%",
  "firstYearTarget": "首年目標：82%",
  "renewalChartTitle": "每月續會率",
  "renewalChartDescription": "最近十二個香港月份的整體及首年續會率。",
  "month": "月份",
  "paid": "已付款",
  "due": "應續會",
  "rate": "比率",
  "methodologyHeading": "指標計算方法",
  "methodologyDescription": "聚合指標每小時更新。估算節省時間等於代理已解決對話乘以六分鐘。頁面不會公開任何會員層級資料。",
  "architectureHeading": "WTIA AI-Ops 運作方式",
  "architectureDescription": "網站及 WhatsApp 查詢經 Concierge runtime 及受限制工具處理。排程工作使用已驗證路由。所有生成操作仍受人工批准或發布關卡限制。",
  "approvalGate": "人工批准關卡",
  "publicationGate": "發布關卡",
  "evidenceHeading": "開發實證",
  "buildLogs": "已發布開發紀錄",
  "source": "原始碼倉庫",
  "commits": "Commit 及 build 紀錄",
  "deployment": "正式網站",
  "acceptance": "M4 驗收實證",
  "noBuildLogs": "暫未有已發布開發紀錄。"
}
```

- [ ] **Step 6: Implement the server components**

`metric-grid.tsx` receives already validated metrics and localized label
strings. It renders eight `<article>` cards. Each rate includes numerator and
denominator. Use `Intl.NumberFormat` with the route locale; never format by
concatenating unvalidated values.

`renewal-chart.tsx` computes points from a fixed view box, breaks a path at
null rates, distinguishes series by dash pattern and marker shape, and renders
the same values in a semantic table. It has no hooks and no `"use client"`.

`architecture-diagram.tsx` renders two ordered lists and explicit gate nodes;
decorative arrows use `aria-hidden="true"`.

`evidence-links.tsx` constructs internal links only from validated build-log
slugs and renders external links with `rel="noreferrer"`.

- [ ] **Step 7: Replace the page placeholder**

The page:

```ts
const rows = await aiOpsPublicRepository
  .readLatestTwelveMonths()
  .catch(() => null);
const state = rows
  ? buildAiOpsDashboardState(rows, new Date())
  : unavailableAiOpsDashboardState();
const buildLogs = await publicPostsRepository
  .listPublishedBuildLogs()
  .catch(() => []);
```

Pass only `state`, `buildLogs`, fixed evidence, locale, and localized labels
to `AiOpsDashboard`. Export `revalidate = 300`. Keep `setRequestLocale` and
localized metadata.

- [ ] **Step 8: Run UI and visible-copy checks**

```powershell
npm.cmd test -- tests/unit/aiops-components.test.tsx tests/unit/aiops-page.test.tsx tests/unit/build-log-pages.test.tsx
npm.cmd run audit:strings
npm.cmd run typecheck
```

Expected: PASS and zero visible-string audit violations.

- [ ] **Step 9: Commit**

```powershell
git add components/marketing/aiops app/[locale]/(public)/ai-ops/page.tsx messages/en.json messages/zh-HK.json tests/unit/aiops-components.test.tsx tests/unit/aiops-page.test.tsx tests/e2e/core-pages.spec.ts
git commit -m "feat: launch bilingual public AI-Ops dashboard"
```

---

## Task 8: Seed the exact M4 demo metrics and two build logs

**Files:**

- Create: `lib/acceptance/m4c-ownership.ts`
- Create: `scripts/seed-m4c.ts`
- Modify: `package.json`
- Create: `tests/unit/m4c-seed.test.ts`
- Create: `tests/integration/m4c-seed-postgres.test.ts`

**Interfaces:**

- Produces: `M4C_ACCEPTANCE_OWNERSHIP_KEY = "m4c-acceptance-v1"`.
- Produces: `buildM4CSeedFixture(asOf: Date)`.
- Produces: guarded `seedM4C(pool, {asOf})` and CLI `db:seed:m4c`.

- [ ] **Step 1: Write failing fixture and safety tests**

Assert:

```ts
expect(fixture.conversations).toHaveLength(15);
expect(fixture.agentRuns).toHaveLength(40);
expect(
  fixture.latestOutcomes.filter(({status}) => status === "completed"),
).toHaveLength(12);
expect(
  fixture.latestOutcomes.filter(({status}) => status === "escalated"),
).toHaveLength(3);
expect(
  fixture.latestOutcomes.filter(({status}) => status === "failed"),
).toHaveLength(0);
expect(fixture.buildLogs).toHaveLength(2);
expect(fixture.buildLogs.every(({publishedAt}) => publishedAt !== null))
  .toBe(true);
expect(fixture.expectedCurrentMetrics).toEqual({
  conversationCount: 15,
  terminalConversationCount: 15,
  resolvedConversationCount: 12,
  escalatedConversationCount: 3,
  failedConversationCount: 0,
  agentResolvedRate: 0.8,
  escalationRate: 0.2,
  failureRate: 0,
  medianFirstResponseMs: 800,
  firstResponseSampleCount: 15,
  csatAverage: 4.5,
  csatResponseCount: 10,
  staffHoursSaved: 1.2,
  llmCostUsd: 0.068,
});
```

Reuse the M4B safety policy: `M4C_ACCEPTANCE_SEED=true`,
`DATABASE_URL === DATABASE_URL_TEST`, and Production forbidden before pool
creation.

- [ ] **Step 2: Run and verify failure**

```powershell
npm.cmd test -- tests/unit/m4c-seed.test.ts
```

Expected: FAIL because the M4C fixture and script are absent.

- [ ] **Step 3: Build the deterministic fixture**

Use stable UUID ranges owned by M4C. Build:

- 15 anonymous Concierge conversations in the current Hong Kong month;
- 38 Concierge runs distributed deterministically across the 15
  conversations;
- one null-conversation `retention_analyst` run and one null-conversation
  `board_reporter` run;
- a latest terminal outcome of 12 completed and three escalated;
- first-response latencies from 100 through 1500 milliseconds;
- five CSAT 5 values and five CSAT 4 values;
- run costs summing exactly `0.068000`;
- twelve months of overall and first-year paid/failed renewal facts;
- exactly two `buildlog` posts with stable slugs
  `m4-runtime-and-concierge` and `m4-public-ai-ops`;
- a synthetic private canary only in message content:
  `M4C_PRIVATE_CANARY_private@example.test`.

The build-log bodies contain English and Traditional Chinese sections using
only the safe build-log grammar.

- [ ] **Step 4: Implement idempotent reconciliation**

Inside one transaction:

1. acquire a stable advisory transaction lock;
2. delete only rows carrying the M4C ownership marker or stable M4C IDs;
3. upsert fixture profiles/memberships needed for renewal facts;
4. insert conversations, messages, and exactly 40 agent runs;
5. insert renewal events and exactly two published build logs;
6. verify owned counts before commit.

After commit, run:

```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY aiops_monthly_metrics;
```

Never issue `TRUNCATE`, unscoped deletes, or deletes against M4A/M4B ownership
markers.

- [ ] **Step 5: Add the package script**

```json
"db:seed:m4c": "tsx scripts/seed-m4c.ts"
```

- [ ] **Step 6: Write isolated Postgres reconciliation tests**

Run the seed twice and assert:

- owned counts remain 40 runs, 15 conversations, two build logs;
- the current view row equals `expectedCurrentMetrics`;
- 12 month rows exist;
- the two build logs are returned by `publicPostsRepository`;
- the canary is absent from aggregate rows, dashboard HTML, and build logs;
- unrelated sentinel rows survive the second seed.

- [ ] **Step 7: Run focused seed checks**

```powershell
npm.cmd test -- tests/unit/m4c-seed.test.ts
$env:M4C_ACCEPTANCE_SEED="true"
$env:DATABASE_URL_TEST="<isolated-neon-url>"
$env:DATABASE_URL=$env:DATABASE_URL_TEST
npm.cmd run db:migrate
npm.cmd run db:seed:m4c
npm.cmd run db:seed:m4c
npm.cmd test -- tests/integration/m4c-seed-postgres.test.ts
Remove-Item Env:M4C_ACCEPTANCE_SEED
Remove-Item Env:DATABASE_URL
Remove-Item Env:DATABASE_URL_TEST
```

Expected: exact metrics and idempotent counts PASS. Do not echo URLs.

- [ ] **Step 8: Commit**

```powershell
git add lib/acceptance/m4c-ownership.ts scripts/seed-m4c.ts package.json tests/unit/m4c-seed.test.ts tests/integration/m4c-seed-postgres.test.ts
git commit -m "feat: seed exact M4 AI-Ops demo metrics"
```

---

## Task 9: Prove the complete M4 acceptance contract

**Files:**

- Create: `tests/integration/m4c-acceptance.test.ts`
- Create: `tests/e2e/m4c-aiops.spec.ts`
- Create: `docs/acceptance/m4.md`

**Interfaces:**

- Consumes: completed M4A, M4B, and M4C behavior.
- Produces: one deterministic acceptance suite and one evidence document.

- [ ] **Step 1: Write the failing combined acceptance test**

The integration test must assert:

```ts
expect(conciergeEval.passRate).toBeGreaterThanOrEqual(0.85);
expect(conciergeEval.piiRefusalPassed).toBe(true);
expect(turns.every(({agentRunCount}) => agentRunCount === 1)).toBe(true);
expect(killSwitch).toMatchObject({
  providerCalls: 0,
  toolCalls: 0,
  fallback: "leave-message",
});
expect(platinumDraft).toMatchObject({
  approvalStatus: "pending",
  emailLogCount: 0,
});
expect(aiOps).toMatchObject({
  conversationCount: 15,
  agentResolvedRate: 0.8,
  escalationRate: 0.2,
  failureRate: 0,
});
expect(retention.pendingProfileIds).toEqual(
  [...M4B_ACCEPTANCE_FIXTURE.expectedAtRiskProfileIds].sort(),
);
expect(boardDraft).toMatchObject({
  kind: "page",
  publishedAt: null,
});
expect(validWoztell).toMatchObject({
  responseStatus: 200,
  persistedChannel: "whatsapp",
});
expect(invalidWoztell.responseStatus).toBe(401);
expect(outsideWindow).toMatchObject({
  freeformSends: 0,
  templateSends: 1,
});
```

Repeat job/webhook delivery and assert no duplicate durable side effect.
Serialize both localized dashboard pages and assert the private canary,
profile IDs, phone-like strings, emails, message content, prompts, and
summaries are absent.

- [ ] **Step 2: Run and verify failure**

```powershell
npm.cmd test -- tests/integration/m4c-acceptance.test.ts
```

Expected: FAIL until the combined harness and evidence queries are complete.

- [ ] **Step 3: Implement the deterministic acceptance harness**

Reuse existing M4A runtime mocks, WOZTELL fixtures, M4B acceptance ownership,
and M4C seed data. Do not make network requests. Return only safe counts,
fixed statuses, and opaque fixture digests.

- [ ] **Step 4: Add browser acceptance**

`tests/e2e/m4c-aiops.spec.ts` visits both locales and asserts:

- exactly one page `<h1>`;
- all eight KPIs visible;
- escalation and failure visible;
- renewal SVG and 12-row table visible;
- architecture and build evidence visible;
- two build-log links resolve;
- no horizontal overflow at 390 CSS pixels;
- automated axe scan has no serious/critical violations;
- HTML does not contain the private canary.

- [ ] **Step 5: Create the acceptance evidence template**

`docs/acceptance/m4.md` contains these sections with checked or unchecked
evidence rows, never invented results:

```markdown
# M4 AI-Ops Acceptance Evidence

## Identity
- Branch:
- Commit:
- Isolated database branch:
- Preview deployment:

## Deterministic gates
| Requirement | Command | Expected | Actual | Status |

## Aggregate reconciliation
| Metric | Direct query | Materialized view | Public page | Status |

## Browser verification
| Locale | Route | Observation | Status |

## Authorized external gates
| Gate | Authorization | Evidence | Status |

## Known gaps
```

- [ ] **Step 6: Run deterministic M4 gates**

```powershell
npm.cmd run eval:concierge
npm.cmd test -- tests/integration/m4c-acceptance.test.ts tests/integration/m4a-acceptance.test.ts tests/integration/m4b-acceptance.test.ts tests/unit/concierge-runtime-harness-safety-channel.test.ts
npm.cmd run typecheck
```

Expected: Concierge pass rate at least 85%, PII refusal PASS, and all
deterministic M4 acceptance tests PASS.

- [ ] **Step 7: Commit**

```powershell
git add tests/integration/m4c-acceptance.test.ts tests/e2e/m4c-aiops.spec.ts docs/acceptance/m4.md
git commit -m "test: add complete M4 acceptance gate"
```

---

## Task 10: Run isolated Preview acceptance and final verification

**Files:**

- Modify: `docs/acceptance/m4.md`
- Modify: `.superpowers/sdd/progress.md` locally if the branch uses the
  existing ignored SDD ledger.

**Interfaces:**

- Produces: reproducible final evidence for local, Worker, isolated Neon, and
  protected Vercel Preview gates.
- Produces no Production mutation.

- [ ] **Step 1: Run all local focused tests**

```powershell
npm.cmd test -- tests/unit/m4c-schema-contract.test.ts tests/unit/aiops-public-repository.test.ts tests/unit/aiops-metrics-repository.test.ts tests/unit/aiops-metrics-route.test.ts tests/unit/public-posts-repository.test.ts tests/unit/aiops-dashboard.test.ts tests/unit/aiops-evidence.test.ts tests/unit/aiops-components.test.tsx tests/unit/aiops-page.test.tsx tests/unit/build-log-pages.test.tsx tests/unit/sitemap.test.ts tests/unit/m4c-seed.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run regression and application gates**

```powershell
npm.cmd test
npm.cmd run lint -- --max-warnings=0
npm.cmd run audit:strings
npm.cmd run typecheck
npm.cmd run build
Set-Location workers
npm.cmd test
npm.cmd run typecheck
Set-Location ..
```

Expected: all suites PASS, zero lint warnings, visible-string audit PASS,
typecheck PASS, and production build includes `/[locale]/ai-ops` plus dynamic
`/[locale]/news/[slug]`.

- [ ] **Step 3: Create or reset the authorized isolated Neon branch**

Use the previously authorized isolated Preview resources. Record only Neon
project ID, branch ID/name, region, and expiry in `docs/acceptance/m4.md`.
Never record a connection string.

Apply all migrations, run the guarded M4C seed twice, invoke the refresh job
twice, and query direct source facts versus the materialized view.

Expected:

- first job result `{duplicate:false, summary:{refreshed:1}}`;
- second job result `{duplicate:true}`;
- exact seeded metrics reconcile;
- 12 rows and two build logs;
- no PII columns in the view.

- [ ] **Step 4: Deploy a protected Vercel Preview**

Deploy the exact tested commit with isolated database variables, test
accounts, and agents disabled. Record deployment ID and URL. Do not promote
Production.

- [ ] **Step 5: Run protected-Preview browser verification**

```powershell
npm.cmd exec playwright test -- tests/e2e/m4c-aiops.spec.ts
```

Verify both locales, both build logs, metadata, sitemap, mobile layout,
accessibility, stale/error fixtures where safely injectable, and PII canary
absence. Record exact observations in `docs/acceptance/m4.md`.

- [ ] **Step 6: Run the final combined M4 acceptance**

Use deterministic mock agents by default. Run live models only if a fresh
explicit authorization and model spend boundary are present. Record an
unrun/blocked live gate honestly rather than converting it to PASS.

- [ ] **Step 7: Request implementation and branch reviews**

Use `superpowers:requesting-code-review`. Resolve every Critical or Important
finding with focused tests. Rerun affected gates after each correction, then
rerun the full local and Worker suites.

- [ ] **Step 8: Commit final evidence**

```powershell
git add docs/acceptance/m4.md
git commit -m "docs: record M4 acceptance evidence"
```

- [ ] **Step 9: Verify final branch state**

```powershell
git status --short --branch
git log --oneline --decorate -12
```

Expected: clean `codex/m4c-aiops-public-dashboard` worktree, all M4C commits
present, and no unresolved Critical or Important review findings.

---

## Self-Review Checklist

- [ ] Every M4C design section maps to at least one task.
- [ ] Materialized-view formulas, unique index, concurrent refresh, and
  twelve-month Hong Kong boundary are covered.
- [ ] Every public aggregate field has a schema, SQL formula, repository test,
  and UI assertion.
- [ ] Fresh, stale, empty, unavailable, zero, null, non-zero escalation, and
  non-zero failure states are tested.
- [ ] Published build-log list, detail, safe rendering, draft exclusion,
  metadata, and sitemap behavior are covered.
- [ ] Exact 40-run, 15-conversation, 12/3 outcome, CSAT, cost, two-build-log,
  and PII-canary seed contracts are covered.
- [ ] Full M4A/M4B/M4C acceptance, WOZTELL, 24-hour policy, Platinum approval,
  kill switch, eval threshold, and audit rows are covered.
- [ ] No implementation step contains an unspecified error handler,
  unspecified translation, unsafe URL, or arbitrary SQL capability.
- [ ] Type and function names are consistent across all producer/consumer
  interfaces.
- [ ] Production promotion and live-provider spend remain outside the plan
  without separate approval.
