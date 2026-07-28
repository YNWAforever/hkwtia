import "server-only";

import {sql, type SQL} from "drizzle-orm";
import {z} from "zod";

import {
  requireConciergeAgent,
  type ConciergeAgentActor,
} from "@/lib/auth/agent-actor";
import {getDb} from "@/lib/db/repos/common";
import type {
  AutomationDatabase,
  AutomationDatabaseLoader,
} from "@/lib/db/repos/journeys";
import type {ConversationOwner} from "@/lib/db/repos/conversations";
import {agentRuns, conversations} from "@/lib/db/server-schema";
import {forbidden} from "@/lib/membership/lifecycle";

export type AgentRunRecord = Readonly<{
  id: string;
  conversationId: string;
  profileId: string | null;
  trigger: "web" | "whatsapp";
  status: "running" | "disabled" | "completed" | "failed" | "escalated";
  provider: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: string;
  latencyMs: number | null;
  summary: string | null;
  errorCode: string | null;
  csatScore: number | null;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}>;

const startInputSchema = z.object({
  provider: z.string().min(1).max(100).nullish(),
  model: z.string().min(1).max(200).nullish(),
  startedAt: z.date().refine((value) => Number.isFinite(value.getTime())).optional(),
}).strict();
const configureModelInputSchema = z.object({
  provider: z.enum(["openai", "anthropic"]),
  model: z.string().min(1).max(200).regex(/^[A-Za-z0-9._:-]+$/),
}).strict();
const usageSchema = {
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  costUsd: z.string().regex(/^\d+(?:\.\d{1,6})?$/).optional(),
};
const completedSummaryCodeSchema = z.enum([
  "answered",
  "completed_with_tools",
]);
const failureCodeSchema = z.enum([
  "provider_error",
  "invalid_provider_response",
  "tool_error",
  "timeout",
  "rate_limited",
  "configuration_error",
]);
const escalationSummaryCodeSchema = z.enum([
  "human_requested",
  "policy_boundary",
  "low_confidence",
  "tool_unavailable",
]);
const disabledSummaryCodeSchema = z.enum([
  "agent_disabled",
  "channel_disabled",
]);
const finishInputSchema = z.object({
  completedAt: z.date().refine((value) => Number.isFinite(value.getTime())),
  summaryCode: completedSummaryCodeSchema,
  ...usageSchema,
}).strict();
const failInputSchema = z.object({
  completedAt: z.date().refine((value) => Number.isFinite(value.getTime())),
  errorCode: failureCodeSchema,
  ...usageSchema,
}).strict();
const escalationInputSchema = z.object({
  completedAt: z.date().refine((value) => Number.isFinite(value.getTime())),
  summaryCode: escalationSummaryCodeSchema,
  ...usageSchema,
}).strict();
const disabledInputSchema = z.object({
  completedAt: z.date().refine((value) => Number.isFinite(value.getTime())),
  summaryCode: disabledSummaryCodeSchema,
  ...usageSchema,
}).strict();
const scoreSchema = z.number().int().min(1).max(5);
const runIdSchema = z.string().uuid();
const ownerSchema = z.discriminatedUnion("kind", [
  z.object({kind: z.literal("profile"), profileId: z.string().min(1).max(255)}).strict(),
  z.object({
    kind: z.literal("anonymous"),
    anonymousOwnerHash: z.string().min(32).max(255),
  }).strict(),
]);

function rowsFrom(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) {
    return result.rows as Record<string, unknown>[];
  }
  return [];
}

function requiredDate(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new Error("INVALID_REPOSITORY_DATE");
  return date;
}

function optionalDate(value: unknown): Date | null {
  return value === null || value === undefined ? null : requiredDate(value);
}

