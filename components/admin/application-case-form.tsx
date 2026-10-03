"use client";
import { useActionState, useState } from "react";
import type { ApplicationCase } from "@/lib/admin/application-case-types";
import type { ApplicationCaseState } from "@/lib/admin/application-case-actions";
export type ApplicationCaseLabels = Readonly<{
    title: string;
    description: string;
    owner: string;
    unassigned: string;
    due: string;
    missing: string;
    nextAction: string;
    note: string;
    save: string;
    saving: string;
    saved: string;
    conflict: string;
    error: string;
    refresh: string;
    missingFields: Readonly<Record<string, string>>;
    nextActions: Readonly<Record<string, string>>;
}>;
export function ApplicationCaseForm({ record, owners, labels, action, refreshHref }: Readonly<{
    record: ApplicationCase;
    owners: readonly Readonly<{
        id: string;
        name: string;
    }>[];
    labels: ApplicationCaseLabels;
    action: (state: ApplicationCaseState, data: FormData) => Promise<ApplicationCaseState>;
    refreshHref: string;
}>) {
    const [state, submit, pending] = useActionState(action, { status: "idle" });
    // Keep unsaved fields attached to the version loaded when editing began.
    const [loadedVersion] = useState(record.version);
    const dueValue = record.dueAt ? new Date(Date.parse(record.dueAt) + 8 * 60 * 60 * 1000).toISOString().slice(0, 16) : "";
    return <form action={submit} className="glass-card space-y-5 p-5 sm:p-6"><h2 className="font-serif text-2xl">{labels.title}</h2><p className="text-sm text-muted-foreground">{labels.description}</p>
  <input type="hidden" name="expectedVersion" value={state.version ?? loadedVersion}/>
  <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2">{labels.owner}<select aria-label={labels.owner} name="ownerProfileId" className="min-h-11 rounded-md border bg-background px-3" defaultValue={record.ownerProfileId ?? ""}><option value="">{labels.unassigned}</option>{owners.map(owner => <option value={owner.id} key={owner.id}>{owner.name}</option>)}</select></label>
  <label className="grid gap-2">{labels.due}<input aria-label={labels.due} name="dueAt" type="datetime-local" defaultValue={dueValue} className="min-h-11 min-w-0 rounded-md border bg-background px-3"/></label></div>
  <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="mb-2 font-medium">{labels.missing}</legend>{Object.entries(labels.missingFields).map(([value, label]) => <label className="flex min-h-11 items-center gap-3" key={value}><input name="missingFields" type="checkbox" value={value} defaultChecked={record.missingFields.includes(value)}/>{label}</label>)}</fieldset>
  <label className="grid gap-2">{labels.nextAction}<select aria-label={labels.nextAction} name="nextActionCode" className="min-h-11 rounded-md border bg-background px-3" defaultValue={record.nextActionCode}>{Object.entries(labels.nextActions).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
  <label className="grid gap-2">{labels.note}<textarea aria-label={labels.note} name="note" maxLength={1000} required rows={3} className="rounded-md border bg-background p-3"/></label>
  {state.status !== "idle" ? <p role={state.status === "saved" ? "status" : "alert"}>{labels[state.status]}{state.status === "conflict" ? <a className="ml-3 inline-flex min-h-11 items-center text-primary underline" href={refreshHref}>{labels.refresh}</a> : null}</p> : null}
  <button type="submit" disabled={pending} className="min-h-11 rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">{pending ? labels.saving : labels.save}</button>
 </form>;
}
