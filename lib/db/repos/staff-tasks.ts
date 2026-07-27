import "server-only";

import {sql} from "drizzle-orm";
import {z} from "zod";

import {
  requireConciergeAgent,
  type ConciergeAgentActor,
} from "@/lib/auth/agent-actor";
import {
  requireAutomationSystem,
  type AutomationRepositoryActor,
} from "@/lib/auth/automation-actor";
import {staffTasks} from "@/lib/db/server-schema";
import type {AutomationDatabase, AutomationDatabaseLoader, AutomationSqlExecutor} from "@/lib/db/repos/journeys";
import {getDb} from "@/lib/db/repos/common";

export type StaffTaskContext = Readonly<{
  contactEmail?: string;
  conversationId?: string;
  agentRunId?: string;
  reasonCode?: string;
  locale?: "en" | "zh-HK";
}>;

type StaffTaskFields = Readonly<{
  journeyStateId: string | null;
  kind: string;
  dedupeKey: string;
  summaryCode: string;
  context?: StaffTaskContext;
}>;

export type StaffTaskInput = StaffTaskFields & Readonly<{
  profileId: string;
}>;

const agentStaffTaskSummaryCodeSchema = z.enum([
  "human_requested",
  "policy_boundary",
  "low_confidence",
  "tool_unavailable",
  "provider_handoff",
]);

export type AgentStaffTaskSummaryCode =
  z.infer<typeof agentStaffTaskSummaryCodeSchema>;

export type AgentStaffTaskInput = Omit<StaffTaskFields, "summaryCode"> & Readonly<{
  profileId: string | null;
  summaryCode: AgentStaffTaskSummaryCode;
}>;

type AnyStaffTaskInput = StaffTaskFields & Readonly<{
  profileId: string | null;
}>;

type StaffTaskRecordFields = Readonly<{
  id: string;
  journeyStateId: string | null;
  kind: string;
  dedupeKey: string;
  summaryCode: string;
  context?: StaffTaskContext;
  status: "open" | "resolved";
}>;

export type StaffTaskRecord = StaffTaskRecordFields & Readonly<{
  profileId: string;
}>;

export type AgentStaffTaskRecord = StaffTaskRecordFields & Readonly<{
  profileId: string | null;
  context: StaffTaskContext;
}>;

type AnyStaffTaskRecord = StaffTaskRecordFields & Readonly<{
  profileId: string | null;
}>;

type StaffTaskResult<T> = Readonly<{
  record: T;
  disposition: "created" | "existing";
}>;

const contextSchema = z.object({
  contactEmail: z.string().email().max(320).optional(),
  conversationId: z.string().uuid().optional(),
  agentRunId: z.string().uuid().optional(),
  reasonCode: z.string().regex(/^[a-z0-9][a-z0-9_.-]{0,99}$/).optional(),
  locale: z.enum(["en", "zh-HK"]).optional(),
}).strict();
const inputSchema = z.object({
  profileId: z.string().min(1).max(255).nullable(),
  journeyStateId: z.string().min(1).max(255).nullable(),
  kind: z.string().min(1).max(100),
  dedupeKey: z.string().min(1).max(255),
  summaryCode: z.string().min(1).max(10_000),
  context: contextSchema.optional(),
}).strict();


function rowsFrom(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) {
    return result.rows as Record<string, unknown>[];
  }
  return [];
}

function taskFrom(row: Record<string, unknown>): AnyStaffTaskRecord {
  return {
    id: String(row.id),
    profileId: row.profile_id === null || row.profile_id === undefined
      ? null
      : String(row.profile_id),
    journeyStateId: row.journey_state_id === null || row.journey_state_id === undefined ? null : String(row.journey_state_id),
    kind: String(row.kind),
    dedupeKey: String(row.dedupe_key),
    summaryCode: String(row.summary_code),
    context: row.context && typeof row.context === "object" && !Array.isArray(row.context)
      ? row.context as StaffTaskContext
      : {},
    status: String(row.status) as AnyStaffTaskRecord["status"],
  };
}

async function defaultDatabaseLoader(): Promise<AutomationDatabase> {
  return await getDb() as unknown as AutomationDatabase;
}

async function existingTask(
  transaction: AutomationSqlExecutor,
  dedupeKey: string,
): Promise<AnyStaffTaskRecord> {
  const row = rowsFrom(await transaction.execute(sql`
    SELECT * FROM ${staffTasks} WHERE dedupe_key = ${dedupeKey} LIMIT 1
  `))[0];
  if (!row) throw new Error("STAFF_TASK_CREATE_FAILED");
  return taskFrom(row);
}

