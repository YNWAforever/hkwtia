import "server-only";

import {sql} from "drizzle-orm";

import {
  requireAutomationSystem,
  type AutomationRepositoryActor,
} from "@/lib/auth/automation-actor";
import {staffTasks} from "@/lib/db/server-schema";
import type {AutomationDatabase, AutomationDatabaseLoader, AutomationSqlExecutor} from "@/lib/db/repos/journeys";
import {getDb} from "@/lib/db/repos/common";

export type StaffTaskInput = Readonly<{
  profileId: string;
  journeyStateId: string | null;
  kind: string;
  dedupeKey: string;
  summaryCode: string;
}>;

export type StaffTaskRecord = Readonly<{
  id: string;
  profileId: string;
  journeyStateId: string | null;
  kind: string;
  dedupeKey: string;
  summaryCode: string;
  status: "open" | "resolved";
}>;

function rowsFrom(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) {
    return result.rows as Record<string, unknown>[];
  }
  return [];
}

function taskFrom(row: Record<string, unknown>): StaffTaskRecord {
  return {
    id: String(row.id),
    profileId: String(row.profile_id),
    journeyStateId: row.journey_state_id === null || row.journey_state_id === undefined ? null : String(row.journey_state_id),
    kind: String(row.kind),
    dedupeKey: String(row.dedupe_key),
    summaryCode: String(row.summary_code),
    status: String(row.status) as StaffTaskRecord["status"],
  };
}

async function defaultDatabaseLoader(): Promise<AutomationDatabase> {
  return await getDb() as unknown as AutomationDatabase;
}

async function existingTask(transaction: AutomationSqlExecutor, dedupeKey: string): Promise<StaffTaskRecord> {
  const row = rowsFrom(await transaction.execute(sql`
    SELECT * FROM ${staffTasks} WHERE dedupe_key = ${dedupeKey} LIMIT 1
  `))[0];
  if (!row) throw new Error("STAFF_TASK_CREATE_FAILED");
  return taskFrom(row);
}

export function createStaffTasksRepository(loadDatabase: AutomationDatabaseLoader = defaultDatabaseLoader) {
  return {
    async createOnce(
      actor: AutomationRepositoryActor,
      input: StaffTaskInput,
    ): Promise<Readonly<{record: StaffTaskRecord; disposition: "created" | "existing"}>> {
      requireAutomationSystem(actor);
      const database = await loadDatabase();
      const result = await database.execute(sql`
        INSERT INTO ${staffTasks}
          (profile_id, journey_state_id, kind, dedupe_key, summary_code)
        VALUES (${input.profileId}, ${input.journeyStateId}, ${input.kind}, ${input.dedupeKey}, ${input.summaryCode})
        ON CONFLICT DO NOTHING
        RETURNING *
      `);
      const row = rowsFrom(result)[0];
      if (row) return {record: taskFrom(row), disposition: "created"};
      return {record: await existingTask(database, input.dedupeKey), disposition: "existing"};
    },
  };
}

export type StaffTasksRepository = ReturnType<typeof createStaffTasksRepository>;
export const staffTasksRepository = createStaffTasksRepository();
export const staffTasksRepo = staffTasksRepository;
