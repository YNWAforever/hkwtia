"use client";

import {useActionState} from "react";

export type MemberNoteFormState = Readonly<{status?: "success" | "error"; message?: string}>;
export const initialMemberNoteFormState: MemberNoteFormState = {};

export function MemberNoteForm({action, profileId, labels}: {action: (state: MemberNoteFormState, formData: FormData) => Promise<MemberNoteFormState>; profileId: string; labels: {title: string; body: string; submit: string; submitting: string; success: string; validation: string}}) {
  const [state, formAction, pending] = useActionState(action, initialMemberNoteFormState);
  return <form action={formAction} className="glass-card space-y-4 p-5 sm:p-8"><input name="profileId" type="hidden" value={profileId} /><h2 className="font-serif text-2xl font-semibold">{labels.title}</h2><label className="block space-y-2 text-sm font-medium" htmlFor="member-note-body"><span>{labels.body}</span><textarea aria-describedby="member-note-message" className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-2" id="member-note-body" maxLength={4000} name="body" required /></label><button className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60" disabled={pending} type="submit">{pending ? labels.submitting : labels.submit}</button><p aria-live="polite" className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"} id="member-note-message">{state.message ?? ""}</p></form>;
}