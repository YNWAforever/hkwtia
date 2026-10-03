"use client";

import {useActionState, useRef, useState} from "react";

import {useAdminUnsavedChanges} from "@/components/admin/unsaved-changes-guard";

import {MediaPicker, type RegisteredMediaOption} from "@/components/admin/media-picker";

import type {EventActionState} from "@/lib/admin/event-action-core";
import {formatHongKongDateTimeLocal} from "@/lib/admin/event-form-input";

type Labels = Readonly<{
  slug: string; titleEn: string; titleZh: string; descriptionEn: string; descriptionZh: string;
  startsAt: string; endsAt: string; venue: string; capacity: string;
  registrationMode: string; registrationModes: Readonly<{rsvp: string; external: string; ticketed: string}>;
  externalRegistrationUrl: string; ticketPriceHkdCents: string;
  format: string; formats: Readonly<{in_person: string; online: string; hybrid: string}>;
  onlineUrl: string; tags: string; visibility: string;
  visibilities: Readonly<{public: string; members_only: string; invite_only: string}>;
  mediaSearch?: string; mediaResult?: string; mediaSelected?: string;
  memberOnly: string; published: string; heroMediaId: string; noHeroMedia: string; save: string; saving: string; saveDraft: string; savePublish: string; previewDraft: string; previewPrivate: string; previewEnglish: string; previewChinese: string;
}>;
type Values = Partial<Readonly<{
  slug: string; titleEn: string; titleZh: string | null; descriptionEn: string; descriptionZh: string | null;
  startsAt: Date; endsAt: Date | null; venue: string | null; capacity: number | null;
  registrationMode: string; externalRegistrationUrl: string | null; ticketPriceHkdCents: number | null;
  format: string; onlineUrl: string | null; tags: readonly string[]; visibility: string; memberOnly: boolean;
  published: boolean; heroMediaId: string | null; updatedAt: Date;
}>>;
const initialState: EventActionState = {};
const inputClass = "mt-1 w-full rounded-md border p-2";

