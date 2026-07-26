import {Pool} from "@neondatabase/serverless";
import {drizzle} from "drizzle-orm/neon-serverless";
import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {
  expireStaleApprovals,
  type ApprovalExpiryJobSummary,
} from "@/lib/automation/approvals-expirer";
import {automationCronActor} from "@/lib/auth/automation-actor";
import {createApprovalExpiryRepository} from "@/lib/db/repos/approvals";
import type {AutomationDatabase} from "@/lib/db/repos/journeys";

const testDatabaseUrl = process.env.DATABASE_URL_TEST?.trim() ?? "";
const fixture = `m3-task8-${process.pid}-${Date.now()}`;
const profileId = `${fixture}-profile`;
const approvalIds = [
  crypto.randomUUID(),
  crypto.randomUUID(),
  crypto.randomUUID(),
] as const;
const [oldApprovalId, boundaryApprovalId, newerApprovalId] = approvalIds;
const asOf = new Date("1970-01-10T00:00:00.000Z");
const cutoff = new Date(asOf.getTime() - 72 * 3_600_000);
const cronActor = automationCronActor();

let pool: Pool | undefined;
let database: AutomationDatabase | undefined;

function requirePool(): Pool {
  if (!pool) throw new Error("DATABASE_URL_TEST pool was not initialized");
  return pool;
}

function requireDatabase(): AutomationDatabase {
  if (!database) {
    throw new Error("DATABASE_URL_TEST database was not initialized");
  }
  return database;
}

function total(
  summaries: readonly ApprovalExpiryJobSummary[],
  key: "expired" | "auditsCreated" | "tasksCreated",
): number {
  return summaries.reduce((sum, summary) => sum + summary[key], 0);
}

describe.skipIf(!testDatabaseUrl)(
  "Task 8 approval expiry on current migrated Postgres",
  () => {
    beforeAll(async () => {
      pool = new Pool({connectionString: testDatabaseUrl});
      database = drizzle(pool) as unknown as AutomationDatabase;
      const activePool = requirePool();

      await activePool.query(
        `INSERT INTO profiles (id, auth_user_id, display_name)
         VALUES ($1, $2, 'Task 8 approval expiry fixture')`,
        [profileId, `auth-${fixture}`],
      );
      await activePool.query(
        `INSERT INTO approvals
           (id, action_type, payload, requested_by_profile_id, requested_at)
         VALUES
           ($1, 'campaign.send', '{}'::jsonb, $4, $5),
           ($2, 'campaign.send', '{}'::jsonb, $4, $6),
           ($3, 'campaign.send', '{}'::jsonb, $4, $7)`,
        [
          oldApprovalId,
          boundaryApprovalId,
          newerApprovalId,
          profileId,
          new Date(cutoff.getTime() - 1),
          cutoff,
          new Date(cutoff.getTime() + 1),
        ],
      );
    });

    afterAll(async () => {
      if (!pool) return;
      try {
        const dedupeKeys = approvalIds.map((id) => `approval-expiry:${id}`);
        await pool.query(
          "DELETE FROM staff_tasks WHERE dedupe_key = ANY($1::text[])",
          [dedupeKeys],
        );
        await pool.query(
          `DELETE FROM audit_events
           WHERE target_type = 'approval'
             AND target_id = ANY($1::text[])`,
          [approvalIds],
        );
        await pool.query(
          "DELETE FROM approvals WHERE id = ANY($1::uuid[])",
          [approvalIds],
        );
        await pool.query("DELETE FROM profiles WHERE id = $1", [profileId]);
      } finally {
        await pool.end();
      }
    });

    it(
      "concurrent runs expire the inclusive cutoff once and atomically create one audit and task per transition",
      async () => {
        const activeDatabase = requireDatabase();
        const activePool = requirePool();
        const approvals = createApprovalExpiryRepository(
          async () => activeDatabase,
        );

        const summaries = await Promise.all([
          expireStaleApprovals(cronActor, asOf, {approvals, batchSize: 1}),
          expireStaleApprovals(cronActor, asOf, {approvals, batchSize: 1}),
        ]);

        expect(total(summaries, "expired")).toBe(2);
        expect(total(summaries, "auditsCreated")).toBe(2);
        expect(total(summaries, "tasksCreated")).toBe(2);

        const statuses = await activePool.query<{
          id: string;
          status: string;
          decided_at: Date | null;
        }>(
          `SELECT id, status, decided_at
           FROM approvals
           WHERE id = ANY($1::uuid[])
           ORDER BY requested_at, id`,
          [approvalIds],
        );
        expect(statuses.rows).toEqual([
          {id: oldApprovalId, status: "expired", decided_at: asOf},
          {id: boundaryApprovalId, status: "expired", decided_at: asOf},
          {id: newerApprovalId, status: "pending", decided_at: null},
        ]);

        const audits = await activePool.query<{
          actor_user_id: string | null;
          actor_type: string;
          target_id: string;
          request_id: string | null;
        }>(
          `SELECT actor_user_id, actor_type, target_id, request_id
           FROM audit_events
           WHERE action = 'approval.expired'
             AND target_type = 'approval'
             AND target_id = ANY($1::text[])
           ORDER BY target_id`,
          [approvalIds],
        );
        expect(audits.rows).toEqual([
          oldApprovalId,
          boundaryApprovalId,
        ].sort().map((id) => ({
          actor_user_id: null,
          actor_type: "system",
          target_id: id,
          request_id: `approval-expiry:${id}`,
        })));

        const tasks = await activePool.query<{
          profile_id: string;
          dedupe_key: string;
          kind: string;
          summary_code: string;
        }>(
          `SELECT profile_id, dedupe_key, kind, summary_code
           FROM staff_tasks
           WHERE dedupe_key = ANY($1::text[])
           ORDER BY dedupe_key`,
          [approvalIds.map((id) => `approval-expiry:${id}`)],
        );
        expect(tasks.rows).toEqual([
          oldApprovalId,
          boundaryApprovalId,
        ].sort().map((id) => ({
          profile_id: profileId,
          dedupe_key: `approval-expiry:${id}`,
          kind: "approval_expired",
          summary_code: "approval_expired",
        })).sort((left, right) => left.dedupe_key.localeCompare(right.dedupe_key)));
      },
      30_000,
    );
  },
);