function optionalString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function runFrom(row: Record<string, unknown>): AgentRunRecord {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    profileId: optionalString(row.profile_id),
    trigger: String(row.trigger) as AgentRunRecord["trigger"],
    status: String(row.status) as AgentRunRecord["status"],
    provider: optionalString(row.provider),
    model: optionalString(row.model),
    inputTokens: Number(row.input_tokens),
    outputTokens: Number(row.output_tokens),
    costUsd: String(row.cost_usd),
    latencyMs: row.latency_ms === null || row.latency_ms === undefined
      ? null
      : Number(row.latency_ms),
    summary: optionalString(row.summary),
    errorCode: optionalString(row.error_code),
    csatScore: row.csat_score === null || row.csat_score === undefined
      ? null
      : Number(row.csat_score),
    startedAt: requiredDate(row.started_at),
    completedAt: optionalDate(row.completed_at),
    createdAt: requiredDate(row.created_at),
    updatedAt: requiredDate(row.updated_at),
  };
}

function actorOwnerPredicate(actor: ConciergeAgentActor): SQL {
  return actor.profileId === null
    ? sql`${conversations.profileId} IS NULL`
    : sql`${conversations.profileId} = ${actor.profileId}`;
}

function feedbackOwnerPredicate(owner: ConversationOwner): SQL {
  const parsed = ownerSchema.parse(owner);
  return parsed.kind === "profile"
    ? sql`owned.profile_id = ${parsed.profileId} AND owned.anonymous_owner_hash IS NULL`
    : sql`owned.profile_id IS NULL AND owned.anonymous_owner_hash = ${parsed.anonymousOwnerHash}`;
}

async function defaultDatabaseLoader(): Promise<AutomationDatabase> {
  return await getDb() as unknown as AutomationDatabase;
}

type TransitionTarget = "completed" | "failed" | "escalated" | "disabled";
type TransitionValues = Readonly<{
  completedAt: Date;
  summary: string | null;
  errorCode: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: string;
}>;

function targetSql(target: TransitionTarget): SQL {
  switch (target) {
    case "completed": return sql.raw("'completed'");
    case "failed": return sql.raw("'failed'");
    case "escalated": return sql.raw("'escalated'");
    case "disabled": return sql.raw("'disabled'");
  }
}

async function transition(
  database: AutomationDatabase,
  actor: ConciergeAgentActor,
  target: TransitionTarget,
  values: TransitionValues,
): Promise<AgentRunRecord> {
  requireConciergeAgent(actor);
  const rows = rowsFrom(await database.execute(sql`
    UPDATE ${agentRuns}
    SET
      status = ${targetSql(target)},
      input_tokens = ${values.inputTokens},
      output_tokens = ${values.outputTokens},
      cost_usd = ${values.costUsd},
      latency_ms = FLOOR(EXTRACT(EPOCH FROM (${values.completedAt} - started_at)) * 1000)::int,
      summary = ${values.summary},
      error_code = ${values.errorCode},
      completed_at = ${values.completedAt},
      updated_at = ${values.completedAt}
    WHERE id = ${actor.runId}
      AND conversation_id = ${actor.conversationId}
      AND profile_id IS NOT DISTINCT FROM ${actor.profileId}
      AND trigger = ${actor.trigger}
      AND status = 'running'
      AND ${values.completedAt} >= started_at
    RETURNING *
  `));
  if (!rows[0]) throw new Error("INVALID_AGENT_RUN_TRANSITION");
  return runFrom(rows[0]);
}

function usageFrom(input: {
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: string;
}) {
  return {
    inputTokens: input.inputTokens ?? 0,
    outputTokens: input.outputTokens ?? 0,
    costUsd: input.costUsd ?? "0",
  };
}

