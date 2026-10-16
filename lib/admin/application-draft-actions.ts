"use server";
import { revalidatePath } from "next/cache";
import { adoptApplicationDraft } from "@/lib/admin/application-case-service";
import { requireAdminActor } from "@/lib/auth/actor";
import { isAuthorizationDenial } from "@/lib/auth/authorization-denial";
import { prepareApplicationDraft } from "@/lib/ai/application-triage";
import { localizedPath } from "@/lib/urls";
import { z } from "zod";
import type { AppLocale } from "@/i18n/routing";
export type ApplicationDraftState = Readonly<{
  status:
    | "idle"
    | "created"
    | "disabled"
    | "configuration"
    | "busy"
    | "unknown"
    | "stale"
    | "forbidden"
    | "unavailable"
    | "invalid";
  reviewHref?: string;
}>;
export async function prepareApplicationDraftAction(
  id: string,
  locale: AppLocale,
): Promise<ApplicationDraftState> {
  try {
    const actor = await requireAdminActor();
    const parsed = z
      .object({ id: z.string().uuid(), locale: z.enum(["en", "zh-HK"]) })
      .strict()
      .safeParse({ id, locale });
    if (!parsed.success) return { status: "invalid" };
    const draft = await prepareApplicationDraft(actor, parsed.data.id);
    const draftId = z.string().uuid().parse(draft.id);
    return {
      status: draft.state === "stale" ? "stale" : "created",
      reviewHref:
        localizedPath(parsed.data.locale, "/admin/tasks") +
        "?" +
        new URLSearchParams({ draft: draftId }),
    };
  } catch (error) {
    if (isAuthorizationDenial(error)) return { status: "forbidden" };
    const code = error instanceof Error ? error.message : "";
    if (code === "DRAFT_GENERATION_DISABLED") return { status: "disabled" };
    if (
      /^AGENT_(?:ROUTE|MODEL|PROVIDER)_/.test(code) ||
      code === "DRAFT_GENERATION_CONFIGURATION"
    )
      return { status: "configuration" };
    if (code === "DRAFT_GENERATION_UNKNOWN_EFFECT")
      return { status: "unknown" };
    if (code === "DRAFT_GENERATION_BUSY") return { status: "busy" };
    if (code === "DRAFT_GENERATION_STALE") return { status: "stale" };
    return { status: "unavailable" };
  }
}

export type ApplicationAdoptionState = Readonly<{
  status:
    | "idle"
    | "adopted"
    | "disabled"
    | "stale"
    | "forbidden"
    | "invalid"
    | "unavailable";
}>;
export async function adoptApplicationDraftAction(
  id: string,
  locale: AppLocale,
  input: unknown,
): Promise<ApplicationAdoptionState> {
  try {
    const actor = await requireAdminActor();
    const location = z
      .object({ id: z.string().uuid(), locale: z.enum(["en", "zh-HK"]) })
      .strict()
      .safeParse({ id, locale });
    const value = z
      .object({
        draftId: z.string().uuid(),
        expectedVersion: z.number().int().positive(),
        expectedCaseVersion: z.union([z.literal("0"), z.string().uuid()]),
      })
      .strict()
      .safeParse(input);
    if (!location.success || !value.success) return { status: "invalid" };
    if (process.env.ADMIN_AI_DRAFTS_ENABLED !== "true")
      return { status: "disabled" };
    const result = await adoptApplicationDraft(
      actor,
      location.data.id,
      value.data,
    );
    revalidatePath(
      localizedPath(
        location.data.locale,
        "/admin/members/queue/" + location.data.id,
      ),
    );
    return { status: result.status };
  } catch (error) {
    if (isAuthorizationDenial(error)) return { status: "forbidden" };
    if (
      error instanceof Error &&
      [
        "APPLICATION_CASE_VERSION_CONFLICT",
        "AI_DRAFT_VERSION_CONFLICT",
        "AI_DRAFT_NOT_APPROVED",
      ].includes(error.message)
    )
      return { status: "stale" };
    return { status: "unavailable" };
  }
}
