"use client";

import {useActionState} from "react";

import type {MemberEventFormState} from "@/lib/events/member-actions";
import type {MemberEventView} from "@/lib/events/member-contract";

export type EventFormLabels = Readonly<{
  slug: string; titleEn: string; titleZh: string; descriptionEn: string; descriptionZh: string; startsAt: string; endsAt: string;
  venue: string; capacity: string; format: string; formats: Readonly<{in_person: string; online: string; hybrid: string}>;
  onlineUrl: string; visibility: string; visibilities: Readonly<{public: string; members_only: string}>;
  registrationMode: string; registrationModes: Readonly<{rsvp: string; external: string}>; externalRegistrationUrl: string;
  tags: string; heroMediaId: string; heroHelp: string; saveDraft: string; submit: string; saving: string;
  errors: Readonly<Record<string, string>>;
}>;

type Action = (state: MemberEventFormState, formData: FormData) => Promise<MemberEventFormState>;
type TextField = Exclude<keyof MemberEventView, "status" | "rejectionReason" | "submittedAt" | "publishedAt">;

const initial: MemberEventFormState = {status: "idle"};
const inputClass = "min-h-11 w-full rounded-md border border-input bg-background px-3";
const textareaClass = "min-h-28 w-full rounded-md border border-input bg-background px-3 py-2";
const labelClass = "space-y-2 text-sm font-medium";

/**
 * Two submit buttons share one form: the default action submits for review,
 * `formAction` on the secondary button saves a draft. Each has its own action
 * state so a failed submission does not show as a failed draft save. The hero
 * field is a media id; Task 4 replaces the plain input with an upload widget
 * that fills it in.
 */
export function EventForm({values, labels, draftAction, submitAction, canSubmit}: Readonly<{
  values: MemberEventView | null; labels: EventFormLabels; draftAction: Action; submitAction: Action; canSubmit: boolean;
}>) {
  const [draftState, draft, draftPending] = useActionState(draftAction, initial);
  const [submitState, submit, submitPending] = useActionState(submitAction, initial);
  const state = submitState.status === "error" ? submitState : draftState;
  const pending = draftPending || submitPending;
  // `startsAt`/`endsAt` post under the parser's names while their defaults come
  // from the `*Local` view fields, hence the separate `name` argument.
  const field = (valueKey: TextField, label: string, type = "text", extra: Readonly<{name?: string; required?: boolean; pattern?: string; min?: number}> = {}) => (
    <label className={labelClass}>
      <span>{label}</span>
      <input className={inputClass} defaultValue={values?.[valueKey] ?? ""} name={extra.name ?? valueKey} type={type} required={extra.required} pattern={extra.pattern} min={extra.min} />
    </label>
  );
  return (
    <form action={submit} className="glass-card grid gap-5 p-5 sm:grid-cols-2 sm:p-8" noValidate>
      {values ? <input name="eventId" type="hidden" value={values.id} /> : null}
      {field("slug", labels.slug, "text", {required: true, pattern: "[a-z0-9]+(?:-[a-z0-9]+)*"})}
      {field("titleEn", labels.titleEn, "text", {required: true})}
      {field("titleZh", labels.titleZh)}
      <label className={`${labelClass} sm:col-span-2`}><span>{labels.descriptionEn}</span><textarea className={textareaClass} defaultValue={values?.descriptionEn ?? ""} name="descriptionEn" required /></label>
      <label className={`${labelClass} sm:col-span-2`}><span>{labels.descriptionZh}</span><textarea className={textareaClass} defaultValue={values?.descriptionZh ?? ""} name="descriptionZh" /></label>
      {field("startsAtLocal", labels.startsAt, "datetime-local", {name: "startsAt", required: true})}
      {field("endsAtLocal", labels.endsAt, "datetime-local", {name: "endsAt"})}
      {field("venue", labels.venue)}
      {field("capacity", labels.capacity, "number", {min: 1})}
      <label className={labelClass}>
        <span>{labels.format}</span>
        <select className={inputClass} defaultValue={values?.format ?? "in_person"} name="format">
          {(["in_person", "online", "hybrid"] as const).map((key) => <option key={key} value={key}>{labels.formats[key]}</option>)}
        </select>
      </label>
      {field("onlineUrl", labels.onlineUrl, "url")}
      <label className={labelClass}>
        <span>{labels.visibility}</span>
        <select className={inputClass} defaultValue={values?.visibility ?? "public"} name="visibility">
          {(["public", "members_only"] as const).map((key) => <option key={key} value={key}>{labels.visibilities[key]}</option>)}
        </select>
      </label>
      <label className={labelClass}>
        <span>{labels.registrationMode}</span>
        <select className={inputClass} defaultValue={values?.registrationMode ?? "rsvp"} name="registrationMode">
          {(["rsvp", "external"] as const).map((key) => <option key={key} value={key}>{labels.registrationModes[key]}</option>)}
        </select>
      </label>
      {field("externalRegistrationUrl", labels.externalRegistrationUrl, "url")}
      {field("tags", labels.tags)}
      <label className={`${labelClass} sm:col-span-2`}>
        <span>{labels.heroMediaId}</span>
        <input className={inputClass} defaultValue={values?.heroMediaId ?? ""} name="heroMediaId" type="text" />
        <span className="block text-xs text-muted-foreground">{labels.heroHelp}</span>
      </label>
      {state.status === "error" ? <p className="text-sm text-destructive sm:col-span-2" role="alert">{labels.errors[state.code ?? "INVALID"] ?? labels.errors.INVALID}</p> : null}
      <div className="flex flex-wrap gap-3 sm:col-span-2">
        <button className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-medium disabled:opacity-60" disabled={pending} formAction={draft} type="submit">{pending ? labels.saving : labels.saveDraft}</button>
        <button className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60" disabled={pending || !canSubmit} type="submit">{pending ? labels.saving : labels.submit}</button>
      </div>
    </form>
  );
}
