"use server";

import {revalidatePath} from "next/cache";

import {approveMemberEvent, rejectMemberEvent} from "@/lib/admin/event-review-core";
import {revalidateAdminPath} from "@/lib/admin/revalidate-path";
import {requireAdminActor} from "@/lib/auth/actor";

// Every export here is an HTTP-callable endpoint, so each one must resolve its
// own actor from the session. The actor-taking cores live in
// lib/admin/event-review-core.ts precisely so they cannot be dispatched directly.

/**
 * An approval publishes the event, so both public listings must drop their
 * cache. `revalidatePath` takes the internal app-router path, where `/zh-HK/…`
 * is correct (unlike an href, which goes through `localizedPath`).
 */
function afterReview(path: string): void {
  revalidateAdminPath(path);
  revalidatePath("/en/events");
  revalidatePath("/zh-HK/events");
}

export async function approveMemberEventAction(path: string, formData: FormData): Promise<void> {
  const actor = await requireAdminActor();
  await approveMemberEvent(actor, formData.get("eventId"));
  afterReview(path);
}

export async function rejectMemberEventAction(path: string, formData: FormData): Promise<void> {
  const actor = await requireAdminActor();
  await rejectMemberEvent(actor, formData.get("eventId"), formData.get("rejectionReason"));
  afterReview(path);
}
