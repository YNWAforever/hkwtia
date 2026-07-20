import "server-only";

import {requireAdmin} from "@/lib/auth/actor";
import {
  approvalDecisionSchema,
  approvalsRepository,
  summarizeApprovalPayload,
  type ApprovalDecision,
  type ApprovalDecisionInput,
  type ApprovalsRepository,
  type PendingApproval,
} from "@/lib/db/repos/approvals";
import type {Actor} from "@/lib/membership/lifecycle";

export type ApprovalRepository = ApprovalsRepository;
export type {ApprovalDecisionInput};
export {approvalDecisionSchema, summarizeApprovalPayload};

export async function listPendingApprovals(actor: Actor, repository: ApprovalRepository = approvalsRepository): Promise<readonly PendingApproval[]> {
  requireAdmin(actor);
  return repository.listPending(actor);
}

export async function decideApproval(actor: Actor, input: ApprovalDecisionInput | unknown, repository: ApprovalRepository = approvalsRepository): Promise<ApprovalDecision> {
  requireAdmin(actor);
  const parsed = approvalDecisionSchema.parse(input);
  return repository.decide(actor, parsed);
}
