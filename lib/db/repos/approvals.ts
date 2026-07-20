import "server-only";

import {and, asc, eq} from "drizzle-orm";
import {z} from "zod";

import {requireAdmin} from "@/lib/auth/actor";
import {getDb, type Database} from "@/lib/db/repos/common";
import {approvals, auditEvents} from "@/lib/db/server-schema";
import type {Actor} from "@/lib/membership/lifecycle";

export const approvalDecisionSchema = z.object({
  approvalId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
}).strict();

export type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>;
export type ApprovalPayloadSummary = Readonly<{key: "campaignId" | "template" | "eventId" | "slug" | "membershipId" | "field"; value: string}>;
const supportedPayloadSchemas = {
  "campaign.send": z.object({campaignId: z.string().uuid(), template: z.enum(["renewal-reminder", "member-update"])}).strict(),
  "event.publish": z.object({eventId: z.string().uuid(), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(200)}).strict(),
  "membership.update": z.object({membershipId: z.string().uuid(), field: z.enum(["status", "billingInterval", "cancelAtPeriodEnd"])}).strict(),
} as const;
export type SupportedApprovalActionType = keyof typeof supportedPayloadSchemas;
export type ApprovalPayloadReview = Readonly<{actionType: SupportedApprovalActionType | null; payloadSummary: readonly ApprovalPayloadSummary[]; actionable: boolean}>;
export type PendingApproval = Readonly<{id: string; actionType: SupportedApprovalActionType | null; payloadSummary: readonly ApprovalPayloadSummary[]; actionable: boolean; requestedAt: Date}>;
export type ApprovalDecision = Readonly<{id: string; status: "approved" | "rejected"; decidedAt: Date}>;

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

export type ApprovalsRepository = Readonly<{
  listPending: (actor: Actor) => Promise<readonly PendingApproval[]>;
  decide: (actor: Actor, input: unknown) => Promise<ApprovalDecision>;
}>;
type DatabaseLoader = () => Promise<Database>;

export function createApprovalsRepository(loadDatabase: DatabaseLoader = getDb): ApprovalsRepository {
  return {
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

export const approvalsRepository = createApprovalsRepository();
