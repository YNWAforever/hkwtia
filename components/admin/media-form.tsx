"use client";

import Image from "next/image";
import {useActionState} from "react";

import type {MediaActionState} from "@/lib/admin/media-action-core";

type Labels = Readonly<{
  url: string;
  urlHelp: string;
  altEn: string;
  altZh: string;
  altHelp: string;
  preview: string;
  save: string;
  saving: string;
}>;

type Values = Partial<Readonly<{url: string; altEn: string; altZh: string}>>;

const initialState: MediaActionState = {};

const field = "mt-2 block min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring";

export function MediaForm({
  action,
  labels,
  values = {},
  preview,
}: Readonly<{
  action: (state: MediaActionState, formData: FormData) => Promise<MediaActionState>;
  labels: Labels;
  values?: Values;
  /** Resolved server-side, so the preview can only ever be an own-origin path. */
  preview?: Readonly<{url: string; alt: string}> | null;
}>) {
  const [state, formAction, pending] = useActionState(action, initialState);

  // Echoed submission values win over the stored row so a failed save never
  // discards what the editor typed.
  const value = (name: keyof Values, fallback?: string) =>
    state.values?.[name] ?? fallback ?? "";
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

  return (
    <form action={formAction} className="glass-card grid gap-4 p-6 md:grid-cols-2" noValidate>
      <label className="text-sm font-semibold md:col-span-2" htmlFor="media-url">
        {labels.url}
        <input className={field} defaultValue={value("url", values.url)} id="media-url" name="url" required {...fieldProps("url")}/>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{labels.urlHelp}</p>
        {error("url")}
      </label>
      <label className="text-sm font-semibold" htmlFor="media-alt-en">
        {labels.altEn}
        <input className={field} defaultValue={value("altEn", values.altEn)} id="media-alt-en" name="altEn" required {...fieldProps("altEn")}/>
        {error("altEn")}
      </label>
      <label className="text-sm font-semibold" htmlFor="media-alt-zh">
        {labels.altZh}
        <input className={field} defaultValue={value("altZh", values.altZh)} id="media-alt-zh" name="altZh" required {...fieldProps("altZh")}/>
        {error("altZh")}
      </label>
      <p className="text-xs leading-5 text-muted-foreground md:col-span-2">{labels.altHelp}</p>
      {preview
        ? <figure className="md:col-span-2">
          <figcaption className="text-sm font-semibold">{labels.preview}</figcaption>
          <span className="mt-2 flex h-24 w-48 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-muted/40">
            <Image alt={preview.alt} className="max-h-24 w-auto object-contain" height={96} src={preview.url} width={192}/>
          </span>
        </figure>
        : null}
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
