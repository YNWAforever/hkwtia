"use client";

import {PrivateLink as Link} from "@/components/internal-shell/private-link";
import {useActionState} from "react";

import type {RegistrationActionMessages, RegistrationActionState} from "@/lib/events/registration-state";

const initialState: RegistrationActionState = {};

export function EventRegistrationForm({action, eventId, links, registerLabel, pendingLabel}: Readonly<{
  action: (state: RegistrationActionState, formData: FormData) => Promise<RegistrationActionState>;
  eventId: string;
  registerLabel: string;
  pendingLabel: string;
  messages: RegistrationActionMessages;
  links?: Readonly<{unauthenticated: string; ineligible: string}>;
}>) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const recovery = state.code === "unauthenticated" ? links?.unauthenticated : state.code === "ineligible" ? links?.ineligible : undefined;
  return <form action={formAction} className="space-y-2"><input name="eventId" type="hidden" value={eventId}/><button className="button" disabled={pending} type="submit">{pending ? pendingLabel : registerLabel}</button>{state.message ? <p aria-live="polite" className={state.code === "error" ? "portal-form-alert" : "portal-status-note"} role={state.code === "error" ? "alert" : "status"}>{recovery ? <Link className="text-link" href={recovery}>{state.message}</Link> : state.message}</p> : null}</form>;
}
