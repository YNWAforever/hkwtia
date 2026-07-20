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
export type PendingApproval = Readonly<{
  id: string;
  actionType: string;
  payloadSummary: readonly ApprovalPayloadSummary[];
  requestedAt: Date;
}>;
export type ApprovalDecision = Readonly<{id: string; status: "approved" | "rejected"; decidedAt: Date}>;

const summaryAllowlist = {
  "campaign.send": ["campaignId", "template"],
  "event.publish": ["eventId", "slug"],
  "membership.update": ["membershipId", "field"],
} as const satisfies Readonly<Record<string, readonly ApprovalPayloadSummary["key"][]>>;

export function summarizeApprovalPayload(actionType: string, payload: Readonly<Record<string, unknown>>): ApprovalPayloadSummary[] {
  const keys = summaryAllowlist[actionType as keyof typeof summaryAllowlist] ?? [];
  return keys.flatMap((key) => {
    const value = payload[key];
    return typeof value === "string" && value.length > 0 && value.length <= 200 ? [{key, value}] : [];
  });
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
      const rows = await db.select({
        id: approvals.id,
        actionType: approvals.actionType,
        payload: approvals.payload,
        requestedAt: approvals.requestedAt,
      }).from(approvals).where(eq(approvals.status, "pending")).orderBy(asc(approvals.requestedAt), asc(approvals.id));
      return rows.map(({payload, ...row}) => ({...row, payloadSummary: summarizeApprovalPayload(row.actionType, payload)}));
    },

    async decide(actor, input) {
      requireAdmin(actor);
      const parsed = approvalDecisionSchema.parse(input);
      const db = await loadDatabase();
      return db.transaction(async (transaction) => {
        const decidedAt = new Date();
        const [decision] = await transaction.update(approvals).set({
          status: parsed.decision,
          decidedByProfileId: actor.profileId,
          decidedAt,
        }).where(and(eq(approvals.id, parsed.approvalId), eq(approvals.status, "pending"))).returning({
          id: approvals.id,
          status: approvals.status,
          decidedAt: approvals.decidedAt,
        });

        if (!decision) {
          const existing = await transaction.select({id: approvals.id}).from(approvals)
            .where(eq(approvals.id, parsed.approvalId)).limit(1);
          throw new Error(existing.length === 0 ? "APPROVAL_NOT_FOUND" : "APPROVAL_ALREADY_DECIDED");
        }
        if (!decision.decidedAt || (decision.status !== "approved" && decision.status !== "rejected")) {
          throw new Error("APPROVAL_DECISION_INVALID");
        }

        await transaction.insert(auditEvents).values({
          actorUserId: actor.profileId,
          actorType: actor.kind,
          action: `approval.${parsed.decision}`,
          targetType: "approval",
          targetId: decision.id,
          metadata: {decision: parsed.decision},
        });
        return {id: decision.id, status: decision.status, decidedAt: decision.decidedAt};
      });
    },
  };
}

export const approvalsRepository = createApprovalsRepository();
