"use client";

import {useActionState} from "react";

import {MEMBERSHIP_PLAN_CODES} from "@/lib/membership/constants";
import type {GrantActionState} from "@/lib/admin/membership-grant-actions";

type Labels = Readonly<{title: string; description: string; plan: string; start: string; expiry: string; reason: string; submit: string}>;
export function MembershipGrantForm({action, labels}: Readonly<{action: (state: GrantActionState, data: FormData) => Promise<GrantActionState>; labels: Labels}>) {
  const [state, submit, pending] = useActionState(action, {});
  return <section className="glass-card p-5 sm:p-7">
    <h2 className="font-serif text-2xl font-semibold">{labels.title}</h2>
    <p className="mt-2 text-sm text-muted-foreground">{labels.description}</p>
    <form action={submit} className="mt-4 grid gap-4">
      <label className="grid gap-2">{labels.plan}<select className="min-h-11 rounded-md border bg-background px-3" name="planCode" required>{MEMBERSHIP_PLAN_CODES.map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
      <label className="grid gap-2">{labels.start}<input className="min-h-11 rounded-md border bg-background px-3" name="effectiveAt" required type="datetime-local"/></label>
      <label className="grid gap-2">{labels.expiry}<input className="min-h-11 rounded-md border bg-background px-3" name="expiresAt" required type="datetime-local"/></label>
      <label className="grid gap-2">{labels.reason}<textarea className="min-h-24 rounded-md border bg-background px-3 py-2" maxLength={1000} minLength={10} name="reason" required/></label>
      <button className="min-h-11 rounded-md bg-primary px-4 text-primary-foreground disabled:opacity-50" disabled={pending} type="submit">{labels.submit}</button>
      {state.message ? <p role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
    </form>
  </section>;
}
