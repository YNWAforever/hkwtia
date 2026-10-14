"use client";
import {useActionState, useEffect} from "react";
import {resumeTicketCheckoutAction, type TicketCheckoutState} from "@/lib/tickets/checkout-actions";

const initial: TicketCheckoutState = {status: "idle"};
export function OrderRecovery({eventId, orderId, labels}: Readonly<{eventId: string; orderId: string; labels: {resume: string; pending: string; unavailable: string; completed: string; expired: string}}>) {
  const [state, dispatch, pending] = useActionState(resumeTicketCheckoutAction, initial);
  useEffect(() => {if (state.status === "redirect") window.location.assign(state.url);}, [state]);
  return <form action={dispatch} className="portal-form">
    <input type="hidden" name="eventId" value={eventId} />
    <input type="hidden" name="orderId" value={orderId} />
    <button type="submit" className="button" disabled={pending}>{pending ? labels.pending : labels.resume}</button>
    {state.status === "error" ? <p role="alert" className="portal-form-alert">{state.code === "ALREADY_COMPLETED" ? labels.completed : state.code === "RETRY_EXPIRED" ? labels.expired : labels.unavailable}</p> : null}
  </form>;
}
