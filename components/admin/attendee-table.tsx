"use client";

import {useActionState} from "react";

import type {EventActionState} from "@/lib/admin/event-action-core";

type Attendee = Readonly<{profileId: string; displayName: string; email: string | null; status: string; checkedInAt: Date | null}>;
type Labels = Readonly<{caption: string; name: string; email: string; status: string; checkedIn: string; checkIn: string; checkingIn: string; unavailable: string; statuses: Readonly<Record<string, string>>}>;
const initialState: EventActionState = {};

function CheckInForm({action, profileId, labels, disabled}: Readonly<{action: (state: EventActionState, formData: FormData) => Promise<EventActionState>; profileId: string; labels: Labels; disabled: boolean}>) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return <form action={formAction} className="space-y-1"><input name="profileId" type="hidden" value={profileId}/><button className="underline disabled:no-underline disabled:opacity-60" disabled={disabled || pending} type="submit">{pending ? labels.checkingIn : labels.checkIn}</button>{state.message ? <p aria-live="polite" className={state.status === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}</form>;
}

export function AttendeeTable({attendees, labels, checkInAction, locale}: Readonly<{attendees: readonly Attendee[]; labels: Labels; checkInAction: (state: EventActionState, formData: FormData) => Promise<EventActionState>; locale: string}>) {
  const formatter = new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Hong_Kong"});
  return <div className="overflow-x-auto"><table className="w-full text-left"><caption className="sr-only">{labels.caption}</caption><thead><tr><th className="p-3">{labels.name}</th><th className="p-3">{labels.email}</th><th className="p-3">{labels.status}</th><th className="p-3">{labels.checkedIn}</th><th className="p-3">{labels.checkIn}</th></tr></thead><tbody>{attendees.map((attendee) => <tr className="border-t" key={attendee.profileId}><td className="p-3">{attendee.displayName}</td><td className="p-3">{attendee.email ?? labels.unavailable}</td><td className="p-3">{labels.statuses[attendee.status] ?? labels.unavailable}</td><td className="p-3">{attendee.checkedInAt ? formatter.format(attendee.checkedInAt) : labels.unavailable}</td><td className="p-3"><CheckInForm action={checkInAction} disabled={Boolean(attendee.checkedInAt)} labels={labels} profileId={attendee.profileId}/></td></tr>)}</tbody></table></div>;
}