function isOwnedByAgent(
  record: AnyStaffTaskRecord,
  actor: ConciergeAgentActor,
): boolean {
  return (
    record.profileId === actor.profileId
    && record.context?.conversationId === actor.conversationId
    && record.context?.agentRunId === actor.runId
  );
}

async function existingAgentTask(
  transaction: AutomationSqlExecutor,
  actor: ConciergeAgentActor,
  dedupeKey: string,
): Promise<AgentStaffTaskRecord> {
  const row = rowsFrom(await transaction.execute(sql`
    SELECT * FROM ${staffTasks}
    WHERE dedupe_key = ${dedupeKey}
      AND profile_id IS NOT DISTINCT FROM ${actor.profileId}
      AND context ->> 'conversationId' = ${actor.conversationId}
      AND context ->> 'agentRunId' = ${actor.runId}
    LIMIT 1
  `))[0];
  if (!row) throw new Error("STAFF_TASK_DEDUPE_CONFLICT");
  const record = taskFrom(row);
  if (!isOwnedByAgent(record, actor)) {
    throw new Error("STAFF_TASK_DEDUPE_CONFLICT");
  }
  return record as AgentStaffTaskRecord;
}

export function createStaffTasksRepository(
  loadDatabase: AutomationDatabaseLoader = defaultDatabaseLoader,
) {
  async function createOnce(
    actor: AutomationRepositoryActor,
    input: StaffTaskInput,
  ): Promise<StaffTaskResult<StaffTaskRecord>>;
  async function createOnce(
    actor: ConciergeAgentActor,
    input: AgentStaffTaskInput,
  ): Promise<StaffTaskResult<AgentStaffTaskRecord>>;
  async function createOnce(
    actor: AutomationRepositoryActor | ConciergeAgentActor,
    input: AnyStaffTaskInput,
  ): Promise<StaffTaskResult<AnyStaffTaskRecord>> {
    if (actor.kind === "agent") {
      requireConciergeAgent(actor);
    } else {
      requireAutomationSystem(actor);
    }

    const parsed = inputSchema.parse(input);
    const context = parsed.context ?? {};
    if (new TextEncoder().encode(JSON.stringify(context)).byteLength > 4_096) {
      throw new Error("STAFF_TASK_CONTEXT_TOO_LARGE");
    }

    if (actor.kind === "agent") {
      if (parsed.dedupeKey !== `agent-run:${actor.runId}`) throw new Error("INVALID_AGENT_STAFF_TASK");
      if (
        parsed.profileId !== actor.profileId
        || context.conversationId !== actor.conversationId
        || context.agentRunId !== actor.runId
        || !context.reasonCode
        || !context.locale
      ) {
        throw new Error("INVALID_AGENT_STAFF_TASK");
      }
    } else {
      // M3 automation callers intentionally retain their authored summary-code contract.
      // Only Concierge-generated operational data is constrained to the enum above.
      if (parsed.profileId === null) {
        throw new Error("AUTOMATION_STAFF_TASK_PROFILE_REQUIRED");
      }
    }

    const summaryCode = actor.kind === "agent"
      ? agentStaffTaskSummaryCodeSchema.parse(parsed.summaryCode)
      : parsed.summaryCode;
    const database = await loadDatabase();
    const result = await database.execute(sql`
      INSERT INTO ${staffTasks}
        (
          profile_id,
          journey_state_id,
          kind,
          dedupe_key,
          summary_code,
          context
        )
      VALUES (
        ${parsed.profileId},
        ${parsed.journeyStateId},
        ${parsed.kind},
        ${parsed.dedupeKey},
        ${summaryCode},
        ${context}
      )
      ON CONFLICT DO NOTHING
      RETURNING *
    `);
    const row = rowsFrom(result)[0];
    if (row) return {record: taskFrom(row), disposition: "created"};
    if (actor.kind === "agent") {
      return {
        record: await existingAgentTask(database, actor, parsed.dedupeKey),
        disposition: "existing",
      };
    }
    return {
      record: await existingTask(database, parsed.dedupeKey),
      disposition: "existing",
    };
  }

  return {createOnce};
}

export type StaffTasksRepository = Readonly<{
  createOnce: (
    actor: AutomationRepositoryActor,
    input: StaffTaskInput,
  ) => Promise<StaffTaskResult<StaffTaskRecord>>;
}>;
export const staffTasksRepository = createStaffTasksRepository();
export const staffTasksRepo = staffTasksRepository;
export type AgentStaffTasksRepository = Readonly<{
  createOnce: (
    actor: ConciergeAgentActor,
    input: AgentStaffTaskInput,
  ) => Promise<StaffTaskResult<AgentStaffTaskRecord>>;
}>;
export type AllStaffTasksRepository =
  StaffTasksRepository & AgentStaffTasksRepository;
