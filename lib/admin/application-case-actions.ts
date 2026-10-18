"use server";
import { revalidatePath } from "next/cache";
import { requireAdminActor } from "@/lib/auth/actor";
import { z } from "zod";
import { getApplicationCaseSaveResult, updateApplicationCase } from "@/lib/admin/application-case-service";
import { applicationCasePatchSchema } from "@/lib/admin/application-case-types";
import { localizedPath } from "@/lib/urls";
import type { AppLocale } from "@/i18n/routing";
export type ApplicationCaseState = Readonly<{
    status: "idle" | "saved" | "conflict" | "error" | "unknown";
    version?: string;
    requestId?: string;
    refreshRequired?: boolean;
}>;
export async function updateApplicationCaseAction(id: string, locale: AppLocale, _previous: ApplicationCaseState, formData: FormData): Promise<ApplicationCaseState> {
    const actor = await requireAdminActor();
    const due = formData.get("dueAt");
    if (typeof due !== "string" || (due !== "" && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(due)))
        return { status: "error" };
    const date = due ? new Date(due + ":00+08:00") : null;
    if (date && !Number.isFinite(date.getTime()))
        return { status: "error" };
    if (date && new Date(date.getTime()+8*60*60*1000).toISOString().slice(0,16)!==due)
        return {status:"error"};
    const parsed = applicationCasePatchSchema.safeParse({ expectedVersion: formData.get("expectedVersion"), requestId: formData.get("requestId") ?? undefined, ownerProfileId: formData.get("ownerProfileId") || null, dueAt: date?.toISOString() ?? null, missingFields: formData.getAll("missingFields"), nextActionCode: formData.get("nextActionCode"), note: formData.get("note") });
    if (!parsed.success)
        return { status: "error" };
    const requestId = parsed.data.requestId;
    let result: { version: string };
    try {
        result = await updateApplicationCase(actor, id, parsed.data);
    }
    catch (error) {
        if (error instanceof Error && error.message === "APPLICATION_CASE_VERSION_CONFLICT")
            return { status: "conflict", requestId };
        if (error instanceof Error && ["APPLICATION_CASE_REQUEST_MISMATCH", "APPLICATION_CASE_OWNER_INVALID", "APPLICATION_NOT_FOUND"].includes(error.message))
            return { status: "error", requestId };
        // A lost commit acknowledgement does not prove rollback. Never retry a write here.
        if (requestId) {
            try {
                const receipt = await getApplicationCaseSaveResult(actor, id, requestId);
                if (receipt) return { status: "saved", ...receipt, requestId, refreshRequired: true };
            } catch { /* An unavailable readback leaves the outcome unresolved. */ }
        }
        return { status: "unknown", requestId };
    }
    try {
        revalidatePath(localizedPath(locale, "/admin/members/queue/" + encodeURIComponent(id)));
        revalidatePath(localizedPath(locale, "/admin/members/queue"));
    }
    catch {
        return { status: "saved", version: result.version, requestId, refreshRequired: true };
    }
    return { status: "saved", version: result.version, requestId };
}

export async function checkApplicationCaseSaveAction(id: string, requestId: string): Promise<ApplicationCaseState> {
    const actor = await requireAdminActor();
    if (!z.string().uuid().safeParse(requestId).success) return { status: "unknown" };
    try {
        const receipt = await getApplicationCaseSaveResult(actor, id, requestId);
        return receipt ? { status: "saved", ...receipt, requestId, refreshRequired: true } : { status: "unknown", requestId };
    } catch {
        return { status: "unknown", requestId };
    }
}
