"use server";

import {revalidatePath} from "next/cache";
import {notFound} from "next/navigation";
import {z} from "zod";

import {runCheckInAction, runEventFormAction, type EventActionState} from "@/lib/admin/event-action-core";
import {eventFormInput} from "@/lib/admin/event-form-input";
import {checkInAttendee} from "@/lib/admin/events";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {requireAdminActor} from "@/lib/auth/actor";
import {sendSeatPass, ticketProcessorDependencies} from "@/lib/billing/ticket-webhook-processor";
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

/**
 * Sends one seat's pass again. The webhook keys each pass on the settlement
 * instant, so a redelivery is a no-op — which also means re-using that key here
 * would let the transport swallow a deliberate resend and report it as sent. The
 * fresh attempt key is what makes the resend actually send.
 *
 * The attempt key is a random uuid rather than a clock reading: two presses in
 * one millisecond are two deliberate sends, and a wall-clock key would collapse
 * them at the provider into one — the same silent swallow the fresh key exists
 * to prevent.
 */
export async function resendPassAction(seatId: string, path: string, messages: CheckInActionMessages, state: EventActionState, formData: FormData): Promise<EventActionState> {
  try {
    return await runCheckInAction(state, formData, {...messages, mutate: async (data) => {
      await requireAdminActor();
      const fromForm = data.get("seatId");
      const parsed = z.object({seatId: z.string().uuid()}).strict().parse({seatId: typeof fromForm === "string" && fromForm.length > 0 ? fromForm : seatId});
      const outcome = await sendSeatPass(ticketProcessorDependencies(), {seatId: parsed.seatId, attemptKey: `resend:${crypto.randomUUID()}`});
      // A staff-initiated send is honest: a refunded seat and a refused
      // transport both resolve to the failure message rather than to "sent".
      if (outcome !== "sent") throw new Error(outcome === "not_admissible" ? "PASS_NOT_ADMISSIBLE" : "PASS_UNDELIVERABLE");
      // Only a send that actually left revalidates the row it belongs to.
      revalidatePath(path);
    }});
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}