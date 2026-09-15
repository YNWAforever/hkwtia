"use client";

import {useActionState} from "react";

import type {SeatCheckInMessages} from "@/lib/admin/event-action-core";
import {submitSeatCheckInAction, submitSeatUndoAction, type SeatCheckInState} from "@/lib/tickets/check-in-actions";

export type CheckInFormLabels = Readonly<{checkIn: string; undo: string; alreadyCheckedIn: string}>;

const initialState: SeatCheckInState = {};

/**
 * The wrappers are imported from the `"use server"` module and bound here. The
 * page therefore crosses the server/client boundary with data only: binding in
 * the page would hand this component a function prop, which is what a plain
 * function cannot be, and only the RSC serializer would notice.
 *
 * The action returns its own message, so a refusal (an order refunded between
 * the scan and the tap) is rendered instead of being discarded, and a success
 * is announced.
 */
export function CheckInForm({seatId, checkedIn, checkInPath, eventPath, messages, labels}: Readonly<{
  seatId: string;
  checkedIn: boolean;
  checkInPath: string;
  eventPath: string;
  messages: SeatCheckInMessages;
  labels: CheckInFormLabels;
}>) {
  const action = checkedIn
    ? submitSeatUndoAction.bind(null, checkInPath, eventPath, messages)
    : submitSeatCheckInAction.bind(null, checkInPath, eventPath, messages);
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form action={formAction} className="space-y-4">
      <input name="seatId" type="hidden" value={seatId}/>
      {checkedIn ? <p className="text-sm text-muted-foreground">{labels.alreadyCheckedIn}</p> : null}
      <button
        className={checkedIn
          ? "min-h-11 rounded-md border px-4"
          : "min-h-11 rounded-md bg-primary px-4 text-primary-foreground"}
        disabled={pending}
        type="submit"
      >
        {checkedIn ? labels.undo : labels.checkIn}
      </button>
      {state.message
        ? <p
            aria-live="polite"
            className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
            role={state.status === "error" ? "alert" : "status"}
          >{state.message}</p>
        : null}
    </form>
  );
}
