"use client";

import {useActionState} from "react";

import type {EventActionState} from "@/lib/admin/event-action-core";

type Labels = Readonly<{slug: string; titleEn: string; titleZh: string; descriptionEn: string; descriptionZh: string; startsAt: string; endsAt: string; venue: string; capacity: string; memberOnly: string; published: string; save: string; saving: string}>;
type Values = Partial<Readonly<{slug: string; titleEn: string; titleZh: string | null; descriptionEn: string; descriptionZh: string | null; startsAt: Date; endsAt: Date | null; venue: string | null; capacity: number | null; memberOnly: boolean; published: boolean}>>;
const initialState: EventActionState = {};

export function EventForm({action, labels, values = {}}: Readonly<{action: (state: EventActionState, formData: FormData) => Promise<EventActionState>; labels: Labels; values?: Values}>) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const dateValue = (value: Date | null | undefined) => value ? value.toISOString().slice(0, 16) : "";
  const value = (name: string, fallback: string | number | null | undefined) => state.values?.[name] ?? fallback ?? "";
  const error = (name: string) => state.fieldErrors?.[name] ? <p className="text-sm text-destructive" id={`${name}-error`} role="alert">{state.fieldErrors[name]}</p> : null;
  const fieldProps = (name: string) => ({...state.values?.[name] !== undefined ? {key: `${name}-${state.values[name]}`} : {}, "aria-invalid": Boolean(state.fieldErrors?.[name]), "aria-describedby": state.fieldErrors?.[name] ? `${name}-error` : undefined});
  const checked = (name: "memberOnly" | "published") => state.values?.[name] !== undefined ? state.values[name] === "on" : Boolean(values[name]);
  return <form action={formAction} className="glass-card grid gap-4 p-6 md:grid-cols-2" noValidate>
    <label>{labels.slug}<input {...fieldProps("slug")} className="mt-1 w-full rounded-md border p-2" defaultValue={value("slug", values.slug)} name="slug" required/>{error("slug")}</label>
    <label>{labels.titleEn}<input {...fieldProps("titleEn")} className="mt-1 w-full rounded-md border p-2" defaultValue={value("titleEn", values.titleEn)} name="titleEn" required/>{error("titleEn")}</label>
    <label>{labels.titleZh}<input {...fieldProps("titleZh")} className="mt-1 w-full rounded-md border p-2" defaultValue={value("titleZh", values.titleZh)} name="titleZh"/>{error("titleZh")}</label>
    <label>{labels.startsAt}<input {...fieldProps("startsAt")} className="mt-1 w-full rounded-md border p-2" defaultValue={value("startsAt", dateValue(values.startsAt))} name="startsAt" required type="datetime-local"/>{error("startsAt")}</label>
    <label>{labels.endsAt}<input {...fieldProps("endsAt")} className="mt-1 w-full rounded-md border p-2" defaultValue={value("endsAt", dateValue(values.endsAt))} name="endsAt" type="datetime-local"/>{error("endsAt")}</label>
    <label>{labels.venue}<input {...fieldProps("venue")} className="mt-1 w-full rounded-md border p-2" defaultValue={value("venue", values.venue)} name="venue"/>{error("venue")}</label>
    <label>{labels.capacity}<input {...fieldProps("capacity")} className="mt-1 w-full rounded-md border p-2" defaultValue={value("capacity", values.capacity)} min="1" name="capacity" type="number"/>{error("capacity")}</label>
    <label className="flex items-center gap-2"><input defaultChecked={checked("memberOnly")} key={`memberOnly-${checked("memberOnly")}`} name="memberOnly" type="checkbox"/>{labels.memberOnly}</label>
    <label className="flex items-center gap-2"><input defaultChecked={checked("published")} key={`published-${checked("published")}`} name="published" type="checkbox"/>{labels.published}</label>
    <label className="md:col-span-2">{labels.descriptionEn}<textarea {...fieldProps("descriptionEn")} className="mt-1 min-h-24 w-full rounded-md border p-2" defaultValue={value("descriptionEn", values.descriptionEn)} name="descriptionEn" required/>{error("descriptionEn")}</label>
    <label className="md:col-span-2">{labels.descriptionZh}<textarea {...fieldProps("descriptionZh")} className="mt-1 min-h-24 w-full rounded-md border p-2" defaultValue={value("descriptionZh", values.descriptionZh)} name="descriptionZh"/>{error("descriptionZh")}</label>
    <button className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60 md:col-span-2" disabled={pending} type="submit">{pending ? labels.saving : labels.save}</button>
    {state.message ? <p aria-live="polite" className={state.status === "error" ? "text-sm text-destructive md:col-span-2" : "text-sm text-muted-foreground md:col-span-2"} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
  </form>;
}
