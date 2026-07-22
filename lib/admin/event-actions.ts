"use server";

import {revalidatePath} from "next/cache";
import {notFound} from "next/navigation";

import {runCheckInAction, runEventFormAction, type EventActionState} from "@/lib/admin/event-action-core";
import {eventFormInput} from "@/lib/admin/event-form-input";
import {checkInAttendee} from "@/lib/admin/events";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {requireAdminActor} from "@/lib/auth/actor";
import {createEvent, updateEvent} from "@/lib/db/repos/events";

export type EventFormActionMessages = Readonly<{successMessage: string; validationMessage: string; errorMessage: string}>;
export type CheckInActionMessages = Readonly<{successMessage: string; errorMessage: string}>;

export async function createEventAction(path: string, messages: EventFormActionMessages, state: EventActionState, formData: FormData): Promise<EventActionState> {
  try {
    return await runEventFormAction(state, formData, {...messages, mutate: async (data) => {
      await createEvent(await requireAdminActor(), eventFormInput(data));
      revalidatePath(path);
    }});
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}

export async function updateEventAction(eventId: string, path: string, messages: EventFormActionMessages, state: EventActionState, formData: FormData): Promise<EventActionState> {
  try {
    return await runEventFormAction(state, formData, {...messages, mutate: async (data) => {
      const updated = await updateEvent(await requireAdminActor(), eventId, eventFormInput(data));
      if (!updated) throw new Error("EVENT_NOT_FOUND");
      revalidatePath(path);
    }});
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}

export async function checkInEventAttendeeAction(eventId: string, path: string, messages: CheckInActionMessages, state: EventActionState, formData: FormData): Promise<EventActionState> {
  try {
    return await runCheckInAction(state, formData, {...messages, mutate: async (data) => {
      await checkInAttendee(await requireAdminActor(), {eventId, profileId: data.get("profileId")});
      revalidatePath(path);
    }});
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}