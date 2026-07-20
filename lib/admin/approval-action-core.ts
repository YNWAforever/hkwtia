import {approvalDecisionSchema, type ApprovalDecisionInput} from "@/lib/admin/approvals";

export type ApprovalActionState = Readonly<{status?: "success" | "error"; message?: string}>;
export type ApprovalActionMessages = Readonly<{
  success: string;
  validation: string;
  alreadyDecided: string;
  notFound: string;
  error: string;
}>;

type Options = Readonly<{
  messages: ApprovalActionMessages;
  mutate: (input: ApprovalDecisionInput) => Promise<unknown>;
}>;

export async function runApprovalDecisionAction(_state: ApprovalActionState, formData: FormData, options: Options): Promise<ApprovalActionState> {
  const parsed = approvalDecisionSchema.safeParse({approvalId: formData.get("approvalId"), decision: formData.get("decision")});
  if (!parsed.success) return {status: "error", message: options.messages.validation};
  try {
    await options.mutate(parsed.data);
    return {status: "success", message: options.messages.success};
  } catch (error) {
    if (error instanceof Error && error.message === "APPROVAL_ALREADY_DECIDED") return {status: "error", message: options.messages.alreadyDecided};
    if (error instanceof Error && error.message === "APPROVAL_NOT_FOUND") return {status: "error", message: options.messages.notFound};
    return {status: "error", message: options.messages.error};
  }
}
