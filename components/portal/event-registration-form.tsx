"use client";

import {useActionState} from "react";

import type {RegistrationActionState} from "@/lib/portal/event-action-core";

const initialState: RegistrationActionState = {};

export function EventRegistrationForm({action, eventId, registerLabel, pendingLabel}: Readonly<{
  action: (state: RegistrationActionState, formData: FormData) => Promise<RegistrationActionState>;
  eventId: string;
  registerLabel: string;
  pendingLabel: string;
}>) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return <form action={formAction} className="space-y-2"><input name="eventId" type="hidden" value={eventId}/><button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60" disabled={pending} type="submit">{pending ? pendingLabel : registerLabel}</button>{state.message ? <p aria-live="polite" className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}</form>;
}
