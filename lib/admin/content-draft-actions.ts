"use server";
import { z } from "zod";
import { requireAdminActor } from "@/lib/auth/actor";
import { isAuthorizationDenial } from "@/lib/auth/authorization-denial";
import { aiDraftsRepository } from "@/lib/db/repos/ai-drafts";
import {
  prepareContentDraft,
  adoptContentDraft,
  contentCaseId,
} from "@/lib/ai/content-drafts";
function failure(error: unknown) {
  if (isAuthorizationDenial(error)) return { status: "forbidden" as const };
  const code = error instanceof Error ? error.message : "";
  if (code === "DRAFT_GENERATION_DISABLED")
    return { status: "disabled" as const };
  if (code === "DRAFT_GENERATION_UNKNOWN_EFFECT")
    return { status: "unknown" as const };
  if (code === "DRAFT_GENERATION_BUSY") return { status: "busy" as const };
  if (/STALE|VERSION_CONFLICT|NOT_APPROVED/.test(code))
    return { status: "stale" as const };
  if (/AGENT_|CONFIGURATION|FACT_READER/.test(code))
    return { status: "configuration" as const };
  return { status: "unavailable" as const };
}
const target = z
  .object({
    kind: z.enum(["event", "news"]),
    id: z.string().uuid(),
    locale: z.enum(["en", "zh-HK"]),
  })
  .strict();
export async function prepareContentDraftAction(input: unknown) {
  try {
    const actor = await requireAdminActor();
    const value = target.safeParse(input);
    if (!value.success) return { status: "invalid" as const };
    const sourceFacts = await aiDraftsRepository.getFacts(actor, {
      kind: "content",
      caseId: contentCaseId(value.data.kind, value.data.id, value.data.locale),
    });
    const draft = await prepareContentDraft(actor, {
      kind: value.data.kind,
      sourceFacts,
    });
    return {
      status: "created" as const,
      draftId: draft.id,
      version: draft.version,
    };
  } catch (error) {
    return failure(error);
  }
}
export async function adoptContentDraftAction(
  input: unknown,
  approval: unknown,
) {
  try {
    const actor = await requireAdminActor();
    const value = target.safeParse(input);
    if (!value.success) return { status: "invalid" as const };
    if (
      process.env.ADMIN_AI_DRAFTS_ENABLED !== "true" ||
      process.env.ADMIN_AI_CONTENT_DRAFTS_ENABLED !== "true"
    )
      return { status: "disabled" as const };
    const result = await adoptContentDraft(
      actor,
      value.data.kind,
      value.data.id,
      value.data.locale,
      approval,
    );
    if (
      result.status !== "adopted" ||
      result.value.locale !== value.data.locale
    )
      return { status: "stale" as const };
    return {
      status: "adopted" as const,
      body: result.value.body,
      locale: result.value.locale,
    };
  } catch (error) {
    return failure(error);
  }
}