export function EventForm({action, labels, values = {}, mediaRows = []}: Readonly<{
  action: (state: EventActionState, formData: FormData) => Promise<EventActionState>;
  labels: Labels; values?: Values; mediaRows?: readonly RegisteredMediaOption[];
}>) {
  const {setDirty} = useAdminUnsavedChanges();
  const formRef = useRef<HTMLFormElement>(null);
  const [publishOnSave, setPublishOnSave] = useState(Boolean(values.published));
  const [draftPreview, setDraftPreview] = useState<Readonly<{titleEn: string; titleZh: string; descriptionEn: string; descriptionZh: string}> | null>(null);
  const markEdited = () => {setDirty(true); setDraftPreview(null);};
  const captureDraft = () => {
    if (!formRef.current) return;
    const data = new FormData(formRef.current);
    const read = (name: string) => String(data.get(name) ?? "");
    setDraftPreview({titleEn: read("titleEn"), titleZh: read("titleZh"), descriptionEn: read("descriptionEn"), descriptionZh: read("descriptionZh")});
  };
  const [state, formAction, pending] = useActionState(async (previous: EventActionState, formData: FormData) => {
    const result = await action(previous, formData);
    if (result.status === "success") setDirty(false);
    return result;
  }, initialState);
  const value = (name: string, fallback: string | number | null | undefined) => state.values?.[name] ?? fallback ?? "";
  const [mode, setMode] = useState(values.registrationMode ?? "rsvp");
  const [format, setFormat] = useState(values.format ?? "in_person");
  const error = (name: string) => state.fieldErrors?.[name]
    ? <p className="text-sm text-destructive" id={`${name}-error`} role="alert">{state.fieldErrors[name]}</p> : null;
  const fieldProps = (name: string) => ({
    ...state.values?.[name] !== undefined ? {key: `${name}-${state.values[name]}`} : {},
    "aria-invalid": Boolean(state.fieldErrors?.[name]),
    "aria-describedby": state.fieldErrors?.[name] ? `${name}-error` : undefined,
  });
  const published = state.values?.published !== undefined ? state.values.published === "on" : Boolean(values.published);
  const visibility = value("visibility", values.visibility ?? (values.memberOnly ? "members_only" : "public"));

  return <>
  <form action={formAction} onChange={markEdited} onInput={markEdited} ref={formRef} className="glass-card grid gap-4 p-6 md:grid-cols-2" noValidate>
    {values.updatedAt ? <input name="expectedUpdatedAt" type="hidden" value={state.revision ?? values.updatedAt.toISOString()}/> : null}
    <label>{labels.slug}<input {...fieldProps("slug")} className={inputClass} defaultValue={value("slug", values.slug)} name="slug" required/>{error("slug")}</label>
    <label>{labels.titleEn}<input {...fieldProps("titleEn")} className={inputClass} defaultValue={value("titleEn", values.titleEn)} name="titleEn" required/>{error("titleEn")}</label>
    <label>{labels.titleZh}<input {...fieldProps("titleZh")} className={inputClass} defaultValue={value("titleZh", values.titleZh)} name="titleZh"/>{error("titleZh")}</label>
    <label>{labels.startsAt}<input {...fieldProps("startsAt")} className={inputClass} defaultValue={value("startsAt", formatHongKongDateTimeLocal(values.startsAt))} name="startsAt" required type="datetime-local"/>{error("startsAt")}</label>
    <label>{labels.endsAt}<input {...fieldProps("endsAt")} className={inputClass} defaultValue={value("endsAt", formatHongKongDateTimeLocal(values.endsAt))} name="endsAt" type="datetime-local"/>{error("endsAt")}</label>
    <label>{labels.format}<select className={inputClass} name="format" onChange={(event) => setFormat(event.target.value)} value={format}>{(["in_person", "online", "hybrid"] as const).map((key) => <option key={key} value={key}>{labels.formats[key]}</option>)}</select>{error("format")}</label>
    {format !== "online" ? <label>{labels.venue}<input {...fieldProps("venue")} className={inputClass} defaultValue={value("venue", values.venue)} name="venue"/>{error("venue")}</label> : null}
    {format !== "in_person" ? <label>{labels.onlineUrl}<input {...fieldProps("onlineUrl")} className={inputClass} defaultValue={value("onlineUrl", values.onlineUrl)} name="onlineUrl" required type="url"/>{error("onlineUrl")}</label> : null}
    <label>{labels.capacity}<input {...fieldProps("capacity")} className={inputClass} defaultValue={value("capacity", values.capacity)} min="1" name="capacity" type="number"/>{error("capacity")}</label>
    <label>{labels.registrationMode}<select className={inputClass} name="registrationMode" onChange={(event) => setMode(event.target.value)} value={mode}>{(["rsvp", "external", "ticketed"] as const).map((key) => <option key={key} value={key}>{labels.registrationModes[key]}</option>)}</select>{error("registrationMode")}</label>
    {mode === "external" ? <label>{labels.externalRegistrationUrl}<input {...fieldProps("externalRegistrationUrl")} className={inputClass} defaultValue={value("externalRegistrationUrl", values.externalRegistrationUrl)} name="externalRegistrationUrl" required type="url"/>{error("externalRegistrationUrl")}</label> : null}
    {mode === "ticketed" ? <label>{labels.ticketPriceHkdCents}<input {...fieldProps("ticketPriceHkdCents")} className={inputClass} defaultValue={value("ticketPriceHkdCents", values.ticketPriceHkdCents == null ? "" : String(values.ticketPriceHkdCents / 100))} min="1" name="ticketPriceHkdCents" step="1" type="number"/>{error("ticketPriceHkdCents")}</label> : null}
    <label>{labels.tags}<input {...fieldProps("tags")} className={inputClass} defaultValue={value("tags", values.tags?.join(", "))} name="tags" type="text"/>{error("tags")}</label>
    <label>{labels.visibility}<select {...fieldProps("visibility")} className={inputClass} defaultValue={visibility} name="visibility">{(["public", "members_only", "invite_only"] as const).map((key) => <option key={key} value={key}>{labels.visibilities[key]}</option>)}</select>{error("visibility")}</label>
    <div><MediaPicker rows={mediaRows} value={String(value("heroMediaId", values.heroMediaId))} name="heroMediaId" labels={{choose:labels.heroMediaId,none:labels.noHeroMedia,search:labels.mediaSearch ?? labels.heroMediaId,results:labels.mediaResult ?? labels.heroMediaId,selected:labels.mediaSelected ?? labels.heroMediaId}} invalid={Boolean(state.fieldErrors?.heroMediaId)} errorId={state.fieldErrors?.heroMediaId ? "heroMediaId-error" : undefined}/>{error("heroMediaId")}</div>
    <label className="flex items-center gap-2"><input defaultChecked={published} key={`published-${published}`} onChange={(event) => setPublishOnSave(event.currentTarget.checked)} name="published" type="checkbox"/>{labels.published}</label>
    <label className="md:col-span-2">{labels.descriptionEn}<textarea {...fieldProps("descriptionEn")} className="mt-1 min-h-24 w-full rounded-md border p-2" defaultValue={value("descriptionEn", values.descriptionEn)} name="descriptionEn" required/>{error("descriptionEn")}</label>
    <label className="md:col-span-2">{labels.descriptionZh}<textarea {...fieldProps("descriptionZh")} className="mt-1 min-h-24 w-full rounded-md border p-2" defaultValue={value("descriptionZh", values.descriptionZh)} name="descriptionZh"/>{error("descriptionZh")}</label>
    <div className="flex flex-wrap items-center justify-end gap-3 md:col-span-2">
      <button className="min-h-11 rounded-md border px-4 py-2" onClick={captureDraft} type="button">{labels.previewDraft}</button>
      <button className="min-h-11 rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60" disabled={pending} type="submit">{pending ? labels.saving : publishOnSave ? (values.published ? labels.save : labels.savePublish) : labels.saveDraft}</button>
    </div>
    {state.message ? <p aria-live="polite" className={state.status === "error" ? "text-sm text-destructive md:col-span-2" : "text-sm text-muted-foreground md:col-span-2"} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
  </form>
  {draftPreview ? <section aria-labelledby="event-draft-preview-title" className="glass-card space-y-5 p-6">
    <h2 className="font-serif text-2xl font-semibold" id="event-draft-preview-title">{labels.previewPrivate}</h2>
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-3"><h3 className="text-sm font-semibold">{labels.previewEnglish}</h3><h4 className="font-serif text-xl font-semibold">{draftPreview.titleEn}</h4><p className="whitespace-pre-wrap">{draftPreview.descriptionEn}</p></section>
      <section className="space-y-3"><h3 className="text-sm font-semibold">{labels.previewChinese}</h3><h4 className="font-serif text-xl font-semibold">{draftPreview.titleZh}</h4><p className="whitespace-pre-wrap">{draftPreview.descriptionZh}</p></section>
    </div>
  </section> : null}
  </>;
}
