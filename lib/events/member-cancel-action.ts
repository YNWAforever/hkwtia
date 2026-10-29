"use server";

import {revalidatePath} from "next/cache";
import {getTranslations} from "next-intl/server";

import {requireActor} from "@/lib/auth/actor";
import {cancelOwnEventRegistration} from "@/lib/db/repos/events";

export type MemberCancelState = Readonly<{code?: "cancelled" | "already_cancelled" | "not_registered" | "not_cancellable" | "error"; message?: string}>;

/**
 * Signed-in member cancels their own RSVP. The actor comes from the session.
 * This module exports no actor-taking function.
 */
export async function cancelOwnRsvpAction(_state: MemberCancelState, formData: FormData): Promise<MemberCancelState> {
  const locale = formData.get("locale") === "zh-HK" ? "zh-HK" : "en";
  const t = await getTranslations({locale, namespace: "Portal"});
  try {
    const actor = await requireActor();
    const result = await cancelOwnEventRegistration(actor, {eventId: formData.get("eventId")});
    revalidatePath(`/${locale}/portal/events/my`);
    revalidatePath(`/${locale}/portal/events`);
    revalidatePath(`/${locale}/events`, "layout");
    return {code: result.disposition, message: t(`myEvents.cancelResult.${result.disposition}`)};
  } catch (error) {
    console.error("member-rsvp-cancel", error instanceof Error ? error.name : "unknown");
    return {code: "error", message: t("myEvents.cancelResult.error")};
  }
}
