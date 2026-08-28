"use client";

import {useActionState} from "react";

import {publicRoutes} from "@/config/public-routes";
import type {AnnouncementActionState} from "@/lib/admin/announcement-action-core";
import type {AnnouncementLifecycleActionState} from "@/lib/admin/announcement-actions";
import {formatAnnouncementDateTime} from "@/lib/admin/announcement-form-input";

export type AnnouncementFormLabels = Readonly<{
  titleEn: string;
  titleZhHk: string;
  ctaLabelEn: string;
  ctaLabelZhHk: string;
  href: string;
  startsAt: string;
  endsAt: string;
  timeHelp: string;
  priority: string;
  priorityHelp: string;
  save: string;
  saving: string;
}>;

type Values = Partial<Readonly<{
  titleEn: string;
  titleZhHk: string;
  ctaLabelEn: string;
  ctaLabelZhHk: string;
  href: string;
  startsAt: Date;
  endsAt: Date;
  priority: number;
}>>;

const initialState: AnnouncementActionState = {};

export function AnnouncementForm({
  action,
  labels,
  values = {},
}: Readonly<{
  action: (state: AnnouncementActionState, formData: FormData) => Promise<AnnouncementActionState>;
  labels: AnnouncementFormLabels;
  values?: Values;
}>) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const value = (name: keyof Values, fallback: string | number | undefined) =>
    state.values?.[name] ?? fallback ?? "";
  const error = (name: string) => state.fieldErrors?.[name]
    ? <p className="text-sm text-destructive" id={`${name}-error`} role="alert">{state.fieldErrors[name]}</p>
    : null;
  const fieldKey = (name: string) =>
    state.values?.[name] !== undefined ? `${name}-${state.values[name]}` : undefined;
  const describedBy = (name: string) => [
    ...(["startsAt", "endsAt"].includes(name) ? ["announcement-time-help"] : []),
    ...(state.fieldErrors?.[name] ? [`${name}-error`] : []),
  ].join(" ") || undefined;
  const fieldProps = (name: string) => ({
    "aria-invalid": Boolean(state.fieldErrors?.[name]),
    "aria-describedby": describedBy(name),
  });
  const field = "mt-2 block min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring";

  return (
    <form action={formAction} className="glass-card grid gap-4 p-6 md:grid-cols-2" noValidate>
      <label className="text-sm font-semibold">
        {labels.titleEn}
        <input key={fieldKey("titleEn")} {...fieldProps("titleEn")} className={field} defaultValue={value("titleEn", values.titleEn)} name="titleEn" required/>
        {error("titleEn")}
      </label>
      <label className="text-sm font-semibold">
        {labels.titleZhHk}
        <input key={fieldKey("titleZhHk")} {...fieldProps("titleZhHk")} className={field} defaultValue={value("titleZhHk", values.titleZhHk)} name="titleZhHk" required/>
        {error("titleZhHk")}
      </label>
      <label className="text-sm font-semibold">
        {labels.ctaLabelEn}
        <input key={fieldKey("ctaLabelEn")} {...fieldProps("ctaLabelEn")} className={field} defaultValue={value("ctaLabelEn", values.ctaLabelEn)} name="ctaLabelEn" required/>
        {error("ctaLabelEn")}
      </label>
      <label className="text-sm font-semibold">
        {labels.ctaLabelZhHk}
        <input key={fieldKey("ctaLabelZhHk")} {...fieldProps("ctaLabelZhHk")} className={field} defaultValue={value("ctaLabelZhHk", values.ctaLabelZhHk)} name="ctaLabelZhHk" required/>
        {error("ctaLabelZhHk")}
      </label>
      <label className="text-sm font-semibold">
        {labels.href}
        <select key={fieldKey("href")} {...fieldProps("href")} className={field} defaultValue={value("href", values.href)} name="href" required>
          {publicRoutes.map((route) => <option key={route} value={route}>{route}</option>)}
        </select>
        {error("href")}
      </label>
      <label className="text-sm font-semibold">
        {labels.priority}
        <input key={fieldKey("priority")} {...fieldProps("priority")} className={field} defaultValue={value("priority", values.priority ?? 0)} max={1000} min={0} name="priority" required step={1} type="number"/>
        <p className="mt-1 text-xs text-muted-foreground">{labels.priorityHelp}</p>
        {error("priority")}
      </label>
      <label className="text-sm font-semibold">
        {labels.startsAt}
        <input key={fieldKey("startsAt")} {...fieldProps("startsAt")} className={field} defaultValue={value("startsAt", formatAnnouncementDateTime(values.startsAt))} name="startsAt" required type="datetime-local"/>
        {error("startsAt")}
      </label>
      <label className="text-sm font-semibold">
        {labels.endsAt}
        <input key={fieldKey("endsAt")} {...fieldProps("endsAt")} className={field} defaultValue={value("endsAt", formatAnnouncementDateTime(values.endsAt))} name="endsAt" required type="datetime-local"/>
        {error("endsAt")}
      </label>
      <p className="text-xs text-muted-foreground md:col-span-2" id="announcement-time-help">{labels.timeHelp}</p>
      <div className="flex items-center justify-end gap-4 md:col-span-2">
        {state.message
          ? <p aria-live="polite" className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>
          : null}
        <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60" disabled={pending} type="submit">
          {pending ? labels.saving : labels.save}
        </button>
      </div>
    </form>
  );
}

const lifecycleInitial: AnnouncementLifecycleActionState = {status: "idle"};

function LifecycleForm({
  action,
  idleLabel,
  pendingLabel,
  errorLabel,
}: Readonly<{
  action: (state: AnnouncementLifecycleActionState, formData: FormData) => Promise<AnnouncementLifecycleActionState>;
  idleLabel: string;
  pendingLabel: string;
  errorLabel: string;
}>) {
  const [state, formAction, pending] = useActionState(action, lifecycleInitial);
  return <form action={formAction} className="flex items-center gap-3">
    <button className="inline-flex min-h-11 items-center justify-center rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60" disabled={pending} type="submit">
      {pending ? pendingLabel : idleLabel}
    </button>
    {state.status === "error" || state.status === "invalid"
      ? <p className="text-sm text-destructive" role="alert">{errorLabel}</p>
      : null}
  </form>;
}

export function AnnouncementLifecycleControls({
  publishAction,
  archiveAction,
  published,
  archived,
  labels,
}: Readonly<{
  publishAction: (state: AnnouncementLifecycleActionState, formData: FormData) => Promise<AnnouncementLifecycleActionState>;
  archiveAction: (state: AnnouncementLifecycleActionState, formData: FormData) => Promise<AnnouncementLifecycleActionState>;
  published: boolean;
  archived: boolean;
  labels: Readonly<{
    publish: string;
    unpublish: string;
    archive: string;
    unarchive: string;
    saving: string;
    error: string;
    archivedNotice: string;
  }>;
}>) {
  return <section className="glass-card space-y-4 p-6">
    {archived ? <p className="text-sm text-muted-foreground">{labels.archivedNotice}</p> : null}
    <div className="flex flex-wrap gap-4">
      <LifecycleForm action={publishAction} errorLabel={labels.error} idleLabel={published ? labels.unpublish : labels.publish} pendingLabel={labels.saving}/>
      <LifecycleForm action={archiveAction} errorLabel={labels.error} idleLabel={archived ? labels.unarchive : labels.archive} pendingLabel={labels.saving}/>
    </div>
  </section>;
}
