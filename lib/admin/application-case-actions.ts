"use server";
import { revalidatePath } from "next/cache";
import { requireAdminActor } from "@/lib/auth/actor";
import { updateApplicationCase } from "@/lib/admin/application-case-service";
import { applicationCasePatchSchema } from "@/lib/admin/application-case-types";
import { localizedPath } from "@/lib/urls";
import type { AppLocale } from "@/i18n/routing";
export type ApplicationCaseState = Readonly<{
    status: "idle" | "saved" | "conflict" | "error";
    version?: string;
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
    const parsed = applicationCasePatchSchema.safeParse({ expectedVersion: formData.get("expectedVersion"), ownerProfileId: formData.get("ownerProfileId") || null, dueAt: date?.toISOString() ?? null, missingFields: formData.getAll("missingFields"), nextActionCode: formData.get("nextActionCode"), note: formData.get("note") });
    if (!parsed.success)
        return { status: "error" };
    try {
        const result = await updateApplicationCase(actor, id, parsed.data);
        revalidatePath(localizedPath(locale, "/admin/members/queue/" + encodeURIComponent(id)));
        revalidatePath(localizedPath(locale, "/admin/members/queue"));
        return { status: "saved", version: result.version };
    }
    catch (error) {
        return { status: error instanceof Error && error.message === "APPLICATION_CASE_VERSION_CONFLICT" ? "conflict" : "error" };
    }
}
