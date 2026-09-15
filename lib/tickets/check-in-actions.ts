"use server";

import {revalidatePath} from "next/cache";
import {z} from "zod";

import {runSeatCheckInAction, type EventActionState, type SeatCheckInMessages} from "@/lib/admin/event-action-core";
import {requireAdminActor} from "@/lib/auth/actor";
import {ticketCheckInRepository} from "@/lib/db/repos/ticket-check-in";

export type SeatCheckInState = EventActionState;

const seatInput = z.object({seatId: z.string().uuid()}).strict();

/** Revalidation covers the scanner's own page and the staff event door list, so
 *  a successful check-in flips the button to Undo and updates the list behind
 *  it. Both paths are bound by the page, exactly like the events-mgmt actions. */
function revalidateSeat(checkInPath: string, eventPath: string): void {
  revalidatePath(checkInPath);
  revalidatePath(eventPath);
}

/** The token is deliberately NOT re-verified here: the caller is a staff member
 *  whose session was already checked, and the seat's own admissibility is
 *  decided inside the repository under the row lock. */
export async function submitSeatCheckInAction(checkInPath: string, eventPath: string, messages: SeatCheckInMessages, previous: SeatCheckInState, formData: FormData): Promise<SeatCheckInState> {
  return runSeatCheckInAction(previous, formData, {
    ...messages,
    mutate: async (data) => {
      const input = seatInput.parse({seatId: data.get("seatId")});
      const actor = await requireAdminActor();
      const result = await ticketCheckInRepository.checkInSeat(actor, input);
      // A refusal changes nothing, so there is nothing to revalidate.
      if (result.disposition !== "not_admissible") revalidateSeat(checkInPath, eventPath);
      return result.disposition;
    },
  });
}

export async function submitSeatUndoAction(checkInPath: string, eventPath: string, messages: SeatCheckInMessages, previous: SeatCheckInState, formData: FormData): Promise<SeatCheckInState> {
  return runSeatCheckInAction(previous, formData, {
    ...messages,
    mutate: async (data) => {
      const input = seatInput.parse({seatId: data.get("seatId")});
      const actor = await requireAdminActor();
      const result = await ticketCheckInRepository.undoSeatCheckIn(actor, input);
      revalidateSeat(checkInPath, eventPath);
      return result.disposition;
    },
  });
}
