"use client";

import {useActionState, useRef, useState} from "react";

import {useAdminUnsavedChanges} from "@/components/admin/unsaved-changes-guard";

import type {PageCopyActionState} from "@/lib/admin/page-copy-action-core";

export type PageCopyField = Readonly<{
  keyPath: string;
  enBundle: string;
  zhBundle: string;
  enField: string;
  zhField: string;
  enValue: string;
  zhValue: string;
}>;

type Labels = Readonly<{
  english: string;
  chinese: string;
  revertHint: string;
  save: string;
  saving: string;
  previewDraft: string; previewPrivate: string; previewEnglish: string; previewChinese: string;
}>;

const initialState: PageCopyActionState = {};

const field = "mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring";

/** Roomier boxes for prose so editors are not typing a paragraph through a slot. */
function rowsFor(...values: readonly string[]): number {
  const longest = Math.max(...values.map((value) => value.length));
  if (longest > 320) return 6;
  if (longest > 120) return 4;
  return 2;
}

export function PageCopyForm({
  action,
  fields,
  labels,
  revision,
}: Readonly<{
  action: (state: PageCopyActionState, formData: FormData) => Promise<PageCopyActionState>;
  fields: readonly PageCopyField[];
  labels: Labels;
  revision: string;
}>) {
  const {setDirty} = useAdminUnsavedChanges();
  const formRef = useRef<HTMLFormElement>(null);
  const [draftPreview, setDraftPreview] = useState<readonly Readonly<{keyPath: string; en: string; zh: string}>[] | null>(null);
  const markEdited = () => {setDirty(true); setDraftPreview(null);};
  const captureDraft = () => {
    if (!formRef.current) return;
    const data = new FormData(formRef.current);
    setDraftPreview(fields.map((entry) => ({
      keyPath: entry.keyPath,
      en: String(data.get(entry.enField) ?? "").trim() || entry.enBundle,
      zh: String(data.get(entry.zhField) ?? "").trim() || entry.zhBundle,
    })));
  };
  const [state, formAction, pending] = useActionState(async (previous: PageCopyActionState, formData: FormData) => {
    const result = await action(previous, formData);
    if (result.status === "success") setDirty(false);
    return result;
  }, initialState);

  return (
    <>
    <form action={formAction} onChange={markEdited} onInput={markEdited} ref={formRef} className="space-y-6" noValidate>
      <input name="revision" type="hidden" value={state.revision ?? revision}/>
      <p className="text-sm text-muted-foreground">{labels.revertHint}</p>
      <ul className="space-y-6">
        {fields.map((entry) => {
          const invalid = Boolean(state.fieldErrors?.[entry.keyPath]);
          const errorId = `${entry.keyPath}-error`;
          const rows = rowsFor(entry.enBundle, entry.zhBundle);
          return (
            <li className="glass-card space-y-3 p-5" key={entry.keyPath}>
              <p className="font-mono text-xs text-muted-foreground">{entry.keyPath}</p>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-semibold" htmlFor={entry.enField}>
                  {labels.english}
                  <textarea
                    aria-describedby={invalid ? errorId : undefined}
                    aria-invalid={invalid}
                    className={field}
                    defaultValue={entry.enValue}
                    id={entry.enField}
                    name={entry.enField}
                    placeholder={entry.enBundle}
                    rows={rows}
                  />
                </label>
                <label className="text-sm font-semibold" htmlFor={entry.zhField}>
                  {labels.chinese}
                  <textarea
                    aria-describedby={invalid ? errorId : undefined}
                    aria-invalid={invalid}
                    className={field}
                    defaultValue={entry.zhValue}
                    id={entry.zhField}
                    name={entry.zhField}
                    placeholder={entry.zhBundle}
                    rows={rows}
                  />
                </label>
              </div>
              {invalid
                ? <p className="text-sm text-destructive" id={errorId} role="alert">{state.fieldErrors?.[entry.keyPath]}</p>
                : null}
            </li>
          );
        })}
      </ul>
      <div className="sticky bottom-0 flex items-center justify-end gap-4 border-t border-border/70 bg-background/95 py-4 backdrop-blur">
        {state.message
          ? <p aria-live="polite" className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>
          : null}
        <button className="inline-flex min-h-11 items-center justify-center rounded-md border px-4 py-2 text-sm font-medium" onClick={captureDraft} type="button">{labels.previewDraft}</button>
        <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60" disabled={pending} type="submit">
          {pending ? labels.saving : labels.save}
        </button>
      </div>
    </form>
    {draftPreview ? <section aria-labelledby="page-copy-draft-preview-title" className="glass-card mt-6 space-y-5 p-6">
      <h2 className="font-serif text-2xl font-semibold" id="page-copy-draft-preview-title">{labels.previewPrivate}</h2>
      <ul className="space-y-5">{draftPreview.map((entry) => <li className="border-t pt-4" key={entry.keyPath}>
        <p className="font-mono text-xs text-muted-foreground">{entry.keyPath}</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div><h3 className="text-sm font-semibold">{labels.previewEnglish}</h3><p className="whitespace-pre-wrap">{entry.en}</p></div>
          <div><h3 className="text-sm font-semibold">{labels.previewChinese}</h3><p className="whitespace-pre-wrap">{entry.zh}</p></div>
        </div>
      </li>)}</ul>
    </section> : null}
    </>
  );
}