export function createAgentRunsRepository(
  loadDatabase: AutomationDatabaseLoader = defaultDatabaseLoader,
) {
  return {
    async start(
      actor: ConciergeAgentActor,
      input: unknown,
    ): Promise<AgentRunRecord> {
      requireConciergeAgent(actor);
      const parsed = startInputSchema.parse(input);
      const startedAt = parsed.startedAt ?? new Date();
      const database = await loadDatabase();
      const row = rowsFrom(await database.execute(sql`
        INSERT INTO ${agentRuns}
          (
            id,
            conversation_id,
            profile_id,
            trigger,
            status,
            provider,
            model,
            started_at,
            created_at,
            updated_at
          )
        SELECT
          ${actor.runId},
          ${actor.conversationId},
          ${actor.profileId},
          ${actor.trigger},
          'running',
          ${parsed.provider ?? null},
          ${parsed.model ?? null},
          ${startedAt},
          ${startedAt},
          ${startedAt}
        FROM ${conversations}
        WHERE ${conversations.id} = ${actor.conversationId}
          AND ${actorOwnerPredicate(actor)}
        RETURNING *
      `))[0];
      if (!row) forbidden();
      return runFrom(row);
    },

    async configureModel(
      actor: ConciergeAgentActor,
      input: unknown,
    ): Promise<AgentRunRecord> {
      requireConciergeAgent(actor);
      const parsed = configureModelInputSchema.parse(input);
      const database = await loadDatabase();
      const row = rowsFrom(await database.execute(sql`
        UPDATE ${agentRuns}
        SET
          provider = ${parsed.provider},
          model = ${parsed.model},
          updated_at = NOW()
        WHERE id = ${actor.runId}
          AND conversation_id = ${actor.conversationId}
          AND profile_id IS NOT DISTINCT FROM ${actor.profileId}
          AND trigger = ${actor.trigger}
          AND status = 'running'
          AND provider IS NULL
          AND model IS NULL
        RETURNING *
      `))[0];
      if (!row) {
        throw new Error("INVALID_AGENT_RUN_MODEL_CONFIGURATION");
      }
      return runFrom(row);
    },

    async finish(actor: ConciergeAgentActor, input: unknown): Promise<AgentRunRecord> {
      requireConciergeAgent(actor);
      const parsed = finishInputSchema.parse(input);
      return transition(await loadDatabase(), actor, "completed", {
        completedAt: parsed.completedAt,
        summary: parsed.summaryCode,
        errorCode: null,
        ...usageFrom(parsed),
      });
    },

    async fail(actor: ConciergeAgentActor, input: unknown): Promise<AgentRunRecord> {
      requireConciergeAgent(actor);
      const parsed = failInputSchema.parse(input);
      return transition(await loadDatabase(), actor, "failed", {
        completedAt: parsed.completedAt,
        summary: null,
        errorCode: parsed.errorCode,
        ...usageFrom(parsed),
      });
    },

    async escalate(actor: ConciergeAgentActor, input: unknown): Promise<AgentRunRecord> {
      requireConciergeAgent(actor);
      const parsed = escalationInputSchema.parse(input);
      return transition(await loadDatabase(), actor, "escalated", {
        completedAt: parsed.completedAt,
        summary: parsed.summaryCode,
        errorCode: null,
        ...usageFrom(parsed),
      });
    },

    async disable(actor: ConciergeAgentActor, input: unknown): Promise<AgentRunRecord> {
      requireConciergeAgent(actor);
      const parsed = disabledInputSchema.parse(input);
      return transition(await loadDatabase(), actor, "disabled", {
        completedAt: parsed.completedAt,
        summary: parsed.summaryCode,
        errorCode: null,
        ...usageFrom(parsed),
      });
    },

    async recordFeedback(
      owner: ConversationOwner,
      runId: string,
      score: number,
    ): Promise<AgentRunRecord> {
      const parsedRunId = runIdSchema.parse(runId);
      const parsedScore = scoreSchema.parse(score);
      const database = await loadDatabase();
      const row = rowsFrom(await database.execute(sql`
        UPDATE ${agentRuns} AS target
        SET csat_score = ${parsedScore}, updated_at = NOW()
        FROM ${conversations} AS owned
        WHERE target.id = ${parsedRunId}
          AND target.conversation_id = owned.id
          AND target.status IN ('completed', 'escalated')
          AND target.csat_score IS NULL
          AND ${feedbackOwnerPredicate(owner)}
        RETURNING target.*
      `))[0];
      if (!row) forbidden();
      return runFrom(row);
    },
  };
}

export type AgentRunsRepository = ReturnType<typeof createAgentRunsRepository>;
export const agentRunsRepository = createAgentRunsRepository();
export const agentRunsRepo = agentRunsRepository;
