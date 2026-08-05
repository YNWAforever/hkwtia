"use server";

import {notFound} from "next/navigation";

import {runApprovalDecisionAction, type ApprovalActionMessages, type ApprovalActionState} from "@/lib/admin/approval-action-core";
import {decideApproval} from "@/lib/admin/approvals";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {revalidateAdminPath} from "@/lib/admin/revalidate-path";
import {requireAdminActor} from "@/lib/auth/actor";

export async function decideApprovalAction(path: string, messages: ApprovalActionMessages, state: ApprovalActionState, formData: FormData): Promise<ApprovalActionState> {
  try {
    const actor = await requireAdminActor();
    return await runApprovalDecisionAction(state, formData, {messages, mutate: async (input) => {
      await decideApproval(actor, input);
      revalidateAdminPath(path);
    }});
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}
