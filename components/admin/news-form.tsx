"use client";

import {ContentDraftPanel, type ContentAssistance} from "@/components/admin/content-draft-panel";
import {useActionState, useRef, useState} from "react";

import {SafeStructuredContent} from "@/components/content/safe-structured-content";
import {useAdminUnsavedChanges} from "@/components/admin/unsaved-changes-guard";

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
  saveDraft: string;
  savePublish: string;
  previewDraft: string;
  previewPrivate: string;
  previewEnglish: string;
  previewChinese: string;
}>;

type Values = Partial<Readonly<{
  slug: string;
  titleEn: string;
  titleZh: string;
  author: string;
  bodyMdx: string;
  bodyMdxZhHk: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
}>>;

const initialState: NewsActionState = {};

export function NewsForm({
  action,
  labels,
  values = {},
  assistance,
}: Readonly<{
  action: (state: NewsActionState, formData: FormData) => Promise<NewsActionState>;
  labels: Labels;
  assistance?: ContentAssistance;
  values?: Values;
}>) {
  const {setDirty} = useAdminUnsavedChanges();
  const formRef = useRef<HTMLFormElement>(null);
  const [publishOnSave, setPublishOnSave] = useState(values.publishedAt != null);
  const [draftPreview, setDraftPreview] = useState<Readonly<{
    titleEn: string; titleZh: string; bodyEn: string; bodyZh: string;
  }> | null>(null);
  const copyDirtyRef = useRef(false);
  const [copyDirty, setCopyDirty] = useState(false);
  const markEdited = () => {copyDirtyRef.current = true;setCopyDirty(true); setDirty(true); setDraftPreview(null);};
  const adoptCopy = (locale: "en" | "zh-HK", body: string) => {
    if(copyDirtyRef.current) return false;
    const element = formRef.current?.elements.namedItem(locale === "en" ? "bodyMdx" : "bodyMdxZhHk");
    if (!(element instanceof HTMLTextAreaElement)) return false;
    element.value = body;
    markEdited();
    return true;
  };
  const captureDraft = () => {
    if (!formRef.current) return;
    const fields = new FormData(formRef.current);
    const read = (name: string) => String(fields.get(name) ?? "");
    setDraftPreview({
      titleEn: read("titleEn"), titleZh: read("titleZh"),
      bodyEn: read("bodyMdx"), bodyZh: read("bodyMdxZhHk"),
    });
  };
  const [state, formAction, pending] = useActionState(async (previous: NewsActionState, formData: FormData) => {
    const result = await action(previous, formData);
    if (result.status === "success") {setDirty(false);setCopyDirty(false);copyDirtyRef.current=false;}
    return result;
  }, initialState);

  // Echoed submission values win over the stored row so a failed save never
  // discards what the author typed.
  const value = (name: keyof Values, fallback?: string | null) =>
    state.values?.[name] ?? fallback ?? "";
  const error = (name: string) =>
    state.fieldErrors?.[name]
      ? <p className="text-sm text-destructive" id={`${name}-error`} role="alert">{state.fieldErrors[name]}</p>
      : null;
  // Inputs are uncontrolled, so a changing key remounts them with the echo.
  const fieldKey = (name: string) => state.values?.[name] !== undefined ? `${name}-${state.values[name]}` : undefined;
  const fieldProps = (name: string) => ({
    "aria-invalid": Boolean(state.fieldErrors?.[name]),
    "aria-describedby": state.fieldErrors?.[name] ? `${name}-error` : undefined,
  });
  const published = state.values?.published !== undefined
    ? state.values.published === "on"
    : values.publishedAt != null;

  const field = "mt-2 block min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring";

  return (
    <>
    <form action={formAction} onChange={markEdited} onInput={markEdited} ref={formRef} className="glass-card grid gap-4 p-6 md:grid-cols-2" noValidate>
      {values.updatedAt ? <input name="expectedUpdatedAt" type="hidden" value={state.revision ?? values.updatedAt.toISOString()}/> : null}
      <label className="text-sm font-semibold" htmlFor="news-slug">
        {labels.slug}
        <input className={field} defaultValue={value("slug", values.slug)} id="news-slug" name="slug" required key={fieldKey("slug")} {...fieldProps("slug")}/>
        {error("slug")}
      </label>
      <label className="text-sm font-semibold" htmlFor="news-author">
        {labels.author}
        <input className={field} defaultValue={value("author", values.author)} id="news-author" name="author" required key={fieldKey("author")} {...fieldProps("author")}/>
        {error("author")}
      </label>
      <label className="text-sm font-semibold" htmlFor="news-title-en">
        {labels.titleEn}
        <input className={field} defaultValue={value("titleEn", values.titleEn)} id="news-title-en" name="titleEn" required key={fieldKey("titleEn")} {...fieldProps("titleEn")}/>
        {error("titleEn")}
      </label>
      <label className="text-sm font-semibold" htmlFor="news-title-zh">
        {labels.titleZh}
        <input className={field} defaultValue={value("titleZh", values.titleZh)} id="news-title-zh" name="titleZh" required key={fieldKey("titleZh")} {...fieldProps("titleZh")}/>
        {error("titleZh")}
      </label>
      <label className="text-sm font-semibold md:col-span-2" htmlFor="news-body-en">
        {labels.bodyMdx}
        <textarea className={`${field} min-h-64 resize-y font-mono text-sm`} defaultValue={value("bodyMdx", values.bodyMdx)} id="news-body-en" name="bodyMdx" required rows={16} key={fieldKey("bodyMdx")} {...fieldProps("bodyMdx")}/>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{labels.bodyHelp}</p>
        {error("bodyMdx")}
      </label>
      <label className="text-sm font-semibold md:col-span-2" htmlFor="news-body-zh-hk">
        {labels.bodyMdxZhHk}
        <textarea className={`${field} min-h-64 resize-y font-mono text-sm`} defaultValue={value("bodyMdxZhHk", values.bodyMdxZhHk)} id="news-body-zh-hk" name="bodyMdxZhHk" required rows={16} key={fieldKey("bodyMdxZhHk")} {...fieldProps("bodyMdxZhHk")}/>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{labels.bodyHelp}</p>
        {error("bodyMdxZhHk")}
      </label>
      <label className="flex items-center gap-2 text-sm font-semibold" htmlFor="news-published">
        <input defaultChecked={published} id="news-published" key={`published-${published}`} onChange={(event) => setPublishOnSave(event.currentTarget.checked)} name="published" type="checkbox"/>
        {labels.published}
      </label>
    {assistance ? <ContentDraftPanel value={assistance} dirty={copyDirty} onAdopt={adoptCopy}/> : null}
      <div className="flex items-center justify-end gap-4 md:col-span-2">
        {state.message
          ? <p aria-live="polite" className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>
          : null}
        <button className="inline-flex min-h-11 items-center justify-center rounded-md border px-4 py-2 text-sm font-medium" onClick={captureDraft} type="button">{labels.previewDraft}</button>
        <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60" disabled={pending} type="submit">
          {pending ? labels.saving : publishOnSave ? (values.publishedAt ? labels.save : labels.savePublish) : labels.saveDraft}
        </button>
      </div>
    </form>
    {draftPreview ? <section aria-labelledby="news-draft-preview-title" className="glass-card space-y-5 p-6">
      <h2 className="font-serif text-2xl font-semibold" id="news-draft-preview-title">{labels.previewPrivate}</h2>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">{labels.previewEnglish}</h3>
          <h4 className="font-serif text-xl font-semibold">{draftPreview.titleEn}</h4>
          <SafeStructuredContent content={draftPreview.bodyEn} mode="build-log" tableHeaders={{kpi: "", value: ""}}/>
        </section>
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">{labels.previewChinese}</h3>
          <h4 className="font-serif text-xl font-semibold">{draftPreview.titleZh}</h4>
          <SafeStructuredContent content={draftPreview.bodyZh} mode="build-log" tableHeaders={{kpi: "", value: ""}}/>
        </section>
      </div>
    </section> : null}
    </>
  );
}
