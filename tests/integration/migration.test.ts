import {execFile as execFileCallback} from "node:child_process";
import {promisify} from "node:util";

import {Pool} from "@neondatabase/serverless";
import {describe, expect, it} from "vitest";

const execFile = promisify(execFileCallback);

const testDatabaseUrl = process.env.DATABASE_URL_TEST?.trim() ?? "";

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
    const firstMigrationOutput = await runDatabaseCommand("db:migrate");
    const secondMigrationOutput = await runDatabaseCommand("db:migrate");
    const firstSeedOutput = await runDatabaseCommand("db:seed");
    const secondSeedOutput = await runDatabaseCommand("db:seed");

    for (const output of [firstMigrationOutput, secondMigrationOutput, firstSeedOutput, secondSeedOutput]) {
      expect(output).not.toContain(testDatabaseUrl);
    }

    const pool = new Pool({connectionString: testDatabaseUrl});
    try {
      const plans = await pool.query<{code: string; count: number}>(
        "SELECT code, count(*)::int AS count FROM membership_plans GROUP BY code ORDER BY code",
      );
      expect(plans.rows).toEqual([
        {code: "community", count: 1},
        {code: "corporate", count: 1},
        {code: "patron", count: 1},
        {code: "startup", count: 1},
      ]);

      const m2Tables = await pool.query<{table_name: string}>(
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

      const m3UniqueConstraints = await pool.query<{table_name: string; constraint_name: string}>(
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

      const m4bEnums = await pool.query<{enum_name: string; enum_value: string}>(
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

      const m4bColumns = await pool.query<{
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

      const m4bIndexes = await pool.query<{indexname: string; indexdef: string}>(
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

      const postForeignKey = await pool.query<{
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
    } finally {
      await pool.end();
    }
  });
});
