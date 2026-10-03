"use server";
import { requireAdminActor } from "@/lib/auth/actor";
import { isAuthorizationDenial } from "@/lib/auth/authorization-denial";
import {
  aiDraftsRepository,
  draftReviewSchema,
  draftEditSchema,
} from "@/lib/db/repos/ai-drafts";
export type DraftActionResult = Readonly<{
  status:
    | "saved"
    | "invalid"
    | "unavailable"
    | "forbidden"
    | "disabled"
    | "configuration"
    | "stale";
}>;
function failure(error: unknown): DraftActionResult {
  if (isAuthorizationDenial(error)) return { status: "forbidden" };
  if (error instanceof Error) {
    if (
      /^AI_DRAFT_(FACT_READER_UNAVAILABLE|CASE_UNAVAILABLE)$/.test(
        error.message,
      )
    )
      return { status: "configuration" };
    if (
      /^AI_DRAFT_(VERSION_CONFLICT|STATE_CONFLICT|MISSING|NOT_APPROVED)$/.test(
        error.message,
      )
    )
      return { status: "invalid" };
  }
  return { status: "unavailable" };
}
export async function reviewAiDraftAction(
  input: unknown,
): Promise<DraftActionResult> {
  try {
    const actor = await requireAdminActor();
    if (process.env.ADMIN_AI_DRAFTS_ENABLED !== "true")
      return { status: "disabled" };
    const parsed = draftReviewSchema.safeParse(input);
    if (!parsed.success) return { status: "invalid" };
    const result = await aiDraftsRepository.reviewDraft(actor, parsed.data);
    return { status: result.status === "reviewed" ? "saved" : result.status };
  } catch (error) {
    return failure(error);
  }
}
export async function editAiDraftAction(
  input: unknown,
): Promise<DraftActionResult> {
  try {
    const actor = await requireAdminActor();
    if (process.env.ADMIN_AI_DRAFTS_ENABLED !== "true")
      return { status: "disabled" };
    const parsed = draftEditSchema.safeParse(input);
    if (!parsed.success) return { status: "invalid" };
    await aiDraftsRepository.editDraft(actor, parsed.data);
    return { status: "saved" };
  } catch (error) {
    return failure(error);
  }
}
