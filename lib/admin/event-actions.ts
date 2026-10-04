"use server";

import {revalidatePath} from "next/cache";
import {notFound} from "next/navigation";
import {z} from "zod";

import {runCancelEventAction, runCheckInAction, runEventFormAction, runMemberCheckInAction, runGuestCheckInAction, type GuestCheckInMessages, type CancelEventMessages, type EventActionState, type MemberCheckInMessages} from "@/lib/admin/event-action-core";
import {eventFormInput} from "@/lib/admin/event-form-input";
import {checkInAttendee} from "@/lib/admin/events";
import {checkInGuest} from "@/lib/admin/guest-check-in";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {requireAdminActor} from "@/lib/auth/actor";
import {resendStaffPass} from "@/lib/admin/ticket-resend";
import {cancelEvent, cancellationPreview, createEvent, updateEvent} from "@/lib/db/repos/events";

export type EventFormActionMessages = Readonly<{successMessage: string; validationMessage: string; errorMessage: string; conflictMessage: string}>;
export type CheckInActionMessages = Readonly<{successMessage: string; errorMessage: string; queuedMessage?: string; uncertainMessage?: string}>;

export async function createEventAction(path: string, messages: EventFormActionMessages, state: EventActionState, formData: FormData): Promise<EventActionState> {
  try {
    const actor = await requireAdminActor();
    return await runEventFormAction(state, formData, {...messages, mutate: async (data) => {
      await createEvent(actor, eventFormInput(data));
      revalidatePath(path);
    }});
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}

export async function updateEventAction(eventId: string, path: string, messages: EventFormActionMessages, state: EventActionState, formData: FormData): Promise<EventActionState> {
  try {
    const actor = await requireAdminActor();
    return await runEventFormAction(state, formData, {...messages, mutate: async (data) => {
      const revision = new Date(z.string().datetime().parse(data.get("expectedUpdatedAt")));
      const updated = await updateEvent(actor, eventId, eventFormInput(data), undefined, revision);
      if (!updated) throw new Error("EVENT_NOT_FOUND");
      revalidatePath(path);
      return {revision: updated.updatedAt.toISOString()};
    }});
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}

/**
 * D-4d: the irreversible transition. Like its siblings it resolves its own actor
 * from the session and is bound to the event path by the page; `cancelled` is
 * terminal, so this is the one write whose confirmation the page prices first.
 */
export async function cancelEventAction(eventId: string, path: string, messages: CancelEventMessages, state: EventActionState, formData: FormData): Promise<EventActionState> {
  try {
    return await runCancelEventAction(state, formData, {...messages, mutate: async () => {
      const actor = await requireAdminActor();
      // The page can render while the preview read is unavailable. A direct
      // Server Action call must observe the same fail-closed condition.
      if (await cancellationPreview(actor, eventId) === null) throw new Error("CANCELLATION_PREVIEW_UNAVAILABLE");
      const outcome = await cancelEvent(actor, eventId);
      if (outcome.status === "cancelled") {
        // A cancelled event leaves the public listing it was published in, so both
        // locales' listings and detail pages drop their cache alongside the admin
        // page. These are internal app-router paths, where `/zh-HK/…` is correct.
        revalidatePath(path);
        revalidatePath("/en/events");
        revalidatePath("/zh-HK/events");
        revalidatePath(`/en/events/${outcome.event.slug}`);
        revalidatePath(`/zh-HK/events/${outcome.event.slug}`);
      }
      return outcome;
    }});
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}

export async function checkInEventAttendeeAction(eventId: string, path: string, messages: MemberCheckInMessages, state: EventActionState, formData: FormData): Promise<EventActionState> {
  try {
    return await runMemberCheckInAction(state, formData, {...messages, mutate: async (data) => {
      const outcome = await checkInAttendee(await requireAdminActor(), {eventId, profileId: data.get("profileId")});
      // A cancelled event's refusal wrote nothing, so there is nothing to
      // revalidate; a real check-in re-renders the row as attended.
      if (outcome.disposition !== "event_cancelled") revalidatePath(path);
      return outcome;
    }});
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}

export async function checkInEventGuestAction(eventId: string, path: string, messages: GuestCheckInMessages, state: EventActionState, formData: FormData): Promise<EventActionState> {
  try {
    return await runGuestCheckInAction(state, formData, {...messages, mutate: async (data) => {
      const registrationId = z.string().uuid().parse(data.get("registrationId"));
      const outcome = await checkInGuest(await requireAdminActor(), {eventId, registrationId});
      if (outcome === "checked_in") revalidatePath(path);
      return outcome;
    }});
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}

/** Staff authority and stable intent are checked before the existing outbox is drained. */
export async function resendPassAction(seatId: string, path: string, messages: CheckInActionMessages, _state: EventActionState, formData: FormData): Promise<EventActionState> {
  try {
    const actor = await requireAdminActor();
    const input = z.object({seatId: z.string().uuid(), attemptId: z.string().uuid()}).strict().parse({seatId, attemptId: formData.get("attemptId")});
    const outcome = await resendStaffPass(actor, input.seatId, input.attemptId);
    revalidatePath(path);
    if (outcome?.status === "sent") return {status: "success", message: messages.successMessage, values: {attemptId: input.attemptId}};
    if (outcome?.status === "uncertain") return {status: "error", message: messages.uncertainMessage ?? messages.errorMessage};
    if (outcome?.status === "queued" || outcome?.status === "pending") return {status: "success", message: messages.queuedMessage ?? messages.errorMessage};
    return {status: "error", message: messages.errorMessage};
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    return {status: "error", message: messages.errorMessage};
  }
}
