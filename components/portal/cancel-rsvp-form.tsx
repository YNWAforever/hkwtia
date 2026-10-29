"use client";

import {useActionState} from "react";

import type {MemberCancelState} from "@/lib/events/member-cancel-action";

const initial: MemberCancelState = {};

export function CancelRsvpForm({action, eventId, locale, label, pendingLabel, statusLabel}: Readonly<{
  action: (state: MemberCancelState, formData: FormData) => Promise<MemberCancelState>;
  eventId: string;
  locale: string;
  label: string;
  pendingLabel: string;
  statusLabel?: string;
}>) {
  const [state, formAction, pending] = useActionState(action, initial);
  if (state.code === "cancelled" || state.code === "already_cancelled") {
    return <p aria-live="polite" className="portal-status-note" role="status">{state.message}</p>;
  }
  return <>
    {statusLabel ? <p className="portal-status-note" role="status">{statusLabel}</p> : null}
    <form action={formAction} className="portal-cancel-rsvp-form">
      <input name="eventId" type="hidden" value={eventId}/>
      <input name="locale" type="hidden" value={locale}/>
      <button className="text-link" disabled={pending} type="submit">{pending ? pendingLabel : label}</button>
    </form>
    {state.message ? <p className="portal-form-alert" role="alert">{state.message}</p> : null}
  </>;
}
