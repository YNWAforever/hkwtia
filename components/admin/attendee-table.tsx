"use client";

import {useActionState} from "react";

import type {CheckInActionMessages} from "@/lib/admin/event-actions";
import {resendPassAction} from "@/lib/admin/event-actions";
import type {EventActionState} from "@/lib/admin/event-action-core";
import type {EventAttendee} from "@/lib/db/repos/events";

type Labels = Readonly<{caption: string; kind: string; kinds: Readonly<{member: string; guest: string; ticket: string}>; name: string; email: string; organisation: string; status: string; checkedIn: string; checkIn: string; checkingIn: string; resendPass: string; resending: string; unavailable: string; statuses: Readonly<Record<string, string>>}>;
const initialState: EventActionState = {};

function CheckInForm({action, profileId, labels, disabled}: Readonly<{action: (state: EventActionState, formData: FormData) => Promise<EventActionState>; profileId: string; labels: Labels; disabled: boolean}>) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return <form action={formAction} className="space-y-1"><input name="profileId" type="hidden" value={profileId}/><button className="underline disabled:no-underline disabled:opacity-60" disabled={disabled || pending} type="submit">{pending ? labels.checkingIn : labels.checkIn}</button>{state.message ? <p aria-live="polite" className={state.status === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}</form>;
}

/**
 * A ticket seat's admission by the door-list fallback (spec section 4.3): the
 * scanner's check-in page is the normal path, but a dead phone or a lost email
 * must not leave a paid seat unable to be admitted. The action is seat-keyed and
 * decided by the repository under the row lock, exactly as the scanned page's
 * write is — this is the same `submitSeatCheckInAction`, not a second admission
 * path. The page binds the paths and the messages, so only the seat id varies
 * per row.
 */
function SeatCheckInForm({action, seatId, labels, disabled}: Readonly<{action: (state: EventActionState, formData: FormData) => Promise<EventActionState>; seatId: string; labels: Labels; disabled: boolean}>) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return <form action={formAction} className="space-y-1"><input name="seatId" type="hidden" value={seatId}/><button className="underline disabled:no-underline disabled:opacity-60" disabled={disabled || pending} type="submit">{pending ? labels.checkingIn : labels.checkIn}</button>{state.message ? <p aria-live="polite" className={state.status === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}</form>;
}

/**
 * A ticket seat's pass is sent by the webhook on payment, so this is a resend:
 * staff press it when an attendee says the email never arrived. The action
 * supplies its own fresh attempt key, so pressing it again always sends.
 *
 * It is bound here rather than in the page because the seat id varies per row,
 * and `resendPassAction` takes the seat id first.
 */
function ResendPassForm({seatId, path, messages, labels}: Readonly<{seatId: string; path: string; messages: CheckInActionMessages; labels: Labels}>) {
  const [state, formAction, pending] = useActionState(resendPassAction.bind(null, seatId, path, messages), initialState);
  return <form action={formAction} className="space-y-1"><input name="seatId" type="hidden" value={seatId}/><button className="text-sm underline disabled:no-underline disabled:opacity-60" disabled={pending} type="submit">{pending ? labels.resending : labels.resendPass}</button>{state.message ? <p aria-live="polite" className={state.status === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}</form>;
}

/**
 * Members and guests share one door list (programme B-4). Only members get the
 * member check-in button: the action is keyed by profile id, and a guest arrives
 * through Phase B's own form. A ticket seat (Phase D-4b) gets the seat-keyed
 * Check in fallback beside a Resend pass control: the scanner's page is the
 * normal path, but the fallback admits a paid seat whose pass cannot be produced.
 */
export function AttendeeTable({attendees, labels, checkInAction, seatCheckInAction, resendPassPath, resendPassMessages, locale, checkInBlocked = false}: Readonly<{attendees: readonly EventAttendee[]; labels: Labels; checkInAction: (state: EventActionState, formData: FormData) => Promise<EventActionState>; seatCheckInAction: (state: EventActionState, formData: FormData) => Promise<EventActionState>; resendPassPath: string; resendPassMessages: CheckInActionMessages; locale: string; checkInBlocked?: boolean}>) {
  const formatter = new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Hong_Kong"});
  return <div className="overflow-x-auto"><table className="w-full text-left"><caption className="sr-only">{labels.caption}</caption><thead><tr><th className="p-3">{labels.kind}</th><th className="p-3">{labels.name}</th><th className="p-3">{labels.email}</th><th className="p-3">{labels.organisation}</th><th className="p-3">{labels.status}</th><th className="p-3">{labels.checkedIn}</th><th className="p-3">{labels.checkIn}</th></tr></thead><tbody>{attendees.map((attendee) => <tr className="border-t" key={`${attendee.kind}:${attendee.profileId ?? attendee.guestId ?? attendee.seatId ?? attendee.email ?? attendee.displayName}`}><td className="p-3">{labels.kinds[attendee.kind]}</td><td className="p-3">{attendee.displayName}</td><td className="p-3">{attendee.email ?? labels.unavailable}</td><td className="p-3">{attendee.organisation ?? labels.unavailable}</td><td className="p-3">{labels.statuses[attendee.status] ?? labels.unavailable}</td><td className="p-3">{attendee.checkedInAt ? formatter.format(attendee.checkedInAt) : labels.unavailable}</td><td className="p-3">{attendee.kind === "member" && attendee.profileId ? <CheckInForm action={checkInAction} disabled={checkInBlocked || Boolean(attendee.checkedInAt)} labels={labels} profileId={attendee.profileId}/> : attendee.kind === "ticket" && attendee.seatId ? <div className="space-y-2"><SeatCheckInForm action={seatCheckInAction} disabled={checkInBlocked || Boolean(attendee.checkedInAt)} labels={labels} seatId={attendee.seatId}/><ResendPassForm labels={labels} messages={resendPassMessages} path={resendPassPath} seatId={attendee.seatId}/></div> : <span className="text-muted-foreground">{labels.unavailable}</span>}</td></tr>)}</tbody></table></div>;
}
