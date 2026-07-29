import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {Pool} from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {buildAiOpsDashboardState} from "@/lib/aiops/dashboard";
import {AiOpsDashboard} from "@/components/marketing/aiops/dashboard";
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
  const sentinelProfileId = "m4c-seed-survival-profile";
  const sentinelAt = new Date(asOf.getTime() - 400 * 86_400_000);
  const ownershipSentinels = ["m4a-acceptance-v1", "m4b-acceptance-v1"].map(
    (ownershipKey, index) => ({
      ownershipKey,
      conversationId: `50000099-0000-4000-8000-00000000010${index + 1}`,
      messageId: `50000099-0000-4000-8000-00000000020${index + 1}`,
      runId: `50000099-0000-4000-8000-00000000030${index + 1}`,
      eventId: `50000099-0000-4000-8000-00000000040${index + 1}`,
      postId: `50000099-0000-4000-8000-00000000050${index + 1}`,
    }),
  );

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

    await pool.query(
      `INSERT INTO profiles
         (id, auth_user_id, email, role, last_login_at, consent_marketing,
          interests, display_name, phone, job_title, locale,
          onboarding_state, directory_visible, created_at, updated_at,
          whatsapp_opt_in, whatsapp_number)
       VALUES ($1, 'm4c-seed-survival-auth', 'm4c-seed-survival@example.test',
         'member', $2, false, '[]'::jsonb, 'M4C survival sentinel', NULL,
         'M4C seed test', 'en', 'complete', false, $2, $2, false, NULL)
       ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at`,
      [sentinelProfileId, sentinelAt],
    );
    for (const sentinel of ownershipSentinels) {
      await pool.query(
        `INSERT INTO conversations
           (id, profile_id, anonymous_owner_hash, locale, status, agent_kind,
            last_message_at, expires_at, created_at, updated_at)
         VALUES ($1, NULL, $2, 'en', 'closed', 'concierge', $3, $4, $3, $3)
         ON CONFLICT (id) DO UPDATE SET anonymous_owner_hash = EXCLUDED.anonymous_owner_hash`,
        [sentinel.conversationId, sentinel.ownershipKey, asOf,
          new Date(asOf.getTime() + 86_400_000)],
      );
      await pool.query(
        `INSERT INTO messages
           (id, conversation_id, role, channel, content, provider_message_id,
            metadata, citations, created_at)
         VALUES ($1, $2, 'user', 'web', 'M4C survival sentinel', NULL,
           $3::jsonb, '[]'::jsonb, $4)
         ON CONFLICT (id) DO UPDATE SET metadata = EXCLUDED.metadata`,
        [sentinel.messageId, sentinel.conversationId,
          JSON.stringify({fixture: sentinel.ownershipKey}), sentinelAt],
      );
      await pool.query(
        `INSERT INTO agent_runs
           (id, conversation_id, profile_id, trigger, status, provider, model,
            input_tokens, output_tokens, cost_usd, latency_ms, summary,
            error_code, csat_score, started_at, completed_at, created_at,
            updated_at, agent)
         VALUES ($1, NULL, NULL, 'scheduled', 'completed', 'fixture',
           'survival', 0, 0, 0, 0, $2, NULL, NULL, $3, $3, $3, $3,
           'retention_analyst')
         ON CONFLICT (id) DO UPDATE SET summary = EXCLUDED.summary`,
        [sentinel.runId, `${sentinel.ownershipKey}:survival`, sentinelAt],
      );
      await pool.query(
        `INSERT INTO engagement_events
           (id, profile_id, company_id, type, points, metadata, occurred_at)
         VALUES ($1, $2, NULL, 'renewal_failed', 0, $3::jsonb, $4)
         ON CONFLICT (id) DO UPDATE SET metadata = EXCLUDED.metadata`,
        [sentinel.eventId, sentinelProfileId,
          JSON.stringify({fixture: sentinel.ownershipKey,
            membershipId: `survival-${sentinel.ownershipKey}`, renewalOrdinal: 2}), sentinelAt],
      );
      await pool.query(
        `INSERT INTO posts
           (id, slug, kind, title_en, title_zh, body_mdx, published_at,
            author, source_key, created_at, updated_at)
         VALUES ($1, $2, 'news', 'Ownership sentinel', 'Ownership sentinel',
           'M4C survival sentinel', $3, 'Acceptance', $4, $3, $3)
         ON CONFLICT (id) DO UPDATE SET source_key = EXCLUDED.source_key`,
        [sentinel.postId, `m4c-${sentinel.ownershipKey}-survival`, sentinelAt,
          `${sentinel.ownershipKey}:survival`],
      );
    }
  });

  afterAll(async () => {
    await pool.query("DELETE FROM messages WHERE id = ANY($1::uuid[])", [
      ownershipSentinels.map(({messageId}) => messageId),
    ]);
    await pool.query("DELETE FROM conversations WHERE id = ANY($1::uuid[])", [
      ownershipSentinels.map(({conversationId}) => conversationId),
    ]);
    await pool.query("DELETE FROM agent_runs WHERE id = ANY($1::uuid[])", [
      ownershipSentinels.map(({runId}) => runId),
    ]);
    await pool.query("DELETE FROM engagement_events WHERE id = ANY($1::uuid[])", [
      ownershipSentinels.map(({eventId}) => eventId),
    ]);
    await pool.query("DELETE FROM posts WHERE id = ANY($1::uuid[])", [
      ownershipSentinels.map(({postId}) => postId),
    ]);
    await pool.query("DELETE FROM profiles WHERE id = $1", [sentinelProfileId]);
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

    const survivors = await pool.query<{
      conversations: number;
      messages: number;
      runs: number;
      events: number;
      posts: number;
    }>(
      `SELECT
         (SELECT count(*)::integer FROM conversations WHERE id = ANY($1::uuid[])) AS conversations,
         (SELECT count(*)::integer FROM messages WHERE id = ANY($2::uuid[])) AS messages,
         (SELECT count(*)::integer FROM agent_runs WHERE id = ANY($3::uuid[])) AS runs,
         (SELECT count(*)::integer FROM engagement_events WHERE id = ANY($4::uuid[])) AS events,
         (SELECT count(*)::integer FROM posts WHERE id = ANY($5::uuid[])) AS posts`,
      [
        ownershipSentinels.map(({conversationId}) => conversationId),
        ownershipSentinels.map(({messageId}) => messageId),
        ownershipSentinels.map(({runId}) => runId),
        ownershipSentinels.map(({eventId}) => eventId),
        ownershipSentinels.map(({postId}) => postId),
      ],
    );
    expect(survivors.rows[0]).toEqual({
      conversations: 2,
      messages: 2,
      runs: 2,
      events: 2,
      posts: 2,
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

    const renewals = await pool.query<{
      month_start: string;
      is_partial_month: boolean;
      renewal_due_count: number;
      renewal_paid_count: number;
      renewal_rate: string;
      first_year_renewal_due_count: number;
      first_year_renewal_paid_count: number;
      first_year_renewal_rate: string;
      refreshed_at: Date;
    }>(
      `SELECT month_start, is_partial_month, renewal_due_count, renewal_paid_count,
         renewal_rate, first_year_renewal_due_count, first_year_renewal_paid_count,
         first_year_renewal_rate, refreshed_at
       FROM aiops_monthly_metrics ORDER BY month_start`,
    );
    expect(renewals.rows.map((row) => ({
      monthStart: String(row.month_start),
      renewalDueCount: Number(row.renewal_due_count),
      renewalPaidCount: Number(row.renewal_paid_count),
      renewalRate: Number(row.renewal_rate),
      firstYearRenewalDueCount: Number(row.first_year_renewal_due_count),
      firstYearRenewalPaidCount: Number(row.first_year_renewal_paid_count),
      firstYearRenewalRate: Number(row.first_year_renewal_rate),
    }))).toEqual(fixture.expectedRenewalMetrics);

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

    const canaryStorage = await pool.query<{
      messages: number;
      conversations: number;
      runs: number;
      events: number;
      posts: number;
      profiles: number;
      memberships: number;
    }>(
      `SELECT
         (SELECT count(*)::integer FROM messages WHERE content LIKE $1) AS messages,
         (SELECT count(*)::integer FROM conversations WHERE to_jsonb(conversations)::text LIKE $1) AS conversations,
         (SELECT count(*)::integer FROM agent_runs WHERE to_jsonb(agent_runs)::text LIKE $1) AS runs,
         (SELECT count(*)::integer FROM engagement_events WHERE to_jsonb(engagement_events)::text LIKE $1) AS events,
         (SELECT count(*)::integer FROM posts WHERE to_jsonb(posts)::text LIKE $1) AS posts,
         (SELECT count(*)::integer FROM profiles WHERE to_jsonb(profiles)::text LIKE $1) AS profiles,
         (SELECT count(*)::integer FROM memberships WHERE to_jsonb(memberships)::text LIKE $1) AS memberships`,
      ["%M4C_PRIVATE_CANARY_private@example.test%"],
    );
    expect(canaryStorage.rows[0]).toEqual({
      messages: 1,
      conversations: 0,
      runs: 0,
      events: 0,
      posts: 0,
      profiles: 0,
      memberships: 0,
    });

    const dashboardRows = renewals.rows.map((row) => ({
      ...fixture.expectedCurrentMetrics,
      monthStart: String(row.month_start),
      isPartialMonth: Boolean(row.is_partial_month),
      renewalDueCount: Number(row.renewal_due_count),
      renewalPaidCount: Number(row.renewal_paid_count),
      renewalRate: Number(row.renewal_rate),
      firstYearRenewalDueCount: Number(row.first_year_renewal_due_count),
      firstYearRenewalPaidCount: Number(row.first_year_renewal_paid_count),
      firstYearRenewalRate: Number(row.first_year_renewal_rate),
      refreshedAt: new Date(row.refreshed_at),
    }));
    const dashboardHtml = renderToStaticMarkup(createElement(AiOpsDashboard, {
      locale: "en",
      state: buildAiOpsDashboardState(dashboardRows, asOf),
      buildLogs: publicLogs,
      evidence: [],
      labels: new Proxy({}, {get: () => "label"}) as never,
    }));
    expect(dashboardHtml).not.toContain("M4C_PRIVATE_CANARY_private@example.test");
  });
});
