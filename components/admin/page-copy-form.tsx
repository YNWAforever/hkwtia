"use client";

import {useActionState, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore} from "react";

import {useAdminUnsavedChanges} from "@/components/admin/unsaved-changes-guard";

import {discardLocalCopyDraft, localCopyDraftKey, parseLocalCopyDraft, writeLocalCopyDraft, type LocalCopyDraft, type LocalCopyDraftLabels} from "@/lib/admin/page-copy-local-draft";
import type {PageCopyNamespace} from "@/lib/i18n/page-copy-scope";

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
  workspace?: Readonly<{block: string; search: string; changedOnly: string; previous: string; next: string; reset: string; empty: string}>;
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

const storageEvent = "hkwtia:cms-draft-changed";
const unavailableSnapshot = "!storage-unavailable";
function subscribeToDrafts(listener: () => void): () => void {
  window.addEventListener(storageEvent, listener);
  window.addEventListener("storage", listener);
  return () => { window.removeEventListener(storageEvent, listener); window.removeEventListener("storage", listener); };
}
const serverDraftSnapshot = () => null;

export function PageCopyForm({
  action,
  fields,
  labels,
  revision,
  localDraft,
  serverDraft,
  publishedBaseline,
}: Readonly<{
  action: (state: PageCopyActionState, formData: FormData) => Promise<PageCopyActionState>;
  fields: readonly PageCopyField[];
  labels: Labels;
  revision: string;
  publishedBaseline?: Readonly<Record<string,string>>;
  serverDraft?: Readonly<{id: string | null; revision: string | null; stale: boolean; previewBase: string; history: readonly {id: string; label: string}[];
    labels: Readonly<{save: string; publish: string; private: string; preview: string; history: string; restore: string; previousCopy: string; restored: string; stale: string; rebase: string; current: string}>}>;
  localDraft?: Readonly<{identity: string; namespace: PageCopyNamespace; labels: LocalCopyDraftLabels}>;
}>) {
  const {setDirty} = useAdminUnsavedChanges();
  const formRef = useRef<HTMLFormElement>(null);
  const [draftPreview, setDraftPreview] = useState<readonly Readonly<{keyPath: string; en: string; zh: string}>[] | null>(null);
  const draftNamespace = localDraft?.namespace;
  const storageKey = localDraft ? localCopyDraftKey(localDraft.identity, localDraft.namespace) : null;
  const [recoveryDismissed, setRecoveryDismissed] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [storageFailed, setStorageFailed] = useState(false);
  const blocks = useMemo(() => [...new Set(fields.map(entry => entry.keyPath.split(".")[0]!))], [fields]);
  const [block, setBlock] = useState(blocks[0] ?? "");
  const [search, setSearch] = useState("");
  const [changedOnly, setChangedOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.flatMap(entry => [[entry.enField, entry.enValue], [entry.zhField, entry.zhValue]])));
  const initialValues = Object.fromEntries(fields.flatMap(entry => [[entry.enField, entry.enValue], [entry.zhField, entry.zhValue]]));
  const publishedValues = publishedBaseline ?? initialValues;
  const baseline = useRef<Record<string, string>>(initialValues);
  const matchingFields = fields.filter(entry => (!block || entry.keyPath.split(".")[0] === block)
    && (!changedOnly || values[entry.enField] !== publishedValues[entry.enField] || values[entry.zhField] !== publishedValues[entry.zhField])
    && (!search.trim() || [entry.keyPath, entry.enBundle, entry.zhBundle, values[entry.enField], values[entry.zhField]].some(value => value?.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))));
  const pageCount = Math.max(1, Math.ceil(matchingFields.length / 20));
  const visibleFields = matchingFields.slice(Math.min(page, pageCount - 1) * 20, (Math.min(page, pageCount - 1) + 1) * 20);
  const visibleKeys = new Set(visibleFields.map(entry => entry.keyPath));
  const baseRevision = useRef(revision);
  const allowedFields = useMemo(() => new Set(fields.flatMap(entry => [entry.enField, entry.zhField])), [fields]);
  const getSnapshot = useCallback(() => {
    if (!storageKey) return null;
    try { return window.sessionStorage.getItem(storageKey); } catch { return unavailableSnapshot; }
  }, [storageKey]);
  const snapshot = useSyncExternalStore(subscribeToDrafts, getSnapshot, serverDraftSnapshot);
  const storedDraft = useMemo(() => snapshot && snapshot !== unavailableSnapshot && draftNamespace
    ? parseLocalCopyDraft(snapshot, draftNamespace, allowedFields) : null, [snapshot, draftNamespace, allowedFields]);
  const recovery = recoveryDismissed ? null : storedDraft;
  const readValues = (data: FormData): Record<string, string> => Object.fromEntries(fields.flatMap(entry =>
    [entry.enField, entry.zhField].map(name => [name, String(data.get(name) ?? "")])));
  const persist = (values: Record<string, string>) => {
    if (!storageKey || !localDraft) return;
    const changes = Object.fromEntries(Object.entries(values).filter(([name, value]) => value !== baseline.current[name]));
    const draft: LocalCopyDraft = {schemaVersion: 1, namespace: localDraft.namespace, baseRevision: baseRevision.current,
      updatedAt: new Date().toISOString(), changes};
    let saved = false;
    try { saved = writeLocalCopyDraft(window.sessionStorage, storageKey, draft, allowedFields); } catch { /* Storage access itself can be denied. */ }
    window.dispatchEvent(new Event(storageEvent));
    setStorageFailed(!saved);
    setSavedAt(saved && Object.keys(changes).length ? draft.updatedAt : null);
  };
  useEffect(() => () => setDirty(false), [setDirty]);
  const markEdited = () => {
    setDirty(true); setDraftPreview(null); setRecoveryDismissed(true);
    if (formRef.current) {
      const current = readValues(new FormData(formRef.current));
      setValues(current); persist(current);
    }
  };
  const discard = () => {
    let cleared = true;
    try { if (storageKey) cleared = discardLocalCopyDraft(window.sessionStorage, storageKey); } catch { cleared = false; }
    window.dispatchEvent(new Event(storageEvent));
    setStorageFailed(!cleared); setRecoveryDismissed(true); setSavedAt(null);
  };
  const discardChanges = () => {
    discard();
    setValues(baseline.current);
    setDirty(false); setDraftPreview(null);
  };
  const restore = () => {
    if (!recovery || recovery.baseRevision !== baseRevision.current || !draftNamespace) return;
    if (!parseLocalCopyDraft(JSON.stringify(recovery), draftNamespace, allowedFields)) { discard(); return; }
    setValues(current => ({...current, ...recovery.changes}));
    setSavedAt(recovery.updatedAt); setRecoveryDismissed(true); setDirty(true); setDraftPreview(null);
  };
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
    if (result.status === "success") {
      baseline.current = result.values ? {...result.values} : readValues(formData);
      if (result.values) setValues({...result.values});
      baseRevision.current = result.revision ?? baseRevision.current;
      const current = result.values ? baseline.current : formRef.current ? readValues(new FormData(formRef.current)) : baseline.current;
      const changedDuringSave = Object.entries(current).some(([name, value]) => value !== baseline.current[name]);
      setDirty(changedDuringSave);
      if (changedDuringSave) persist(current); else discard();
    }
    return result;
  }, initialState);

  return (
    <>
    {localDraft ? <section className="rounded-md border border-border p-4 space-y-3" aria-live="polite">
      {storageFailed || snapshot === unavailableSnapshot ? <p className="text-sm text-destructive" role="alert">{localDraft.labels.unavailable}</p> : null}
      {savedAt ? <p className="text-sm text-muted-foreground">{localDraft.labels.saved.replace("{time}", new Date(savedAt).toLocaleTimeString())}</p> : null}
      {savedAt && !recovery ? <button className="min-h-11 rounded-md border px-3" onClick={discardChanges} type="button">{localDraft.labels.discard}</button> : null}
      {recovery ? <>
        <p>{recovery.baseRevision === revision ? localDraft.labels.available : localDraft.labels.conflict}</p>
        <div className="flex gap-3">
          {recovery.baseRevision === revision ? <button className="min-h-11 rounded-md border px-3" onClick={restore} type="button">{localDraft.labels.restore}</button> : null}
          <button className="min-h-11 rounded-md border px-3" onClick={discardChanges} type="button">{localDraft.labels.discard}</button>
        </div>
        {recovery.baseRevision !== revision ? <details><summary className="cursor-pointer py-2">{localDraft.labels.compare}</summary>
          <ul className="space-y-3">{Object.entries(recovery.changes).map(([name, value]) => <li key={name}>
            <p className="font-mono text-xs">{name}</p><p>{localDraft.labels.current}: {publishedValues[name]}</p>
            <p className="whitespace-pre-wrap">{localDraft.labels.draft}: <span>{value}</span></p>
          </li>)}</ul>
        </details> : null}
      </> : null}
    </section> : null}
      {labels.workspace ? <fieldset className="flex flex-wrap items-end gap-4 rounded-md border p-4">
        <label className="text-sm">{labels.workspace.block}<select className={field} value={block} onChange={event => {setBlock(event.target.value); setPage(0);}}>
          {blocks.map(key => <option key={key} value={key}>{key}</option>)}
        </select></label>
        <label className="text-sm flex-1">{labels.workspace.search}<input className={field} type="search" value={search} onChange={event => {setSearch(event.target.value); setPage(0);}} /></label>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={changedOnly} onChange={event => {setChangedOnly(event.target.checked); setPage(0);}} />{labels.workspace.changedOnly}</label>
      </fieldset> : null}
    <form action={formAction} ref={formRef} className="space-y-6" noValidate>
      <input name="revision" type="hidden" value={state.revision ?? revision}/>
      {serverDraft ? <>
        <input type="hidden" name="draftRevision" value={state.draftRevision !== undefined ? state.draftRevision ?? "" : serverDraft.revision ?? ""} />
        <p className="text-sm text-muted-foreground">{serverDraft.labels.private}</p>
        {serverDraft.stale ? <section className="space-y-3 rounded-md border border-destructive p-4"><p role="alert">{serverDraft.labels.stale}</p>
          <button type="submit" name="intent" value="rebase" disabled={pending} className="min-h-11 rounded-md border px-3">{serverDraft.labels.rebase}</button>
        </section> : null}
        {serverDraft.previewBase && (state.draftId !== undefined ? state.draftId : serverDraft.id) ? <a className="inline-flex min-h-11 items-center underline" href={serverDraft.previewBase + (state.draftId ?? serverDraft.id)} target="_blank" rel="noopener noreferrer">{serverDraft.labels.preview}</a> : null}
        {serverDraft.history.length ? <fieldset className="flex flex-wrap items-end gap-3 rounded-md border p-4">
          <label className="text-sm">{serverDraft.labels.history}<select className={field} name="publicationId">{serverDraft.history.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="restorePrevious" value="yes" />{serverDraft.labels.previousCopy}</label>
          <button type="submit" name="intent" value="restore" disabled={pending} className="min-h-11 rounded-md border px-3">{serverDraft.labels.restore}</button>
        </fieldset> : null}
      </> : null}
      <p className="text-sm text-muted-foreground">{labels.revertHint}</p>
      {fields.filter(entry => !visibleKeys.has(entry.keyPath)).map(entry => <span key={entry.keyPath}>
        <input type="hidden" name={entry.enField} value={values[entry.enField] ?? entry.enValue} />
        <input type="hidden" name={entry.zhField} value={values[entry.zhField] ?? entry.zhValue} />
      </span>)}
      {!visibleFields.length && labels.workspace ? <p role="status">{labels.workspace.empty}</p> : null}
      <ul className="space-y-6">
        {visibleFields.map((entry) => {
          const invalid = Boolean(state.fieldErrors?.[entry.keyPath]);
          const errorId = `${entry.keyPath}-error`;
          const rows = rowsFor(entry.enBundle, entry.zhBundle);
          return (
            <li className="glass-card space-y-3 p-5" key={entry.keyPath}>
              <p className="font-mono text-xs text-muted-foreground">{entry.keyPath}</p>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-semibold" htmlFor={entry.enField}>
                  {labels.english}
                  {serverDraft?.stale ? <span className="block text-xs font-normal">{serverDraft.labels.current}: {publishedValues[entry.enField] || entry.enBundle}</span> : null}
                  <textarea
                    aria-label={fields.length > 1 ? `${labels.english} · ${entry.keyPath}` : undefined}
                    aria-describedby={invalid ? errorId : undefined}
                    aria-invalid={invalid}
                    className={field}
                    value={values[entry.enField] ?? entry.enValue}
                    onChange={markEdited}
                    id={entry.enField}
                    name={entry.enField}
                    placeholder={entry.enBundle}
                    rows={rows}
                  />
                </label>
                <label className="text-sm font-semibold" htmlFor={entry.zhField}>
                  {labels.chinese}
                  {serverDraft?.stale ? <span className="block text-xs font-normal">{serverDraft.labels.current}: {publishedValues[entry.zhField] || entry.zhBundle}</span> : null}
                  <textarea
                    aria-label={fields.length > 1 ? `${labels.chinese} · ${entry.keyPath}` : undefined}
                    aria-describedby={invalid ? errorId : undefined}
                    aria-invalid={invalid}
                    className={field}
                    value={values[entry.zhField] ?? entry.zhValue}
                    onChange={markEdited}
                    id={entry.zhField}
                    name={entry.zhField}
                    placeholder={entry.zhBundle}
                    rows={rows}
                  />
                </label>
              </div>
              {labels.workspace ? <button type="button" className="min-h-11 rounded-md border px-3 text-sm" onClick={() => {
                const next = {...values, [entry.enField]: "", [entry.zhField]: ""}; setValues(next); setDirty(true); setRecoveryDismissed(true); setDraftPreview(null); persist(next);
              }}>{labels.workspace.reset}</button> : null}
              {invalid
                ? <p className="text-sm text-destructive" id={errorId} role="alert">{state.fieldErrors?.[entry.keyPath]}</p>
                : null}
            </li>
          );
        })}
      </ul>
      {labels.workspace && pageCount > 1 ? <nav className="flex items-center justify-between gap-3" aria-label={labels.workspace.block}>
        <button type="button" className="min-h-11 rounded-md border px-3" disabled={page === 0} onClick={() => setPage(value => Math.max(0, value - 1))}>{labels.workspace.previous}</button>
        <span>{Math.min(page + 1, pageCount)} / {pageCount}</span>
        <button type="button" className="min-h-11 rounded-md border px-3" disabled={page >= pageCount - 1} onClick={() => setPage(value => value + 1)}>{labels.workspace.next}</button>
      </nav> : null}
      <div className="sticky bottom-0 flex items-center justify-end gap-4 border-t border-border/70 bg-background/95 py-4 backdrop-blur">
        {state.message
          ? <p aria-live="polite" className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>
          : null}
        <button className="inline-flex min-h-11 items-center justify-center rounded-md border px-4 py-2 text-sm font-medium" onClick={captureDraft} type="button">{labels.previewDraft}</button>
        {serverDraft ? <button type="submit" name="intent" value="draft" disabled={pending || serverDraft.stale} className="min-h-11 rounded-md border px-4 py-2">{serverDraft.labels.save}</button> : null}
        <button name="intent" value={serverDraft ? "publish" : "legacy"} className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60" disabled={pending || Boolean(serverDraft?.stale)} type="submit">
          {pending ? labels.saving : serverDraft ? serverDraft.labels.publish : labels.save}
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
