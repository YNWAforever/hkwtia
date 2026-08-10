"use client";

import {useActionState} from "react";

import type {CohortActionState} from "@/lib/admin/cohort-action-core";

type Labels = Readonly<{
  slug: string;
  nameEn: string;
  nameZhHk: string;
  descriptionEn: string;
  descriptionZhHk: string;
  track: string;
  startsOn: string;
  endsOn: string;
  endsOnHelp: string;
  capacity: string;
  feeHkd: string;
  feeHelp: string;
  status: string;
  statusHelp: string;
  statuses: Readonly<Record<string, string>>;
  save: string;
  saving: string;
}>;

type Values = Partial<Readonly<{
  slug: string;
  nameEn: string;
  nameZhHk: string;
  descriptionEn: string;
  descriptionZhHk: string;
  track: string;
  startsOn: string;
  endsOn: string | null;
  capacity: number;
  feeHkd: number;
  status: string;
}>>;

const statusOrder = ["planning", "open", "active", "completed", "archived"] as const;

const initialState: CohortActionState = {};

export function CohortForm({
  action,
  labels,
  values = {},
}: Readonly<{
  action: (state: CohortActionState, formData: FormData) => Promise<CohortActionState>;
  labels: Labels;
  values?: Values;
}>) {
  const [state, formAction, pending] = useActionState(action, initialState);

  // Echoed submission values win over the stored row so a failed save never
  // discards what staff typed.
  const value = (name: keyof Values, fallback?: string | number | null) =>
    state.values?.[name] ?? (fallback == null ? "" : String(fallback));
  const error = (name: string) =>
    state.fieldErrors?.[name]
      ? <p className="text-sm text-destructive" id={`${name}-error`} role="alert">{state.fieldErrors[name]}</p>
      : null;
  // Inputs are uncontrolled, so a changing key remounts them with the echo.
  const fieldProps = (name: string) => ({
    ...(state.values?.[name] !== undefined ? {key: `${name}-${state.values[name]}`} : {}),
    "aria-invalid": Boolean(state.fieldErrors?.[name]),
    "aria-describedby": state.fieldErrors?.[name] ? `${name}-error` : undefined,
  });

  const field = "mt-2 block min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring";

  return (
    <form action={formAction} className="glass-card grid gap-4 p-6 md:grid-cols-2" noValidate>
      <label className="text-sm font-semibold" htmlFor="cohort-slug">
        {labels.slug}
        <input className={field} defaultValue={value("slug", values.slug)} id="cohort-slug" name="slug" required {...fieldProps("slug")}/>
        {error("slug")}
      </label>
      <label className="text-sm font-semibold" htmlFor="cohort-track">
        {labels.track}
        <input className={field} defaultValue={value("track", values.track)} id="cohort-track" name="track" required {...fieldProps("track")}/>
        {error("track")}
      </label>
      <label className="text-sm font-semibold" htmlFor="cohort-name-en">
        {labels.nameEn}
        <input className={field} defaultValue={value("nameEn", values.nameEn)} id="cohort-name-en" name="nameEn" required {...fieldProps("nameEn")}/>
        {error("nameEn")}
      </label>
      <label className="text-sm font-semibold" htmlFor="cohort-name-zh">
        {labels.nameZhHk}
        <input className={field} defaultValue={value("nameZhHk", values.nameZhHk)} id="cohort-name-zh" name="nameZhHk" required {...fieldProps("nameZhHk")}/>
        {error("nameZhHk")}
      </label>
      <label className="text-sm font-semibold md:col-span-2" htmlFor="cohort-description-en">
        {labels.descriptionEn}
        <textarea className={`${field} min-h-32 resize-y`} defaultValue={value("descriptionEn", values.descriptionEn)} id="cohort-description-en" name="descriptionEn" required rows={4} {...fieldProps("descriptionEn")}/>
        {error("descriptionEn")}
      </label>
      <label className="text-sm font-semibold md:col-span-2" htmlFor="cohort-description-zh">
        {labels.descriptionZhHk}
        <textarea className={`${field} min-h-32 resize-y`} defaultValue={value("descriptionZhHk", values.descriptionZhHk)} id="cohort-description-zh" name="descriptionZhHk" required rows={4} {...fieldProps("descriptionZhHk")}/>
        {error("descriptionZhHk")}
      </label>
      <label className="text-sm font-semibold" htmlFor="cohort-starts-on">
        {labels.startsOn}
        <input className={field} defaultValue={value("startsOn", values.startsOn)} id="cohort-starts-on" name="startsOn" required type="date" {...fieldProps("startsOn")}/>
        {error("startsOn")}
      </label>
      <label className="text-sm font-semibold" htmlFor="cohort-ends-on">
        {labels.endsOn}
        <input className={field} defaultValue={value("endsOn", values.endsOn)} id="cohort-ends-on" name="endsOn" type="date" {...fieldProps("endsOn")}/>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{labels.endsOnHelp}</p>
        {error("endsOn")}
      </label>
      <label className="text-sm font-semibold" htmlFor="cohort-capacity">
        {labels.capacity}
        <input className={field} defaultValue={value("capacity", values.capacity)} id="cohort-capacity" min={1} name="capacity" required step={1} type="number" {...fieldProps("capacity")}/>
        {error("capacity")}
      </label>
      <label className="text-sm font-semibold" htmlFor="cohort-fee">
        {labels.feeHkd}
        <input className={field} defaultValue={value("feeHkd", values.feeHkd)} id="cohort-fee" min={0} name="feeHkd" required step={1} type="number" {...fieldProps("feeHkd")}/>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{labels.feeHelp}</p>
        {error("feeHkd")}
      </label>
      <label className="text-sm font-semibold" htmlFor="cohort-status">
        {labels.status}
        <select className={field} defaultValue={value("status", values.status ?? "planning")} id="cohort-status" name="status" {...fieldProps("status")}>
          {statusOrder.map((status) => (
            <option key={status} value={status}>{labels.statuses[status] ?? status}</option>
          ))}
        </select>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{labels.statusHelp}</p>
        {error("status")}
      </label>
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
