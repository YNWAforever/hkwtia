"use client";

import {useActionState} from "react";

import {saveMemberViewAction, type MemberViewActionState} from "@/lib/admin/member-view-actions";
import type {AdminMemberQuery} from "@/lib/admin/member-query";
import type {MemberSavedViewLabels} from "@/components/admin/member-saved-views";

const initial: MemberViewActionState = {status: "idle"};

export function MemberSavedViewForm({query, canShare, labels}: Readonly<{query: AdminMemberQuery; canShare: boolean; labels: MemberSavedViewLabels}>) {
  const [state, action, pending] = useActionState(saveMemberViewAction, initial);
  const message = state.status === "saved" ? labels.saved : state.status === "invalid" ? labels.invalid : state.status === "error" ? labels.error : "";
  return <form action={action} className="flex flex-wrap items-end gap-3">
    <input name="query" type="hidden" value={JSON.stringify({...query, cursor: null})}/>
    <label className="space-y-1 text-sm font-medium" htmlFor="member-view-name"><span>{labels.name}</span><input className="block min-h-11 rounded-md border border-input bg-background px-3" id="member-view-name" maxLength={80} name="name" required type="text"/></label>
    {canShare ? <label className="flex min-h-11 items-center gap-2 text-sm"><input name="shared" type="checkbox"/>{labels.shared}</label> : null}
    <button className="min-h-11 rounded-md border border-border px-4 py-2 text-sm font-medium disabled:opacity-60" disabled={pending} type="submit">{labels.save}</button>
    <p aria-live="polite" className={state.status === "error" || state.status === "invalid" ? "w-full text-sm text-destructive" : "w-full text-sm text-muted-foreground"} role={state.status === "error" || state.status === "invalid" ? "alert" : "status"}>{message}</p>
  </form>;
}
