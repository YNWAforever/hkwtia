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
    } finally {
      await pool.end();
    }
  });
});
