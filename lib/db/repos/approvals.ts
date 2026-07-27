import "server-only";

import {and, asc, eq, sql} from "drizzle-orm";
import {z} from "zod";

import {
  requireConciergeAgent,
  type ConciergeAgentActor,
} from "@/lib/auth/agent-actor";
import {requireAdmin} from "@/lib/auth/actor";
import {
  requireAutomationSystem,
  type AutomationRepositoryActor,
} from "@/lib/auth/automation-actor";
import {getDb, type Database} from "@/lib/db/repos/common";
import type {
  AutomationDatabase,
  AutomationDatabaseLoader,
} from "@/lib/db/repos/journeys";
import {approvals, auditEvents, staffTasks} from "@/lib/db/server-schema";
import type {Actor} from "@/lib/membership/lifecycle";

export const approvalDecisionSchema = z.object({
  approvalId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
}).strict();

export type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>;
export type ApprovalPayloadSummary = Readonly<{key: "campaignId" | "template" | "eventId" | "slug" | "membershipId" | "field" | "to" | "subject" | "text" | "locale" | "conversationId" | "agentRunId"; value: string}>;
export const draftEmailApprovalSchema = z.object({
  to: z.string().email().max(320),
  subject: z.string().min(1).max(998),
  text: z.string().min(1).max(50_000),
  locale: z.enum(["en", "zh-HK"]),
  conversationId: z.string().uuid(),
  agentRunId: z.string().uuid(),
}).strict();
const supportedPayloadSchemas = {
  "campaign.send": z.object({campaignId: z.string().uuid(), template: z.enum(["renewal-reminder", "member-update"])}).strict(),
  "event.publish": z.object({eventId: z.string().uuid(), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(200)}).strict(),
  "membership.update": z.object({membershipId: z.string().uuid(), field: z.enum(["status", "billingInterval", "cancelAtPeriodEnd"])}).strict(),
  "agent.draft_email": draftEmailApprovalSchema,
} as const;
export type DraftEmailApprovalInput = z.infer<typeof draftEmailApprovalSchema>;
export type SupportedApprovalActionType = keyof typeof supportedPayloadSchemas;
export type ApprovalPayloadReview = Readonly<{actionType: SupportedApprovalActionType | null; payloadSummary: readonly ApprovalPayloadSummary[]; actionable: boolean}>;
export type PendingApproval = Readonly<{id: string; actionType: SupportedApprovalActionType | null; payloadSummary: readonly ApprovalPayloadSummary[]; actionable: boolean; requestedAt: Date}>;
export type DraftEmailApproval = Readonly<{
  id: string;
  status: "pending";
  requestedAt: Date;
}>;
export type ApprovalDecision = Readonly<{id: string; status: "approved" | "rejected"; decidedAt: Date}>;
export type ApprovalExpiryBatchInput = Readonly<{
  asOf: Date;
  limit: number;
}>;
export type ApprovalExpiryBatchResult = Readonly<{
  expired: number;
  auditsCreated: number;
  tasksCreated: number;
  missingRequesterProfiles: number;
}>;
export type ApprovalExpiryRepository = Readonly<{
  expirePendingBatch: (
    actor: AutomationRepositoryActor,
    input: ApprovalExpiryBatchInput,
  ) => Promise<ApprovalExpiryBatchResult>;
}>;

const approvalExpiryInputSchema = z.object({
  asOf: z.date().refine((value) => Number.isFinite(value.getTime())),
  limit: z.number().int().positive().max(1_000),
}).strict();
const approvalExpiryResultSchema = z.object({
  expired_count: z.coerce.number().int().nonnegative(),
  audit_count: z.coerce.number().int().nonnegative(),
  task_count: z.coerce.number().int().nonnegative(),
  missing_requester_count: z.coerce.number().int().nonnegative(),
});

