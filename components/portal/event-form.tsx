"use client";

import {useActionState, useState} from "react";

import {HeroUpload, type HeroUploadLabels} from "@/components/portal/hero-upload";
import type {MemberEventFormState} from "@/lib/events/member-actions";
import type {MemberEventView} from "@/lib/events/member-contract";

export type EventFormLabels = Readonly<{
  slug: string; titleEn: string; titleZh: string; descriptionEn: string; descriptionZh: string; startsAt: string; endsAt: string;
  venue: string; capacity: string; format: string; formats: Readonly<{in_person: string; online: string; hybrid: string}>;
  onlineUrl: string; visibility: string; visibilities: Readonly<{public: string; members_only: string}>;
  registrationMode: string; registrationModes: Readonly<{rsvp: string; external: string}>; externalRegistrationUrl: string;
  tags: string; heroMediaId: string; heroHelp: string; hero: HeroUploadLabels; saveDraft: string; submit: string; saving: string;
  errors: Readonly<Record<string, string>>;
}>;

type Action = (state: MemberEventFormState, formData: FormData) => Promise<MemberEventFormState>;
type TextField = Exclude<keyof MemberEventView, "status" | "rejectionReason" | "submittedAt" | "publishedAt">;

const initial: MemberEventFormState = {status: "idle"};
const inputClass = "min-h-11 w-full rounded-md border border-input bg-background px-3";
const textareaClass = "min-h-28 w-full rounded-md border border-input bg-background px-3 py-2";
const labelClass = "space-y-2 text-sm font-medium";

/**
 * Two submit buttons share one form and one action: the submitter's `intent`
 * value (React includes the clicked button's name/value in the FormData) tells
 * the action whether to save a draft or submit for review, so there is a single
 * action state and a failed submission can never read as a failed draft save.
 * `notice` is the post-redirect "saved" copy from the edit page; the form owns
 * it so it disappears the moment a later attempt fails. The hero field is a
 * media id: it stays a visible, editable input so a member can clear it or
 * paste an id from an earlier upload, and `HeroUpload` beneath it fills it in
 * after a successful post to /api/portal/media/upload (S-3).
 */
export function EventForm({values, labels, action, canSubmit, notice = null}: Readonly<{
  values: MemberEventView | null; labels: EventFormLabels; action: Action; canSubmit: boolean; notice?: string | null;
}>) {
  const [state, dispatch, pending] = useActionState(action, initial);
  const [heroMediaId, setHeroMediaId] = useState(values?.heroMediaId ?? "");
  // `startsAt`/`endsAt` post under the parser's names while their defaults come
  // from the `*Local` view fields, hence the separate `name` argument.
  const field = (valueKey: TextField, label: string, type = "text", extra: Readonly<{name?: string; required?: boolean; pattern?: string; min?: number}> = {}) => (
    <label className={labelClass}>
      <span>{label}</span>
      <input className={inputClass} defaultValue={values?.[valueKey] ?? ""} name={extra.name ?? valueKey} type={type} required={extra.required} pattern={extra.pattern} min={extra.min} />
    </label>
  );
  return (
    <form action={dispatch} className="glass-card grid gap-5 p-5 sm:grid-cols-2 sm:p-8" noValidate>
      {notice && state.status !== "error" ? <p className="text-sm text-muted-foreground sm:col-span-2" role="status">{notice}</p> : null}
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
        <input className={inputClass} name="heroMediaId" onChange={(event) => setHeroMediaId(event.target.value)} type="text" value={heroMediaId} />
        <span className="block text-xs text-muted-foreground">{labels.heroHelp}</span>
      </label>
      <HeroUpload labels={labels.hero} onUploaded={setHeroMediaId} />
      {state.status === "error" ? <p className="text-sm text-destructive sm:col-span-2" role="alert">{labels.errors[state.code ?? "INVALID"] ?? labels.errors.INVALID}</p> : null}
      <div className="flex flex-wrap gap-3 sm:col-span-2">
        <button className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-medium disabled:opacity-60" disabled={pending} formAction={dispatch} name="intent" type="submit" value="draft">{pending ? labels.saving : labels.saveDraft}</button>
        <button className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60" disabled={pending || !canSubmit} name="intent" type="submit" value="submit">{pending ? labels.saving : labels.submit}</button>
      </div>
    </form>
  );
}
