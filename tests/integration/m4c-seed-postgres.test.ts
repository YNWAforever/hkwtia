import {Pool} from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {createPublicPostsRepository} from "@/lib/db/repos/public-posts";
import {
  buildM4CSeedFixture,
  seedM4C,
} from "../../scripts/seed-m4c";

const databaseUrl = process.env.DATABASE_URL_TEST;
const enabled = process.env.RUN_M4C_SEED_POSTGRES === "true"
  && typeof databaseUrl === "string"
  && databaseUrl.length > 0
  && process.env.DATABASE_URL === databaseUrl
  && process.env.M4C_ACCEPTANCE_SEED === "true";

describe.runIf(enabled)("M4C PostgreSQL seed reconciliation", () => {
  const pool = new Pool({connectionString: databaseUrl});
  const asOf = new Date();
  const fixture = buildM4CSeedFixture(asOf);
  const sentinelId = "50000099-0000-4000-8000-000000000001";

  beforeAll(async () => {
    await pool.query(
      `INSERT INTO posts
         (id, slug, kind, title_en, title_zh, body_mdx, published_at,
          author, source_key, created_at, updated_at)
       VALUES ($1, 'm4c-unrelated-sentinel', 'news', 'Sentinel', 'Sentinel',
         'Unrelated sentinel', $2, 'Acceptance', 'unrelated-m4c-sentinel',
         $2, $2)
       ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at`,
      [sentinelId, asOf],
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM posts WHERE id = $1", [sentinelId]);
    await pool.end();
  });

  it("reconciles twice to exact owned counts, metrics, public logs, and privacy boundaries", async () => {
    await seedM4C(pool, {asOf});
    await seedM4C(pool, {asOf});

    const counts = await pool.query<{
      conversations: number;
      runs: number;
      posts: number;
      months: number;
      sentinel: number;
    }>(
      `SELECT
         (SELECT count(*)::integer FROM conversations
          WHERE id = ANY($1::uuid[])) AS conversations,
         (SELECT count(*)::integer FROM agent_runs
          WHERE id = ANY($2::uuid[])) AS runs,
         (SELECT count(*)::integer FROM posts
          WHERE source_key = ANY($3::text[])) AS posts,
         (SELECT count(*)::integer FROM aiops_monthly_metrics) AS months,
         (SELECT count(*)::integer FROM posts WHERE id = $4) AS sentinel`,
      [
        fixture.conversations.map(({id}) => id),
        fixture.agentRuns.map(({id}) => id),
        fixture.buildLogs.map(({sourceKey}) => sourceKey),
        sentinelId,
      ],
    );
    expect(counts.rows[0]).toEqual({
      conversations: 15,
      runs: 40,
      posts: 2,
      months: 12,
      sentinel: 1,
    });

    const metrics = await pool.query(
      `SELECT
         conversation_count, terminal_conversation_count,
         resolved_conversation_count, escalated_conversation_count,
         failed_conversation_count, agent_resolved_rate, escalation_rate,
         failure_rate, median_first_response_ms, first_response_sample_count,
         csat_average, csat_response_count, staff_hours_saved, llm_cost_usd
       FROM aiops_monthly_metrics
       WHERE is_partial_month`,
    );
    const current = metrics.rows[0] as Record<string, unknown>;
    expect({
      conversationCount: Number(current.conversation_count),
      terminalConversationCount: Number(current.terminal_conversation_count),
      resolvedConversationCount: Number(current.resolved_conversation_count),
      escalatedConversationCount: Number(current.escalated_conversation_count),
      failedConversationCount: Number(current.failed_conversation_count),
      agentResolvedRate: Number(current.agent_resolved_rate),
      escalationRate: Number(current.escalation_rate),
      failureRate: Number(current.failure_rate),
      medianFirstResponseMs: Number(current.median_first_response_ms),
      firstResponseSampleCount: Number(current.first_response_sample_count),
      csatAverage: Number(current.csat_average),
      csatResponseCount: Number(current.csat_response_count),
      staffHoursSaved: Number(current.staff_hours_saved),
      llmCostUsd: Number(current.llm_cost_usd),
    }).toEqual(fixture.expectedCurrentMetrics);

    const publicLogs = await createPublicPostsRepository()
      .listPublishedBuildLogs(asOf);
    expect(publicLogs.map(({slug}) => slug).sort()).toEqual(
      fixture.buildLogs.map(({slug}) => slug).sort(),
    );
    const publicSurface = JSON.stringify({metrics: metrics.rows, publicLogs});
    expect(publicSurface).not.toContain("M4C_PRIVATE_CANARY");
    const buildLogCanary = await pool.query<{count: number}>(
      `SELECT count(*)::integer AS count FROM posts
       WHERE source_key = ANY($1::text[])
         AND body_mdx LIKE '%M4C_PRIVATE_CANARY%'`,
      [fixture.buildLogs.map(({sourceKey}) => sourceKey)],
    );
    expect(buildLogCanary.rows[0]?.count).toBe(0);
  });
});