export function reviewApprovalPayload(actionType: unknown, payload: unknown): ApprovalPayloadReview {
  if (typeof actionType !== "string" || !Object.prototype.hasOwnProperty.call(supportedPayloadSchemas, actionType)) return {actionType: null, payloadSummary: [], actionable: false};
  const supportedType = actionType as SupportedApprovalActionType;
  const parsed = supportedPayloadSchemas[supportedType].safeParse(payload);
  if (!parsed.success) return {actionType: supportedType, payloadSummary: [], actionable: false};
  const payloadSummary = Object.entries(parsed.data).map(([key, value]) => ({key: key as ApprovalPayloadSummary["key"], value: String(value)}));
  return {actionType: supportedType, payloadSummary, actionable: true};
}

export function summarizeApprovalPayload(actionType: unknown, payload: unknown): readonly ApprovalPayloadSummary[] {
  return reviewApprovalPayload(actionType, payload).payloadSummary;
}

export type AgentApprovalsRepository = Readonly<{
  createDraftEmail: (
    actor: ConciergeAgentActor,
    input: unknown,
  ) => Promise<DraftEmailApproval>;
}>;
export type ApprovalsRepository = Readonly<{
  listPending: (actor: Actor) => Promise<readonly PendingApproval[]>;
  decide: (actor: Actor, input: unknown) => Promise<ApprovalDecision>;
}>;
type DatabaseLoader = () => Promise<Database>;

function resultRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (
    result
    && typeof result === "object"
    && "rows" in result
    && Array.isArray(result.rows)
  ) {
    return result.rows;
  }
  return [];
}

async function defaultAutomationDatabaseLoader(): Promise<AutomationDatabase> {
  return await getDb() as unknown as AutomationDatabase;
}

export function createApprovalsRepository(
  loadDatabase: DatabaseLoader = getDb,
): ApprovalsRepository & AgentApprovalsRepository {
  return {
    async createDraftEmail(actor, input) {
      requireConciergeAgent(actor);
      const parsed = draftEmailApprovalSchema.parse(input);
      if (
        parsed.conversationId !== actor.conversationId
        || parsed.agentRunId !== actor.runId
      ) {
        throw new Error("INVALID_AGENT_APPROVAL_CONTEXT");
      }
      const db = await loadDatabase();
      const [created] = await db.insert(approvals).values({
        actionType: "agent.draft_email",
        payload: parsed,
        status: "pending",
        requestedByProfileId: actor.profileId,
      }).returning({
        id: approvals.id,
        status: approvals.status,
        requestedAt: approvals.requestedAt,
      });
      if (!created || created.status !== "pending") {
        throw new Error("DRAFT_EMAIL_APPROVAL_CREATE_FAILED");
      }
      return {...created, status: "pending" as const};
    },

    async listPending(actor) {
      requireAdmin(actor);
      const db = await loadDatabase();
      const rows = await db.select({id: approvals.id, actionType: approvals.actionType, payload: approvals.payload, requestedAt: approvals.requestedAt})
        .from(approvals).where(eq(approvals.status, "pending")).orderBy(asc(approvals.requestedAt), asc(approvals.id));
      return rows.map(({payload, actionType, ...row}) => ({...row, ...reviewApprovalPayload(actionType, payload)}));
    },

    async decide(actor, input) {
      requireAdmin(actor);
      const parsed = approvalDecisionSchema.parse(input);
      const db = await loadDatabase();
      return db.transaction(async (transaction) => {
        const [candidate] = await transaction.select({id: approvals.id, status: approvals.status, actionType: approvals.actionType, payload: approvals.payload})
          .from(approvals).where(eq(approvals.id, parsed.approvalId)).limit(1);
        if (!candidate) throw new Error("APPROVAL_NOT_FOUND");
        if (candidate.status !== "pending") throw new Error("APPROVAL_ALREADY_DECIDED");
        if (!reviewApprovalPayload(candidate.actionType, candidate.payload).actionable) throw new Error("APPROVAL_UNSUPPORTED");

        const decidedAt = new Date();
        const [decision] = await transaction.update(approvals).set({status: parsed.decision, decidedByProfileId: actor.profileId, decidedAt})
          .where(and(eq(approvals.id, parsed.approvalId), eq(approvals.status, "pending")))
          .returning({id: approvals.id, status: approvals.status, decidedAt: approvals.decidedAt});
        if (!decision) {
          const existing = await transaction.select({id: approvals.id}).from(approvals).where(eq(approvals.id, parsed.approvalId)).limit(1);
          throw new Error(existing.length === 0 ? "APPROVAL_NOT_FOUND" : "APPROVAL_ALREADY_DECIDED");
        }
        if (!decision.decidedAt || (decision.status !== "approved" && decision.status !== "rejected")) throw new Error("APPROVAL_DECISION_INVALID");
        await transaction.insert(auditEvents).values({actorUserId: actor.profileId, actorType: actor.kind, action: `approval.${parsed.decision}`, targetType: "approval", targetId: decision.id, metadata: {decision: parsed.decision}});
        return {id: decision.id, status: decision.status, decidedAt: decision.decidedAt};
      });
    },
  };
}

