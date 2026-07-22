"use client";

import {useActionState} from "react";

import type {SegmentFilterSet} from "@/lib/admin/segment-schema";
import type {SegmentSaveActionState} from "@/lib/admin/segment-action-core";

type Action = (state: SegmentSaveActionState, formData: FormData) => Promise<SegmentSaveActionState>;
type Labels = Readonly<{save: string; saving: string; nameEn: string; nameZh: string}>;
type ViewProps = Readonly<{action: (formData: FormData) => void; filter: SegmentFilterSet; labels: Labels; pending: boolean; state: SegmentSaveActionState}>;

export function SegmentSaveFormView({action, filter, labels, pending, state}: ViewProps) {
  const nameEnError = state.fieldErrors?.nameEn;
  const nameZhError = state.fieldErrors?.nameZh;
  return <form action={action} className="grid gap-4 border-t border-border pt-6 sm:grid-cols-2">
    <input name="filters" type="hidden" value={JSON.stringify(filter)} />
    <label className="space-y-2 text-sm" htmlFor="segment-name-en"><span>{labels.nameEn}</span><input aria-describedby={nameEnError ? "segment-name-en-error" : undefined} aria-invalid={nameEnError ? true : undefined} className="min-h-11 w-full rounded-md border border-input bg-background px-3" defaultValue={state.fields?.nameEn ?? ""} id="segment-name-en" name="nameEn" required type="text" />{nameEnError ? <span className="block text-xs text-destructive" id="segment-name-en-error">{nameEnError}</span> : null}</label>
    <label className="space-y-2 text-sm" htmlFor="segment-name-zh"><span>{labels.nameZh}</span><input aria-describedby={nameZhError ? "segment-name-zh-error" : undefined} aria-invalid={nameZhError ? true : undefined} className="min-h-11 w-full rounded-md border border-input bg-background px-3" defaultValue={state.fields?.nameZh ?? ""} id="segment-name-zh" name="nameZh" type="text" />{nameZhError ? <span className="block text-xs text-destructive" id="segment-name-zh-error">{nameZhError}</span> : null}</label>
    <div className="sm:col-span-2"><button className="min-h-11 rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60" disabled={pending} type="submit">{pending ? labels.saving : labels.save}</button></div>
    <p aria-live="polite" className={state.status === "error" ? "text-sm text-destructive sm:col-span-2" : "text-sm text-muted-foreground sm:col-span-2"} role={state.status === "error" ? "alert" : "status"}>{state.message ?? ""}</p>
  </form>;
}

export function SegmentSaveForm({action, filter, labels}: Readonly<{action: Action; filter: SegmentFilterSet; labels: Labels}>) {
  const [state, formAction, pending] = useActionState(action, {});
  return <SegmentSaveFormView action={formAction} filter={filter} labels={labels} pending={pending} state={state}/>;
}
