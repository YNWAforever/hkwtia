"use client";

import {PrivateLink as Link} from "@/components/internal-shell/private-link";
import {useActionState} from "react";

import {CancelRsvpForm} from "@/components/portal/cancel-rsvp-form";
import type {MemberCancelState} from "@/lib/events/member-cancel-action";
import type {RegistrationActionMessages, RegistrationActionState} from "@/lib/events/registration-state";

const initialState: RegistrationActionState = {};

export function EventRegistrationForm({action, eventId, links, registerLabel, pendingLabel, initialStatus, statusLabel, cancelAction, cancelLabel, cancelPendingLabel, locale}: Readonly<{
  action: (state: RegistrationActionState, formData: FormData) => Promise<RegistrationActionState>;
  eventId: string;
  registerLabel: string;
  pendingLabel: string;
  messages: RegistrationActionMessages;
  initialStatus?: "registered" | "waitlist" | "cancelled" | "attended" | "no_show";
  statusLabel?: string;
  links?: Readonly<{unauthenticated: string; ineligible: string}>;
  cancelAction?: (state: MemberCancelState, formData: FormData) => Promise<MemberCancelState>;
  cancelLabel?: string;
  cancelPendingLabel?: string;
  locale?: string;
}>) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const stored = initialStatus && initialStatus !== "cancelled";
  const completed = ["registered", "waitlist", "already_registered", "already_waitlisted"].includes(state.code ?? "");
  const canCancel = Boolean(cancelAction && cancelLabel && cancelPendingLabel && locale) && (
    initialStatus === "registered" || initialStatus === "waitlist"
    || state.code === "registered" || state.code === "waitlist"
    || state.code === "already_registered" || state.code === "already_waitlisted"
  );
  if ((stored || completed) && canCancel && cancelAction && cancelLabel && cancelPendingLabel && locale) {
    return <CancelRsvpForm action={cancelAction} eventId={eventId} label={cancelLabel} locale={locale} pendingLabel={cancelPendingLabel} statusLabel={stored ? statusLabel : state.message}/>;
  }
  if (stored || completed) return <p aria-live="polite" className="portal-status-note" role="status">{stored ? statusLabel : state.message}</p>;
  const recovery = state.code === "unauthenticated" ? links?.unauthenticated : state.code === "ineligible" ? links?.ineligible : undefined;
  return <form action={formAction} className="portal-registration-form"><input name="eventId" type="hidden" value={eventId}/><button className="button" disabled={pending} type="submit">{pending ? pendingLabel : registerLabel}</button>{state.message ? <p aria-live="polite" className={state.code === "error" ? "portal-form-alert" : "portal-status-note"} role={state.code === "error" ? "alert" : "status"}>{recovery ? <Link className="text-link" href={recovery}>{state.message}</Link> : state.message}</p> : null}</form>;
}