export function createApprovalExpiryRepository(
  loadDatabase: AutomationDatabaseLoader = defaultAutomationDatabaseLoader,
): ApprovalExpiryRepository {
  return {
    async expirePendingBatch(actor, input) {
      requireAutomationSystem(actor);
      const parsed = approvalExpiryInputSchema.parse(input);
      const cutoff = new Date(parsed.asOf.getTime() - 72 * 3_600_000);
      if (!Number.isFinite(cutoff.getTime())) {
        throw new Error("INVALID_APPROVAL_EXPIRY_AS_OF");
      }
      const database = await loadDatabase();
      return database.transaction(async (transaction) => {
        const rows = resultRows(await transaction.execute(sql`
          WITH candidate_approvals AS MATERIALIZED (
            SELECT ${approvals.id}, ${approvals.requestedByProfileId}
            FROM ${approvals}
            WHERE ${approvals.status} = 'pending'
              AND ${approvals.requestedAt} <= ${cutoff}
            ORDER BY
              ${approvals.requestedByProfileId} IS NULL,
              ${approvals.requestedAt},
              ${approvals.id}
            LIMIT ${parsed.limit}
            FOR UPDATE SKIP LOCKED
          ),
          expired_approvals AS (
            UPDATE ${approvals} AS approval
            SET
              status = 'expired',
              decided_by_profile_id = NULL,
              decided_at = ${parsed.asOf}
            FROM candidate_approvals
            WHERE approval.id = candidate_approvals.id
              AND approval.status = 'pending'
              AND candidate_approvals.requested_by_profile_id IS NOT NULL
            RETURNING approval.id, approval.requested_by_profile_id
          ),
          audit_rows AS (
            INSERT INTO ${auditEvents}
              (
                actor_user_id,
                actor_type,
                action,
                target_type,
                target_id,
                request_id,
                metadata
              )
            SELECT
              NULL,
              'system',
              'approval.expired',
              'approval',
              expired_approvals.id::text,
              'approval-expiry:' || expired_approvals.id::text,
              jsonb_build_object('reason', 'pending_timeout')
            FROM expired_approvals
            RETURNING id
          ),
          task_rows AS (
            INSERT INTO ${staffTasks}
              (
                profile_id,
                journey_state_id,
                kind,
                dedupe_key,
                summary_code,
                status
              )
            SELECT
              expired_approvals.requested_by_profile_id,
              NULL,
              'approval_expired',
              'approval-expiry:' || expired_approvals.id::text,
              'approval_expired',
              'open'
            FROM expired_approvals
            WHERE expired_approvals.requested_by_profile_id IS NOT NULL
            ON CONFLICT DO NOTHING
            RETURNING id
          )
          SELECT
            (SELECT count(*)::int FROM expired_approvals) AS expired_count,
            (SELECT count(*)::int FROM audit_rows) AS audit_count,
            (SELECT count(*)::int FROM task_rows) AS task_count,
            (
              SELECT count(*)::int
              FROM candidate_approvals
              WHERE requested_by_profile_id IS NULL
            ) AS missing_requester_count
        `));
        const row = approvalExpiryResultSchema.parse(rows[0]);
        return {
          expired: row.expired_count,
          auditsCreated: row.audit_count,
          tasksCreated: row.task_count,
          missingRequesterProfiles: row.missing_requester_count,
        };
      });
    },
  };
}

export const approvalsRepository = createApprovalsRepository();
export const approvalExpiryRepository = createApprovalExpiryRepository();
