"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {ZodError} from "zod";

import type {AppLocale} from "@/i18n/routing";
import {requireActor} from "@/lib/auth/actor";
import {memberEventInputFromFormData} from "@/lib/events/member-contract";
import {saveMemberEvent} from "@/lib/events/member-core";
import {localizedPath} from "@/lib/urls";

// Only formData wrappers are exported here; each resolves its own actor from
// the session. The actor-taking core lives in `member-core.ts`.
export type MemberEventFormState = Readonly<{status: "idle" | "error"; code?: string}>;

// The codes the form has copy for. Anything else (a zod issue, an invalid
// datetime, a driver error) becomes INVALID rather than leaking its message.
const knownCodes = new Set(["NO_MANAGED_COMPANY", "FORBIDDEN"]);

function errorCode(error: unknown): string {
  // The repository reports a bad hero asset as a zod issue whose message is
  // the code, so the id field keeps its place in the form's field errors.
  const code = error instanceof ZodError
    ? (error.issues.find((issue) => issue.message.startsWith("EVENT_"))?.message ?? "INVALID")
    : error instanceof Error ? error.message : "UNKNOWN";
  return code.startsWith("EVENT_") || knownCodes.has(code) ? code : "INVALID";
}

async function run(mode: "draft" | "submit", locale: AppLocale, formData: FormData): Promise<MemberEventFormState> {
  const actor = await requireActor();
  // An empty hidden field means "create"; the edit page posts the row id so
  // the repository updates that row instead of inserting a duplicate slug.
  const eventIdField = formData.get("eventId");
  const eventId = typeof eventIdField === "string" && eventIdField.length > 0 ? eventIdField : undefined;
  try {
    const event = await saveMemberEvent(actor, mode, memberEventInputFromFormData(formData), undefined, eventId);
    // `revalidatePath` takes the internal app-router path, where `/zh-HK/…` is correct.
    revalidatePath(`/${locale}/portal/events`);
    revalidatePath(`/${locale}/portal/events/${event.id}/edit`);
    redirect(`${localizedPath(locale, `/portal/events/${event.id}/edit`)}?saved=${mode}`);
  } catch (error) {
    // `redirect` throws NEXT_REDIRECT; it must reach Next, not the form.
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    return {status: "error", code: errorCode(error)};
  }
}

export async function saveMemberEventDraftAction(locale: AppLocale, _state: MemberEventFormState, formData: FormData): Promise<MemberEventFormState> {
  return run("draft", locale, formData);
}

export async function submitMemberEventAction(locale: AppLocale, _state: MemberEventFormState, formData: FormData): Promise<MemberEventFormState> {
  return run("submit", locale, formData);
}
