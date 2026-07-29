import "server-only";

import {requireAdmin} from "@/lib/auth/actor";
import {
  approvalDecisionSchema,
  approvalsRepository,
  reviewApprovalPayload,
  summarizeApprovalPayload,
  type ApprovalDecision,
  type ApprovalDecisionInput,
  type ApprovalPayloadReview,
  type ApprovalsRepository,
  type PendingApproval,
  type SupportedApprovalActionType,
} from "@/lib/db/repos/approvals";
import type {Actor} from "@/lib/membership/lifecycle";

export type RetentionReasonCode = "low_score_declining" | "inactive_before_renewal";
export type RetentionApprovalPreview = Readonly<{
  locale: "en" | "zh-HK";
  reasonCodes: readonly RetentionReasonCode[];
  subject: string;
  body: string;
}>;
export type AdminPendingApproval = PendingApproval & Readonly<{
  retentionPreview?: RetentionApprovalPreview;
}>;
export type ApprovalRepository = ApprovalsRepository;
export type {ApprovalDecisionInput, ApprovalPayloadReview, PendingApproval, SupportedApprovalActionType};
export {approvalDecisionSchema, reviewApprovalPayload, summarizeApprovalPayload};

const RETENTION_REASON_CODES = new Set<RetentionReasonCode>([
  "low_score_declining",
  "inactive_before_renewal",
]);

function retentionPreview(approval: PendingApproval): RetentionApprovalPreview | null {
  const values = new Map(approval.payloadSummary.map((item) => [item.key, item.value]));
  const locale = values.get("locale");
  const subject = values.get("subject");
  const body = values.get("body");
  const reasonCodes = values.get("reasonCodes")?.split(",") ?? [];
  if (
    (locale !== "en" && locale !== "zh-HK")
    || !subject
    || !body
    || reasonCodes.length === 0
    || !reasonCodes.every((code): code is RetentionReasonCode =>
      RETENTION_REASON_CODES.has(code as RetentionReasonCode))
  ) {
    return null;
  }
  return {locale, subject, body, reasonCodes};
}

function toAdminPendingApproval(approval: PendingApproval): AdminPendingApproval {
  if (approval.actionType !== "agent.retention_outreach") return approval;
  const preview = retentionPreview(approval);
  return {
    ...approval,
    payloadSummary: [],
    actionable: approval.actionable && preview !== null,
    ...(preview ? {retentionPreview: preview} : {}),
  };
}

export async function listPendingApprovals(actor: Actor, repository: ApprovalRepository = approvalsRepository): Promise<readonly AdminPendingApproval[]> {
  requireAdmin(actor);
  return (await repository.listPending(actor)).map(toAdminPendingApproval);
}

export async function decideApproval(actor: Actor, input: ApprovalDecisionInput | unknown, repository: ApprovalRepository = approvalsRepository): Promise<ApprovalDecision> {
  requireAdmin(actor);
  const parsed = approvalDecisionSchema.parse(input);
  return repository.decide(actor, parsed);
}
