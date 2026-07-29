import {Pool} from "@neondatabase/serverless";
import {describe, expect, it} from "vitest";

const testDatabaseUrl = process.env.DATABASE_URL_TEST?.trim() ?? "";
const fixtureLock = 1_944_202_607;

type MetricRow = {
  month_start: string;
  is_partial_month: boolean;
  conversation_count: number;
  terminal_conversation_count: number;
  resolved_conversation_count: number;
  escalated_conversation_count: number;
  failed_conversation_count: number;
  agent_resolved_rate: string | null;
  escalation_rate: string | null;
  failure_rate: string | null;
  median_first_response_ms: number | null;
  first_response_sample_count: number;
  csat_average: string | null;
  csat_response_count: number;
  staff_hours_saved: string;
  llm_cost_usd: string;
  renewal_due_count: number;
  renewal_paid_count: number;
  renewal_rate: string | null;
  first_year_renewal_due_count: number;
  first_year_renewal_paid_count: number;
  first_year_renewal_rate: string | null;
};

describe.skipIf(!testDatabaseUrl)("AI-Ops materialized-view formula proof", () => {
  it("proves every public aggregate formula with an isolated forty-run fixture", async () => {
    const pool = new Pool({connectionString: testDatabaseUrl, max: 1});`n    let lockAcquired = false;`n    let transactionStarted = false;`n    try {`n      await pool.query("SELECT pg_advisory_lock($1)", [fixtureLock]);`n      lockAcquired = true;`n      await pool.query("BEGIN");`n      transactionStarted = true;
      await pool.query(`TRUNCATE TABLE
        messages, agent_runs, conversations, engagement_events, memberships, profiles
        CASCADE`);

      const bounds = await pool.query<{
        current_month: string;
        month_from: Date;
        month_to: Date;
        first_month: string;
      }>(`
        SELECT
          date_trunc('month', timezone('Asia/Hong_Kong', now()))::date::text AS current_month,
          date_trunc('month', timezone('Asia/Hong_Kong', now()))
            ::timestamp AT TIME ZONE 'Asia/Hong_Kong' AS month_from,
          date_trunc('month', timezone('Asia/Hong_Kong', now()) + interval '1 month')
            ::timestamp AT TIME ZONE 'Asia/Hong_Kong' AS month_to,
          (date_trunc('month', timezone('Asia/Hong_Kong', now())) - interval '11 months')
            ::date::text AS first_month
      `);
      const [window] = bounds.rows;
      expect(window).toBeDefined();
      if (!window) return;

      const monthFrom = new Date(window.month_from);
      const monthTo = new Date(window.month_to);
      const at = (milliseconds: number) => new Date(monthFrom.getTime() + milliseconds);
      const profileId = "m4c-formula-profile";

      await pool.query(
        `INSERT INTO profiles (id, auth_user_id, display_name)
         VALUES ($1, $2, $3)`,
        [profileId, "m4c-formula-auth", "M4C formula fixture"],
      );

      const membershipIds: string[] = [];
      for (const label of ["one", "two", "three"]) {
        const result = await pool.query<{id: string}>(
          `INSERT INTO memberships (
             owner_user_id, plan_code, status, billing_interval, seat_limit, stripe_customer_id
           ) VALUES ($1, 'community', 'active', 'annual', 1, $2)
           RETURNING id::text AS id`,
          [profileId, `m4c-formula-membership-${label}`],
        );
        const [membership] = result.rows;
        expect(membership).toBeDefined();
        if (!membership) throw new Error("m4c-formula membership was not created");
        membershipIds.push(membership.id);
      }

      async function createConversation(index: number): Promise<string> {
        const result = await pool.query<{id: string}>(
          `INSERT INTO conversations (
             agent_kind, profile_id, locale, status, expires_at, created_at, updated_at
           ) VALUES ('concierge', $1, 'en', 'active', $2, $3, $3)
           RETURNING id::text AS id`,
          [profileId, monthTo, at((index + 1) * 60_000)],
        );
        const [conversation] = result.rows;
        expect(conversation).toBeDefined();
        if (!conversation) throw new Error("m4c-formula conversation was not created");
        return conversation.id;
      }

      async function createRun({
        agent = "concierge",
        conversationId = null,
        status = "completed",
        costUsd = "0.001500",
        csatScore = null,
        startedAt,
        completedAt,
      }: {
        agent?: "concierge" | "retention_analyst" | "board_reporter";
        conversationId?: string | null;
        status?: "completed" | "escalated" | "failed";
        costUsd?: string;
        csatScore?: number | null;
        startedAt: Date;
        completedAt: Date;
      }) {
        await pool.query(
          `INSERT INTO agent_runs (
             conversation_id, agent, trigger, status, cost_usd, csat_score,
             started_at, completed_at, created_at, updated_at
           ) VALUES ($1, $2, 'web', $3, $4, $5, $6, $7, $6, $6)`,
          [conversationId, agent, status, costUsd, csatScore, startedAt, completedAt],
        );
      }

      for (let index = 0; index < 15; index += 1) {
        const conversationId = await createConversation(index);
        const userAt = at(3_600_000 + index * 10_000);
        const latency = (index + 1) * 100;
        await pool.query(
          `INSERT INTO messages (conversation_id, role, channel, content, created_at)
           VALUES ($1, 'user', 'web', $2, $3), ($1, 'assistant', 'web', $4, $5)`,
          [conversationId, "m4c-formula-user", userAt, "m4c-formula-assistant", at(userAt.getTime() - monthFrom.getTime() + latency)],
        );

        if (index === 0) {
          await createRun({
            conversationId,
            status: "failed",
            startedAt: at(4_000_000),
            completedAt: at(4_001_000),
          });
        }
        await createRun({
          conversationId,
          status: index < 12 ? "completed" : "escalated",
          csatScore: index < 5 ? 5 : index < 10 ? 4 : null,
          startedAt: at(5_000_000 + index * 10_000),
          completedAt: at(5_001_000 + index * 10_000),
        });
      }

      for (let index = 0; index < 22; index += 1) {
        await createRun({
          startedAt: at(6_000_000 + index * 1_000),
          completedAt: at(6_001_000 + index * 1_000),
        });
      }
      await createRun({
        agent: "retention_analyst",
        costUsd: "0.005000",
        startedAt: at(7_000_000),
        completedAt: at(7_001_000),
      });
      await createRun({
        agent: "board_reporter",
        costUsd: "0.006000",
        startedAt: at(7_002_000),
        completedAt: at(7_003_000),
      });

      const renewalEvents = [
        [membershipIds[0], "renewal_failed", 1],
        [membershipIds[0], "renewal_failed", 1],
        [membershipIds[0], "renewal_paid", 1],
        [membershipIds[0], "renewal_paid", 1],
        [membershipIds[1], "renewal_failed", 1],
        [membershipIds[2], "renewal_paid", 2],
      ] as const;
      for (const [membershipId, type, renewalOrdinal] of renewalEvents) {
        await pool.query(
          `INSERT INTO engagement_events (profile_id, type, points, metadata, occurred_at)
           VALUES ($1, $2, 0, $3::jsonb, $4)`,
          [
            profileId,
            type,
            JSON.stringify({membershipId, renewalOrdinal}),
            at(8_000_000),
          ],
        );
      }

      await pool.query("REFRESH MATERIALIZED VIEW aiops_monthly_metrics");

      const columns = await pool.query<{column_name: string; data_type: string}>(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'aiops_monthly_metrics'
        ORDER BY ordinal_position
      `);
      expect(columns.rows).toHaveLength(23);
      expect(columns.rows.some(({column_name, data_type}) =>
        /(^|_)(profile|conversation|message|content|metadata|summary|error)(_|$)/i.test(column_name)
        || /json|array|text|character/i.test(data_type),
      )).toBe(false);

      const metrics = await pool.query<MetricRow>(`
        SELECT
          to_char(month_start, 'YYYY-MM-DD') AS month_start,
          is_partial_month,
          conversation_count,
          terminal_conversation_count,
          resolved_conversation_count,
          escalated_conversation_count,
          failed_conversation_count,
          agent_resolved_rate::text AS agent_resolved_rate,
          escalation_rate::text AS escalation_rate,
          failure_rate::text AS failure_rate,
          median_first_response_ms,
          first_response_sample_count,
          csat_average::text AS csat_average,
          csat_response_count,
          staff_hours_saved::text AS staff_hours_saved,
          llm_cost_usd::text AS llm_cost_usd,
          renewal_due_count,
          renewal_paid_count,
          renewal_rate::text AS renewal_rate,
          first_year_renewal_due_count,
          first_year_renewal_paid_count,
          first_year_renewal_rate::text AS first_year_renewal_rate
        FROM aiops_monthly_metrics
        ORDER BY month_start
      `);
      const rows = metrics.rows;
      const runDistribution = await pool.query<{agent: string; count: number}>(
        "SELECT agent::text AS agent, count(*)::int AS count FROM agent_runs GROUP BY agent ORDER BY agent",
      );
      expect(runDistribution.rows).toEqual([
        {agent: "board_reporter", count: 1},
        {agent: "concierge", count: 38},
        {agent: "retention_analyst", count: 1},
      ]);
      const current = rows.at(-1);
      expect(current).toMatchObject({
        month_start: window.current_month,
        is_partial_month: true,
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
        renewal_due_count: 3,
        renewal_paid_count: 2,
        renewal_rate: "0.666667",
        first_year_renewal_due_count: 2,
        first_year_renewal_paid_count: 1,
        first_year_renewal_rate: "0.500000",
      });
      expect(rows).toHaveLength(12);
      expect(new Set(rows.map(({month_start}) => month_start)).size).toBe(12);
      expect(rows[0]?.month_start).toBe(window.first_month);
      for (let index = 1; index < rows.length; index += 1) {
        const previous = new Date(`${rows[index - 1]?.month_start}T00:00:00.000Z`);
        previous.setUTCMonth(previous.getUTCMonth() + 1);
        expect(rows[index]?.month_start).toBe(previous.toISOString().slice(0, 10));
      }
      for (const row of rows.slice(0, -1)) {
        expect(row).toMatchObject({
          conversation_count: 0,
          terminal_conversation_count: 0,
          agent_resolved_rate: null,
          escalation_rate: null,
          failure_rate: null,
          renewal_rate: null,
          first_year_renewal_rate: null,
        });
      }
    } finally {
      try {
        if (transactionStarted) await pool.query("ROLLBACK");
      } finally {
        try {
          if (lockAcquired) await pool.query("SELECT pg_advisory_unlock($1)", [fixtureLock]);
        } finally {
          await pool.end();
        }
      }
    }
  }, 30_000);
});
