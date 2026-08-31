"use client";

import {useActionState} from "react";

import type {NewsActionState} from "@/lib/admin/news-action-core";

type Labels = Readonly<{
  slug: string;
  titleEn: string;
  titleZh: string;
  author: string;
  bodyMdx: string;
  bodyMdxZhHk: string;
  bodyHelp: string;
  published: string;
  save: string;
  saving: string;
}>;

type Values = Partial<Readonly<{
  slug: string;
  titleEn: string;
  titleZh: string;
  author: string;
  bodyMdx: string;
  bodyMdxZhHk: string | null;
  publishedAt: Date | null;
}>>;

const initialState: NewsActionState = {};

export function NewsForm({
  action,
  labels,
  values = {},
}: Readonly<{
  action: (state: NewsActionState, formData: FormData) => Promise<NewsActionState>;
  labels: Labels;
  values?: Values;
}>) {
  const [state, formAction, pending] = useActionState(action, initialState);

  // Echoed submission values win over the stored row so a failed save never
  // discards what the author typed.
  const value = (name: keyof Values, fallback?: string | null) =>
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
  const published = state.values?.published !== undefined
    ? state.values.published === "on"
    : values.publishedAt != null;

  const field = "mt-2 block min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring";

  return (
    <form action={formAction} className="glass-card grid gap-4 p-6 md:grid-cols-2" noValidate>
      <label className="text-sm font-semibold" htmlFor="news-slug">
        {labels.slug}
        <input className={field} defaultValue={value("slug", values.slug)} id="news-slug" name="slug" required {...fieldProps("slug")}/>
        {error("slug")}
      </label>
      <label className="text-sm font-semibold" htmlFor="news-author">
        {labels.author}
        <input className={field} defaultValue={value("author", values.author)} id="news-author" name="author" required {...fieldProps("author")}/>
        {error("author")}
      </label>
      <label className="text-sm font-semibold" htmlFor="news-title-en">
        {labels.titleEn}
        <input className={field} defaultValue={value("titleEn", values.titleEn)} id="news-title-en" name="titleEn" required {...fieldProps("titleEn")}/>
        {error("titleEn")}
      </label>
      <label className="text-sm font-semibold" htmlFor="news-title-zh">
        {labels.titleZh}
        <input className={field} defaultValue={value("titleZh", values.titleZh)} id="news-title-zh" name="titleZh" required {...fieldProps("titleZh")}/>
        {error("titleZh")}
      </label>
      <label className="text-sm font-semibold md:col-span-2" htmlFor="news-body-en">
        {labels.bodyMdx}
        <textarea className={`${field} min-h-64 resize-y font-mono text-sm`} defaultValue={value("bodyMdx", values.bodyMdx)} id="news-body-en" name="bodyMdx" required rows={16} {...fieldProps("bodyMdx")}/>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{labels.bodyHelp}</p>
        {error("bodyMdx")}
      </label>
      <label className="text-sm font-semibold md:col-span-2" htmlFor="news-body-zh-hk">
        {labels.bodyMdxZhHk}
        <textarea className={`${field} min-h-64 resize-y font-mono text-sm`} defaultValue={value("bodyMdxZhHk", values.bodyMdxZhHk)} id="news-body-zh-hk" name="bodyMdxZhHk" required rows={16} {...fieldProps("bodyMdxZhHk")}/>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{labels.bodyHelp}</p>
        {error("bodyMdxZhHk")}
      </label>
      <label className="flex items-center gap-2 text-sm font-semibold" htmlFor="news-published">
        <input defaultChecked={published} id="news-published" key={`published-${published}`} name="published" type="checkbox"/>
        {labels.published}
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
