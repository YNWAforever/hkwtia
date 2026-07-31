import {execFile as execFileCallback} from "node:child_process";
import {promisify} from "node:util";

import {Pool, type PoolClient} from "@neondatabase/serverless";
import {describe, expect, it} from "vitest";

const execFile = promisify(execFileCallback);

const testDatabaseUrl = process.env.DATABASE_URL_TEST?.trim() ?? "";
const fixtureLock = 1_944_202_607;

async function runDatabaseCommand(command: "db:migrate" | "db:seed") {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const {stdout, stderr} = await execFile(npm, ["run", command], {
    cwd: process.cwd(),
    env: {...process.env, DATABASE_URL: testDatabaseUrl},
    maxBuffer: 2 * 1024 * 1024,
    shell: process.platform === "win32",
  });

  return `${stdout}\n${stderr}`;
}

describe.skipIf(!testDatabaseUrl)("M1 through M3 database migration and seed", () => {
  it("migrates twice, creates M3 tables and unique keys, and seeds all stable plan codes idempotently", async () => {
    const pool = new Pool({connectionString: testDatabaseUrl, max: 1});
    let connectedClient: PoolClient | undefined;
    let lockAcquired = false;
    try {
      const client = await pool.connect();
      connectedClient = client;
      await client.query("SELECT pg_advisory_lock($1)", [fixtureLock]);
      lockAcquired = true;
      const firstMigrationOutput = await runDatabaseCommand("db:migrate");
      const secondMigrationOutput = await runDatabaseCommand("db:migrate");
      const firstSeedOutput = await runDatabaseCommand("db:seed");
      const secondSeedOutput = await runDatabaseCommand("db:seed");

      for (const output of [firstMigrationOutput, secondMigrationOutput, firstSeedOutput, secondSeedOutput]) {
        expect(output).not.toContain(testDatabaseUrl);
      }

      const plans = await client.query<{code: string; count: number}>(
        "SELECT code, count(*)::int AS count FROM membership_plans GROUP BY code ORDER BY code",
      );
      expect(plans.rows).toEqual([
        {code: "community", count: 1},
        {code: "corporate", count: 1},
        {code: "patron", count: 1},
        {code: "startup", count: 1},
      ]);

      const m2Tables = await client.query<{table_name: string}>(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name = ANY($1)
         ORDER BY table_name`,
        [[
          "approvals",
          "campaign_recipients",
          "campaigns",
          "email_log",
          "engagement_events",
          "engagement_scores",
          "event_registrations",
          "events",
          "journey_state",
          "member_notes",
          "message_suppressions",
          "saved_segments",
          "staff_tasks",
          "whatsapp_log",
        ]],
      );
      expect(m2Tables.rows.map((table) => table.table_name)).toEqual([
        "approvals",
        "campaign_recipients",
        "campaigns",
        "email_log",
        "engagement_events",
        "engagement_scores",
        "event_registrations",
        "events",
        "journey_state",
        "member_notes",
        "message_suppressions",
        "saved_segments",
        "staff_tasks",
        "whatsapp_log",
      ]);

      const m3UniqueConstraints = await client.query<{table_name: string; constraint_name: string}>(
        `SELECT table_name, constraint_name
         FROM information_schema.table_constraints
         WHERE table_schema = 'public'
           AND constraint_type = 'UNIQUE'
           AND constraint_name = ANY($1)
         ORDER BY table_name, constraint_name`,
        [[
          "email_log_idempotency_key_unique",
          "journey_state_delivery_key_unique",
          "journey_state_profile_instance_step_unique",
          "message_suppressions_profile_channel_classification_unique",
          "staff_tasks_dedupe_key_unique",
          "whatsapp_log_idempotency_key_unique",
        ]],
      );
      expect(m3UniqueConstraints.rows).toEqual([
        {table_name: "email_log", constraint_name: "email_log_idempotency_key_unique"},
        {table_name: "journey_state", constraint_name: "journey_state_delivery_key_unique"},
        {table_name: "journey_state", constraint_name: "journey_state_profile_instance_step_unique"},
        {table_name: "message_suppressions", constraint_name: "message_suppressions_profile_channel_classification_unique"},
        {table_name: "staff_tasks", constraint_name: "staff_tasks_dedupe_key_unique"},
        {table_name: "whatsapp_log", constraint_name: "whatsapp_log_idempotency_key_unique"},
      ]);

      const m4bEnums = await client.query<{enum_name: string; enum_value: string}>(
        `SELECT t.typname AS enum_name, e.enumlabel AS enum_value
         FROM pg_type t
         JOIN pg_enum e ON e.enumtypid = t.oid
         WHERE t.typname = ANY($1)
         ORDER BY t.typname, e.enumsortorder`,
        [["agent_name", "agent_trigger", "post_kind"]],
      );
      expect(m4bEnums.rows).toEqual([
        {enum_name: "agent_name", enum_value: "concierge"},
        {enum_name: "agent_name", enum_value: "retention_analyst"},
        {enum_name: "agent_name", enum_value: "board_reporter"},
        {enum_name: "agent_trigger", enum_value: "web"},
        {enum_name: "agent_trigger", enum_value: "whatsapp"},
        {enum_name: "agent_trigger", enum_value: "scheduled"},
        {enum_name: "post_kind", enum_value: "news"},
        {enum_name: "post_kind", enum_value: "buildlog"},
        {enum_name: "post_kind", enum_value: "page"},
      ]);

      const m4bColumns = await client.query<{
        table_name: string;
        column_name: string;
        is_nullable: "YES" | "NO";
      }>(
        `SELECT table_name, column_name, is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND (
             (table_name = 'agent_runs' AND column_name = 'agent')
             OR (table_name = 'approvals' AND column_name = 'request_key')
             OR table_name = 'posts'
           )
         ORDER BY table_name, ordinal_position`,
      );
      expect(m4bColumns.rows).toEqual([
        {table_name: "agent_runs", column_name: "agent", is_nullable: "NO"},
        {table_name: "approvals", column_name: "request_key", is_nullable: "YES"},
        {table_name: "posts", column_name: "id", is_nullable: "NO"},
        {table_name: "posts", column_name: "slug", is_nullable: "NO"},
        {table_name: "posts", column_name: "kind", is_nullable: "NO"},
        {table_name: "posts", column_name: "title_en", is_nullable: "NO"},
        {table_name: "posts", column_name: "title_zh", is_nullable: "NO"},
        {table_name: "posts", column_name: "body_mdx", is_nullable: "NO"},
        {table_name: "posts", column_name: "published_at", is_nullable: "YES"},
        {table_name: "posts", column_name: "author", is_nullable: "NO"},
        {table_name: "posts", column_name: "source_key", is_nullable: "YES"},
        {table_name: "posts", column_name: "agent_run_id", is_nullable: "YES"},
        {table_name: "posts", column_name: "created_at", is_nullable: "NO"},
        {table_name: "posts", column_name: "updated_at", is_nullable: "NO"},
      ]);

      const m4bIndexes = await client.query<{indexname: string; indexdef: string}>(
        `SELECT indexname, indexdef
         FROM pg_indexes
         WHERE schemaname = 'public'
           AND indexname = ANY($1)
         ORDER BY indexname`,
        [[
          "approvals_request_key_unique",
          "posts_slug_unique",
          "posts_source_key_unique",
        ]],
      );
      expect(m4bIndexes.rows.map(({indexname}) => indexname)).toEqual([
        "approvals_request_key_unique",
        "posts_slug_unique",
        "posts_source_key_unique",
      ]);
      expect(m4bIndexes.rows.find(({indexname}) =>
        indexname === "approvals_request_key_unique")?.indexdef)
        .toContain("WHERE (request_key IS NOT NULL)");
      expect(m4bIndexes.rows.find(({indexname}) =>
        indexname === "posts_source_key_unique")?.indexdef)
        .toContain("WHERE (source_key IS NOT NULL)");

      const postForeignKey = await client.query<{
        source_column: string;
        foreign_table: string;
        foreign_column: string;
      }>(
        `SELECT
           source_column.attname AS source_column,
           foreign_table.relname AS foreign_table,
           foreign_column.attname AS foreign_column
         FROM pg_constraint constraint_record
         JOIN pg_class source_table ON source_table.oid = constraint_record.conrelid
         JOIN pg_class foreign_table ON foreign_table.oid = constraint_record.confrelid
         JOIN pg_attribute source_column
           ON source_column.attrelid = source_table.oid
          AND source_column.attnum = constraint_record.conkey[1]
         JOIN pg_attribute foreign_column
           ON foreign_column.attrelid = foreign_table.oid
          AND foreign_column.attnum = constraint_record.confkey[1]
         WHERE constraint_record.contype = 'f'
           AND source_table.relname = 'posts'
           AND source_column.attname = 'agent_run_id'`,
      );
      expect(postForeignKey.rows).toEqual([{
        source_column: "agent_run_id",
        foreign_table: "agent_runs",
        foreign_column: "id",
      }]);

      const view = await client.query(
        `SELECT matviewname, ispopulated
           FROM pg_matviews
          WHERE schemaname = 'public'
            AND matviewname = 'aiops_monthly_metrics'`,
      );
      expect(view.rows).toEqual([{
        matviewname: "aiops_monthly_metrics",
        ispopulated: true,
      }]);

      const index = await client.query(
        `SELECT indexname
           FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname = 'aiops_monthly_metrics_month_start_unique'`,
      );
      expect(index.rows).toEqual([{
        indexname: "aiops_monthly_metrics_month_start_unique",
      }]);
    } finally {
      try {
        if (lockAcquired && connectedClient) await connectedClient.query("SELECT pg_advisory_unlock($1)", [fixtureLock]);
      } finally {
        try {
          connectedClient?.release();
        } finally {
          await pool.end();
        }
      }
    }
  });
  it("materializes twelve scalar-only Hong Kong months with deterministic public metrics", async () => {
    const pool = new Pool({connectionString: testDatabaseUrl, max: 1});
    let connectedClient: PoolClient | undefined;
    let lockAcquired = false;
    let transactionStarted = false;
    try {
      const client = await pool.connect();
      connectedClient = client;
      await client.query("SELECT pg_advisory_lock($1)", [fixtureLock]);
      lockAcquired = true;
      await runDatabaseCommand("db:migrate");
      await runDatabaseCommand("db:seed");
      await client.query("BEGIN");
      transactionStarted = true;
      // DATABASE_URL_TEST is an isolated test database; remove source rows so every
      // zero-activity month below is an actual zero rather than a seed-data accident.
      await client.query(`TRUNCATE TABLE
        messages, agent_runs, conversations, engagement_events, memberships, profiles
        CASCADE`);

      const bounds = await client.query<{
        month_start: string;
        current_month: string;
        month_from: Date;
        fixture_month_to: Date;
        reporting_window_end: Date;
      }>(`
        SELECT
          (date_trunc('month', timezone('Asia/Hong_Kong', now()))
            - interval '11 months')::date::text AS month_start,
          date_trunc('month', timezone('Asia/Hong_Kong', now()))::date::text AS current_month,
          (date_trunc('month', timezone('Asia/Hong_Kong', now()))
            - interval '11 months')::timestamp AT TIME ZONE 'Asia/Hong_Kong'
            AS month_from,
          (date_trunc('month', timezone('Asia/Hong_Kong', now()))
            - interval '10 months')::timestamp AT TIME ZONE 'Asia/Hong_Kong'
            AS fixture_month_to,
          (date_trunc('month', timezone('Asia/Hong_Kong', now()) + interval '1 month'))
            ::timestamp AT TIME ZONE 'Asia/Hong_Kong' AS reporting_window_end
      `);
      const [month] = bounds.rows;
      expect(month).toBeDefined();
      if (!month) return;

      const monthFrom = new Date(month.month_from);
      const fixtureMonthTo = new Date(month.fixture_month_to);
      const reportingWindowEnd = new Date(month.reporting_window_end);
      const at = (minutes: number) => new Date(monthFrom.getTime() + minutes * 60_000);
      const atMilliseconds = (milliseconds: number) => new Date(monthFrom.getTime() + milliseconds);
      const beforeMonth = new Date(monthFrom.getTime() - 60_000);
      const afterReportingWindow = new Date(reportingWindowEnd.getTime() + 60_000);
      const profileId = "m4c-aiops-fixture-profile";

      await client.query(
        `INSERT INTO profiles (id, auth_user_id, display_name)
         VALUES ($1, $2, $3)`,
        [profileId, "m4c-aiops-fixture-auth", "M4C AI-Ops fixture"],
      );

      const membershipIds: string[] = [];
      for (let index = 0; index < 3; index += 1) {
        const membership = await client.query<{id: string}>(
          `INSERT INTO memberships (
             owner_user_id, plan_code, status, billing_interval, seat_limit
           ) VALUES ($1, 'community', 'active', 'annual', 1)
           RETURNING id::text AS id`,
          [profileId],
        );
        const [row] = membership.rows;
        expect(row).toBeDefined();
        if (row) membershipIds.push(row.id);
      }

      async function conversation() {
        const result = await client.query<{id: string}>(
          `INSERT INTO conversations (
             agent_kind, profile_id, locale, status, expires_at, created_at, updated_at
           ) VALUES ('concierge', $1, 'en', 'active', $2, $3, $3)
           RETURNING id::text AS id`,
          [profileId, fixtureMonthTo, at(1)],
        );
        const [row] = result.rows;
        expect(row).toBeDefined();
        if (!row) throw new Error("fixture conversation was not created");
        return row.id;
      }

      async function agentRun({
        conversationId = null,
        status,
        costUsd = "0.000000",
        csatScore = null,
        startedAt,
        completedAt = null,
      }: {
        conversationId?: string | null;
        status: "running" | "completed" | "escalated" | "failed";
        costUsd?: string;
        csatScore?: number | null;
        startedAt: Date;
        completedAt?: Date | null;
      }) {
        await client.query(
          `INSERT INTO agent_runs (
             conversation_id, agent, trigger, status, cost_usd, csat_score,
             started_at, completed_at, created_at, updated_at
           ) VALUES ($1, 'concierge', 'web', $2, $3, $4, $5, $6, $5, $5)`,
          [conversationId, status, costUsd, csatScore, startedAt, completedAt],
        );
      }

      async function message(
        conversationId: string,
        role: "user" | "assistant",
        createdAt: Date,
      ) {
        await client.query(
          `INSERT INTO messages (conversation_id, role, channel, content, created_at)
           VALUES ($1, $2, 'web', $3, $4)`,
          [conversationId, role, `${role} fixture`, createdAt],
        );
      }
      const resolvedConversation = await conversation();
      await agentRun({
        conversationId: resolvedConversation,
        status: "failed",
        startedAt: at(2),
        completedAt: at(3),
      });
      await agentRun({
        conversationId: resolvedConversation,
        status: "completed",
        costUsd: "0.100000",
        csatScore: 4,
        startedAt: at(4),
        completedAt: at(5),
      });

      await message(resolvedConversation, "user", atMilliseconds(30_000));
      await message(resolvedConversation, "user", atMilliseconds(32_000));
      await message(resolvedConversation, "assistant", atMilliseconds(33_000));
      await message(resolvedConversation, "assistant", atMilliseconds(40_000));

      const escalatedConversation = await conversation();
      await agentRun({
        conversationId: escalatedConversation,
        status: "completed",
        startedAt: at(6),
        completedAt: at(7),
      });
      await agentRun({
        conversationId: escalatedConversation,
        status: "escalated",
        costUsd: "0.200000",
        csatScore: 2,
        startedAt: at(8),
        completedAt: at(9),
      });

      await message(escalatedConversation, "assistant", atMilliseconds(49_000));
      await message(escalatedConversation, "user", atMilliseconds(50_000));
      await message(escalatedConversation, "assistant", atMilliseconds(51_000));

      const failedConversation = await conversation();
      await agentRun({
        conversationId: failedConversation,
        status: "completed",
        startedAt: at(10),
        completedAt: at(11),
      });
      await agentRun({
        conversationId: failedConversation,
        status: "failed",
        costUsd: "0.300000",
        csatScore: 3,
        startedAt: at(12),
        completedAt: at(13),
      });

      await message(failedConversation, "user", atMilliseconds(60_000));
      await message(failedConversation, "assistant", atMilliseconds(70_000));

      const nonTerminalConversation = await conversation();
      await agentRun({
        conversationId: nonTerminalConversation,
        status: "running",
        startedAt: at(14),
      });

      await message(nonTerminalConversation, "user", atMilliseconds(80_000));

      // Cost follows started_at while CSAT follows completed_at, independent of
      // the conversation terminal-outcome calculation above.
      await agentRun({
        status: "completed",
        costUsd: "9.000000",
        csatScore: 5,
        startedAt: beforeMonth,
        completedAt: at(15),
      });
      await agentRun({
        status: "completed",
        costUsd: "1.250000",
        csatScore: 1,
        startedAt: at(16),
        completedAt: afterReportingWindow,
      });

      const renewalEvents = [
        [membershipIds[0], "renewal_failed", 1],
        [membershipIds[0], "renewal_paid", 1],
        [membershipIds[1], "renewal_failed", 2],
        [membershipIds[2], "renewal_paid", 1],
      ] as const;
      for (const [membershipId, type, renewalOrdinal] of renewalEvents) {
        await client.query(
          `INSERT INTO engagement_events (profile_id, type, points, metadata, occurred_at)
           VALUES ($1, $2, 0, $3::jsonb, $4)`,
          [
            profileId,
            type,
            JSON.stringify({membershipId, renewalOrdinal}),
            at(20),
          ],
        );
      }

      await client.query('REFRESH MATERIALIZED VIEW aiops_monthly_metrics');

      const columns = await client.query<{
        column_name: string;
        data_type: string;
        udt_name: string;
        numeric_precision: number | null;
        numeric_scale: number | null;
        is_nullable: "YES" | "NO";
      }>(
        `SELECT
           column_name,
           data_type,
           udt_name,
           numeric_precision,
           numeric_scale,
           is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'aiops_monthly_metrics'
         ORDER BY ordinal_position`,
      );
      expect(columns.rows).toEqual([
        {column_name: "month_start", data_type: "date", udt_name: "date", numeric_precision: null, numeric_scale: null, is_nullable: "YES"},
        {column_name: "is_partial_month", data_type: "boolean", udt_name: "bool", numeric_precision: null, numeric_scale: null, is_nullable: "YES"},
        {column_name: "conversation_count", data_type: "integer", udt_name: "int4", numeric_precision: 32, numeric_scale: 0, is_nullable: "YES"},
        {column_name: "terminal_conversation_count", data_type: "integer", udt_name: "int4", numeric_precision: 32, numeric_scale: 0, is_nullable: "YES"},
        {column_name: "resolved_conversation_count", data_type: "integer", udt_name: "int4", numeric_precision: 32, numeric_scale: 0, is_nullable: "YES"},
        {column_name: "escalated_conversation_count", data_type: "integer", udt_name: "int4", numeric_precision: 32, numeric_scale: 0, is_nullable: "YES"},
        {column_name: "failed_conversation_count", data_type: "integer", udt_name: "int4", numeric_precision: 32, numeric_scale: 0, is_nullable: "YES"},
        {column_name: "agent_resolved_rate", data_type: "numeric", udt_name: "numeric", numeric_precision: 7, numeric_scale: 6, is_nullable: "YES"},
        {column_name: "escalation_rate", data_type: "numeric", udt_name: "numeric", numeric_precision: 7, numeric_scale: 6, is_nullable: "YES"},
        {column_name: "failure_rate", data_type: "numeric", udt_name: "numeric", numeric_precision: 7, numeric_scale: 6, is_nullable: "YES"},
        {column_name: "median_first_response_ms", data_type: "integer", udt_name: "int4", numeric_precision: 32, numeric_scale: 0, is_nullable: "YES"},
        {column_name: "first_response_sample_count", data_type: "integer", udt_name: "int4", numeric_precision: 32, numeric_scale: 0, is_nullable: "YES"},
        {column_name: "csat_average", data_type: "numeric", udt_name: "numeric", numeric_precision: 4, numeric_scale: 2, is_nullable: "YES"},
        {column_name: "csat_response_count", data_type: "integer", udt_name: "int4", numeric_precision: 32, numeric_scale: 0, is_nullable: "YES"},
        {column_name: "staff_hours_saved", data_type: "numeric", udt_name: "numeric", numeric_precision: 12, numeric_scale: 2, is_nullable: "YES"},
        {column_name: "llm_cost_usd", data_type: "numeric", udt_name: "numeric", numeric_precision: 12, numeric_scale: 6, is_nullable: "YES"},
        {column_name: "renewal_due_count", data_type: "integer", udt_name: "int4", numeric_precision: 32, numeric_scale: 0, is_nullable: "YES"},
        {column_name: "renewal_paid_count", data_type: "integer", udt_name: "int4", numeric_precision: 32, numeric_scale: 0, is_nullable: "YES"},
        {column_name: "renewal_rate", data_type: "numeric", udt_name: "numeric", numeric_precision: 7, numeric_scale: 6, is_nullable: "YES"},
        {column_name: "first_year_renewal_due_count", data_type: "integer", udt_name: "int4", numeric_precision: 32, numeric_scale: 0, is_nullable: "YES"},
        {column_name: "first_year_renewal_paid_count", data_type: "integer", udt_name: "int4", numeric_precision: 32, numeric_scale: 0, is_nullable: "YES"},
        {column_name: "first_year_renewal_rate", data_type: "numeric", udt_name: "numeric", numeric_precision: 7, numeric_scale: 6, is_nullable: "YES"},
        {column_name: "refreshed_at", data_type: "timestamp with time zone", udt_name: "timestamptz", numeric_precision: null, numeric_scale: null, is_nullable: "YES"},
      ]);
      expect(columns.rows.some(({column_name, data_type}) =>
        /(^|_)(profile|conversation|message|content|metadata|summary|error)(_|$)/i.test(column_name)
        || /json|array|text|character/i.test(data_type)))
        .toBe(false);

      const metrics = await client.query<{
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
      }>(
        `SELECT
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
         ORDER BY month_start`,
      );
      expect(metrics.rows).toHaveLength(12);
      expect(metrics.rows[0]?.month_start).toBe(month.month_start);
      expect(metrics.rows.at(-1)).toMatchObject({
        month_start: month.current_month,
        is_partial_month: true,
      });
      expect(metrics.rows.filter((row) => row.is_partial_month)).toHaveLength(1);
      expect(metrics.rows.slice(0, -1).every((row) => !row.is_partial_month)).toBe(true);
      for (let index = 1; index < metrics.rows.length; index += 1) {
        const previous = new Date(`${metrics.rows[index - 1]?.month_start}T00:00:00Z`);
        previous.setUTCMonth(previous.getUTCMonth() + 1);
        expect(metrics.rows[index]?.month_start).toBe(previous.toISOString().slice(0, 10));
      }

      expect(metrics.rows[0]).toMatchObject({
        is_partial_month: false,
        conversation_count: 4,
        terminal_conversation_count: 3,
        resolved_conversation_count: 1,
        escalated_conversation_count: 1,
        failed_conversation_count: 1,
        agent_resolved_rate: "0.333333",
        escalation_rate: "0.333333",
        failure_rate: "0.333333",
        median_first_response_ms: 3000,
        first_response_sample_count: 3,
        csat_average: "3.50",
        csat_response_count: 4,
        staff_hours_saved: "0.10",
        llm_cost_usd: "1.850000",
        renewal_due_count: 3,
        renewal_paid_count: 2,
        renewal_rate: "0.666667",
        first_year_renewal_due_count: 2,
        first_year_renewal_paid_count: 2,
        first_year_renewal_rate: "1.000000",
      });
      for (const row of metrics.rows.slice(1)) {
        expect(row).toMatchObject({
          conversation_count: 0,
          terminal_conversation_count: 0,
          resolved_conversation_count: 0,
          escalated_conversation_count: 0,
          failed_conversation_count: 0,
          agent_resolved_rate: null,
          escalation_rate: null,
          failure_rate: null,
          median_first_response_ms: null,
          first_response_sample_count: 0,
          csat_average: null,
          csat_response_count: 0,
          staff_hours_saved: "0.00",
          llm_cost_usd: "0.000000",
          renewal_due_count: 0,
          renewal_paid_count: 0,
          renewal_rate: null,
          first_year_renewal_due_count: 0,
          first_year_renewal_paid_count: 0,
          first_year_renewal_rate: null,
        });
      }
    } finally {
      try {
        if (transactionStarted && connectedClient) await connectedClient.query("ROLLBACK");
      } finally {
        try {
          if (lockAcquired && connectedClient) await connectedClient.query("SELECT pg_advisory_unlock($1)", [fixtureLock]);
        } finally {
          try {
            connectedClient?.release();
          } finally {
            await pool.end();
          }
        }
      }
    }
  }, 30_000);
});
