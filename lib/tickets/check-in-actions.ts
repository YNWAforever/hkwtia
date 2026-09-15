"use server";

import {z} from "zod";

import {runSeatCheckInAction, type EventActionState} from "@/lib/admin/event-action-core";
import {requireAdminActor} from "@/lib/auth/actor";
import {ticketCheckInRepository} from "@/lib/db/repos/ticket-check-in";

export type SeatCheckInState = EventActionState;

const seatInput = z.object({seatId: z.string().uuid()}).strict();
const messages = {
  successMessage: "Checked in.",
  successMessageAlready: "Already checked in.",
  successMessageUndone: "Check-in undone.",
  notAdmissibleMessage: "This seat is not admissible.",
  errorMessage: "Could not update this seat.",
} as const;

/** The token is deliberately NOT re-verified here: the caller is a staff member
 *  whose session was already checked, and the seat's own admissibility is
 *  decided inside the repository under the row lock. */
export async function submitSeatCheckInAction(previous: SeatCheckInState, formData: FormData): Promise<SeatCheckInState> {
  return runSeatCheckInAction(previous, formData, {
    ...messages,
    mutate: async (data) => {
      const input = seatInput.parse({seatId: data.get("seatId")});
      const actor = await requireAdminActor();
      const result = await ticketCheckInRepository.checkInSeat(actor, input);
      return result.disposition;
    },
  });
}

export async function submitSeatUndoAction(previous: SeatCheckInState, formData: FormData): Promise<SeatCheckInState> {
  return runSeatCheckInAction(previous, formData, {
    ...messages,
    mutate: async (data) => {
      const input = seatInput.parse({seatId: data.get("seatId")});
      const actor = await requireAdminActor();
      const result = await ticketCheckInRepository.undoSeatCheckIn(actor, input);
      return result.disposition;
    },
  });
}
