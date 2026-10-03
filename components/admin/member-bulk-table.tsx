"use client";

import {useEffect, useState, useSyncExternalStore} from "react";
import {useRouter} from "next/navigation";

import {prepareAdminBatchAction} from "@/lib/admin/batches/actions";
import type {BatchOperation} from "@/lib/admin/batches/types";
import type {AdminMemberQuery} from "@/lib/admin/member-query";
import {localizedPath} from "@/lib/urls";
import Link from "next/link";

import type {AdminMemberListItem} from "@/lib/admin/member-types";
import type {AppLocale} from "@/i18n/routing";

export type MemberSelectionLabels = Readonly<{page: string; all: string; clear: string; selected: string; row: string; explicitScope: string; allMatchingScope: string; unavailable?: string; exportUnavailable?: string}>;
type TableLabels = Readonly<{name: string; email: string; company: string; plan: string; status: string; renewal: string; score: string; view: string; caption: string; empty: string; unavailable: string; previous: string; next: string; planCodes?: Readonly<Record<string, string>>; statusCodes?: Readonly<Record<string, string>>}>;
export type MemberBatchLabels = Readonly<{preview: string; reason: string; language: string; english: string; chinese: string; error: string; patch?: Readonly<{field: string; tags: string; tagsHelp: string; owner: string; unassigned: string}>; export?: Readonly<{preview: string; fields: string; error: string}>}>;
type ExportField = "displayName" | "email" | "companyName" | "planCode" | "membershipStatus" | "renewalAt" | "locale";
type Props = Readonly<{availableOperations?: readonly BatchOperation[]; ownerOptions?: readonly Readonly<{id: string; name: string}>[]; batchLabels?: MemberBatchLabels; selectionQuery?: AdminMemberQuery; locale: AppLocale; items: readonly AdminMemberListItem[]; totalMatching: number; labels: TableLabels; selectionLabels: MemberSelectionLabels; selectionKey: string; rowHrefs: Readonly<Record<string, string>>; previousHref: string | null; nextHref: string | null}>;

const storageKey = "adminMemberDraftSelection";
const draftChangedEvent = "admin-member-draft-selection-changed";
const emptyDraft = JSON.stringify({key: "", mode: "ids", selectedIds: [], excludedIds: []});
type Draft = Readonly<{key: string; mode: "ids" | "query"; selectedIds: readonly string[]; excludedIds: readonly string[]}>;
function subscribeToDraft(callback: () => void) {
  window.addEventListener(draftChangedEvent, callback);
  window.addEventListener("storage", callback);
  return () => {window.removeEventListener(draftChangedEvent, callback); window.removeEventListener("storage", callback);};
}
function draftSnapshot() {return sessionStorage.getItem(storageKey) ?? emptyDraft;}
function serverDraftSnapshot() {return emptyDraft;}
function writeDraft(draft: Draft | null) {
  if (draft) sessionStorage.setItem(storageKey, JSON.stringify(draft));
  else sessionStorage.removeItem(storageKey);
  window.dispatchEvent(new Event(draftChangedEvent));
}
function validDraft(value: unknown): value is Draft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<Draft>;
  const validIds = (ids: unknown) => Array.isArray(ids) && ids.length <= 5000 && ids.every((id) => typeof id === "string" && id.length > 0 && id.length <= 200);
  return typeof draft.key === "string" && (draft.mode === "ids" || draft.mode === "query") && validIds(draft.selectedIds) && validIds(draft.excludedIds);
}

export function MemberBulkTable({locale, items, totalMatching, labels, selectionLabels, selectionKey, rowHrefs, previousHref, nextHref, batchLabels, selectionQuery, ownerOptions = [], availableOperations = []}: Props) {
  const router = useRouter();
  const canPatch = availableOperations.includes("profile_patch") && Boolean(batchLabels);
  const canExport = availableOperations.includes("export_members") && Boolean(batchLabels?.export);
  const canSelect = canPatch || canExport;
  const [batchLocale, setBatchLocale] = useState<"en" | "zh-HK">("en");
  const [patchField, setPatchField] = useState<"locale" | "tags" | "ownerProfileId">("locale");
  const [batchTags, setBatchTags] = useState("");
  const [batchOwner, setBatchOwner] = useState("");
  const [batchReason, setBatchReason] = useState("");
  const [batchPending, setBatchPending] = useState(false);
  const [batchError, setBatchError] = useState(false);
  const [exportFields, setExportFields] = useState<ExportField[]>(["displayName", "email"]);
  const [exportError, setExportError] = useState(false);
  const snapshot = useSyncExternalStore(subscribeToDraft, draftSnapshot, serverDraftSnapshot);
  let stored: unknown;
  try {stored = JSON.parse(snapshot);} catch {stored = null;}
  const draft = validDraft(stored) && stored.key === selectionKey ? stored : {key: selectionKey, mode: "ids" as const, selectedIds: [], excludedIds: []};
  const {mode, selectedIds, excludedIds} = draft;
  useEffect(() => {
    try {
      const current = JSON.parse(draftSnapshot()) as unknown;
      if (validDraft(current) && current.key && current.key !== selectionKey) writeDraft(null);
    } catch {writeDraft(null);}
  }, [selectionKey]);
  const pageIds = items.map((item) => item.profileId);
  const selected = (id: string) => mode === "query" ? !excludedIds.includes(id) : selectedIds.includes(id);
  const pageSelected = pageIds.length > 0 && pageIds.every(selected);
  const selectedCount = mode === "query" ? Math.max(0, totalMatching - excludedIds.length) : selectedIds.length;
  const format = (template: string, value: string | number, placeholder: "name" | "count") => template.replace(`{${placeholder}}`, String(value));
  const dateFormatter = new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeZone: "Asia/Hong_Kong"});
  const columns = [labels.name, labels.email, labels.company, labels.plan, labels.status, labels.renewal, labels.score, labels.view];
  const toggleRow = (id: string) => {
    if (mode === "query") writeDraft({...draft, excludedIds: excludedIds.includes(id) ? excludedIds.filter((value) => value !== id) : [...excludedIds, id]});
    else writeDraft({...draft, selectedIds: selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id]});
  };
  const togglePage = () => {
    if (mode === "query") writeDraft({...draft, excludedIds: pageSelected ? [...new Set([...excludedIds, ...pageIds])] : excludedIds.filter((id) => !pageIds.includes(id))});
    else writeDraft({...draft, selectedIds: pageSelected ? selectedIds.filter((id) => !pageIds.includes(id)) : [...new Set([...selectedIds, ...pageIds])]});
  };
  const clear = () => writeDraft({...draft, mode: "ids", selectedIds: [], excludedIds: []});
  const preparePreview = async () => {
    if (!canPatch || selectedCount < 1 || batchPending || (mode === "query" && !selectionQuery)) return;
    setBatchPending(true);
    setBatchError(false);
    try {
      const selection = mode === "query"
        ? {mode: "query" as const, query: {...selectionQuery!, cursor: null}, excludedProfileIds: [...excludedIds]}
        : {mode: "ids" as const, profileIds: [...selectedIds]};
      const {batchId} = await prepareAdminBatchAction({operation: "profile_patch", idempotencyKey: crypto.randomUUID(), selection, payload: {patch: patchField === "tags" ? {tags: batchTags.split(",").map((tag) => tag.trim()).filter(Boolean)} : patchField === "ownerProfileId" ? {ownerProfileId: batchOwner || null} : {locale: batchLocale}, reason: batchReason}});
      router.push(localizedPath(locale, `/admin/batches/${batchId}`));
    } catch {setBatchError(true);}
    finally {setBatchPending(false);}
  };

  const fieldLabels: Readonly<Record<ExportField, string>> = {displayName: labels.name, email: labels.email, companyName: labels.company, planCode: labels.plan, membershipStatus: labels.status, renewalAt: labels.renewal, locale: batchLabels?.language ?? ""};
  const prepareExport = async () => {
    if (!canExport || selectedCount < 1 || selectedCount > 5000 || exportFields.length === 0 || batchPending || (mode === "query" && !selectionQuery)) return;
    setBatchPending(true);
    setExportError(false);
    try {
      const selection = mode === "query"
        ? {mode: "query" as const, query: {...selectionQuery!, cursor: null}, excludedProfileIds: [...excludedIds]}
        : {mode: "ids" as const, profileIds: [...selectedIds]};
      const {batchId} = await prepareAdminBatchAction({operation: "export_members", idempotencyKey: crypto.randomUUID(), selection, payload: {fields: exportFields}});
      router.push(localizedPath(locale, `/admin/batches/${batchId}`));
    } catch {setExportError(true);}
    finally {setBatchPending(false);}
  };
  return <div className="space-y-4">
    {canSelect ? <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
      <p aria-live="polite" className="text-sm font-medium" role="status">{format(selectionLabels.selected, selectedCount, "count")}</p>
      <p className="text-xs text-muted-foreground">{mode === "query" ? selectionLabels.allMatchingScope : selectionLabels.explicitScope}</p>
      {totalMatching > items.length && mode === "ids" ? <button className="min-h-11 rounded-md border border-border px-3 text-sm" onClick={() => writeDraft({...draft, mode: "query", excludedIds: []})} type="button">{format(selectionLabels.all, totalMatching, "count")}</button> : null}
      <button className="min-h-11 rounded-md border border-border px-3 text-sm" onClick={clear} type="button">{selectionLabels.clear}</button>
    </div> : selectionLabels.unavailable ? <p className="rounded-md border border-border p-3 text-sm text-muted-foreground" role="status">{selectionLabels.unavailable}</p> : null}
    {canSelect && !canExport && selectionLabels.exportUnavailable ? <p className="text-sm text-muted-foreground">{selectionLabels.exportUnavailable}</p> : null}
    {canPatch && batchLabels ? <div className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3">
      {batchLabels.patch ? <label className="grid gap-1 text-sm">{batchLabels.patch.field}<select className="min-h-11 rounded-md border border-input bg-background px-3" value={patchField} onChange={(event) => setPatchField(event.target.value as typeof patchField)}><option value="locale">{batchLabels.language}</option><option value="tags">{batchLabels.patch.tags}</option><option value="ownerProfileId">{batchLabels.patch.owner}</option></select></label> : null}
      {patchField === "locale" ? <label className="grid gap-1 text-sm">{batchLabels.language}<select className="min-h-11 rounded-md border border-input bg-background px-3" value={batchLocale} onChange={(event) => setBatchLocale(event.target.value as "en" | "zh-HK")}><option value="en">{batchLabels.english}</option><option value="zh-HK">{batchLabels.chinese}</option></select></label> : null}
      {patchField === "tags" && batchLabels.patch ? <div className="grid gap-1"><label className="grid gap-1 text-sm">{batchLabels.patch.tags}<input aria-describedby="batch-tags-help" className="min-h-11 rounded-md border border-input bg-background px-3" maxLength={309} onChange={(event) => setBatchTags(event.target.value)} value={batchTags}/></label><p className="text-xs text-muted-foreground" id="batch-tags-help">{batchLabels.patch.tagsHelp}</p></div> : null}
      {patchField === "ownerProfileId" && batchLabels.patch ? <label className="grid gap-1 text-sm">{batchLabels.patch.owner}<select className="min-h-11 rounded-md border border-input bg-background px-3" value={batchOwner} onChange={(event) => setBatchOwner(event.target.value)}><option value="">{batchLabels.patch.unassigned}</option>{ownerOptions.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></label> : null}
      <label className="grid min-w-64 flex-1 gap-1 text-sm">{batchLabels.reason}<input className="min-h-11 rounded-md border border-input bg-background px-3" maxLength={500} minLength={3} onChange={(event) => setBatchReason(event.target.value)} required type="text" value={batchReason}/></label>
      <button className="min-h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50" disabled={selectedCount === 0 || selectedCount > 5000 || batchPending || batchReason.trim().length < 3} onClick={preparePreview} type="button">{batchLabels.preview}</button>
      {batchError ? <p className="w-full text-sm text-destructive" role="alert">{batchLabels.error}</p> : null}
    </div> : null}
    {canExport && batchLabels?.export ? <div className="space-y-3 rounded-md border border-border p-3">
      <fieldset><legend className="text-sm font-medium">{batchLabels.export.fields}</legend><div className="mt-2 flex flex-wrap gap-3">{(Object.keys(fieldLabels) as ExportField[]).map((field) => <label className="inline-flex min-h-11 items-center gap-2 text-sm" key={field}><input checked={exportFields.includes(field)} onChange={() => setExportFields((current) => current.includes(field) ? current.filter((item) => item !== field) : [...current, field])} type="checkbox"/>{fieldLabels[field]}</label>)}</div></fieldset>
      <button className="min-h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50" disabled={selectedCount === 0 || selectedCount > 5000 || exportFields.length === 0 || batchPending} onClick={prepareExport} type="button">{batchLabels.export.preview}</button>
      {exportError ? <p className="text-sm text-destructive" role="alert">{batchLabels.export.error}</p> : null}
    </div> : null}
    <div className="overflow-x-auto rounded-md border border-border"><table className="min-w-full text-left text-sm">
      <caption className="caption-top px-4 py-3 text-left font-medium text-foreground">{labels.caption}</caption>
      <thead className="border-y border-border bg-muted/40 text-muted-foreground"><tr>{canSelect ? <th className="px-4 py-3" scope="col"><input aria-label={selectionLabels.page} checked={pageSelected} onChange={togglePage} type="checkbox"/></th> : null}{columns.map((label) => <th className="px-4 py-3 font-medium" key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{items.map((member) => <tr className="border-b border-border last:border-0" key={member.profileId}>
        {canSelect ? <td className="px-4 py-3"><input aria-label={format(selectionLabels.row, member.displayName, "name")} checked={selected(member.profileId)} onChange={() => toggleRow(member.profileId)} type="checkbox"/></td> : null}
        <th className="px-4 py-3 font-medium text-foreground" scope="row"><Link className="rounded-sm text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2" href={rowHrefs[member.profileId]}>{member.displayName}</Link></th>
        <td className="px-4 py-3">{member.email ?? labels.unavailable}</td>
        <td className="px-4 py-3">{member.companyName ?? labels.unavailable}</td>
        <td className="px-4 py-3">{member.planCode ? labels.planCodes?.[member.planCode] ?? member.planCode : labels.unavailable}</td>
        <td className="px-4 py-3">{member.membershipStatus ? labels.statusCodes?.[member.membershipStatus] ?? member.membershipStatus : labels.unavailable}</td>
        <td className="px-4 py-3">{member.renewalAt ? <time dateTime={member.renewalAt}>{dateFormatter.format(new Date(member.renewalAt))}</time> : labels.unavailable}</td>
        <td className="px-4 py-3">{member.score ?? labels.unavailable}</td>
        <td className="px-4 py-3"><Link className="rounded-sm text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2" href={rowHrefs[member.profileId]}>{labels.view}</Link></td>
      </tr>)}</tbody>
    </table>{items.length === 0 ? <p className="px-4 py-6 text-muted-foreground">{labels.empty}</p> : null}</div>
    {previousHref || nextHref ? <nav aria-label={labels.caption} className="flex justify-between text-sm">{previousHref ? <Link className="rounded-md border border-border px-3 py-2 hover:bg-muted focus-visible:outline" href={previousHref}>{labels.previous}</Link> : <span/>}{nextHref ? <Link className="rounded-md border border-border px-3 py-2 hover:bg-muted focus-visible:outline" href={nextHref}>{labels.next}</Link> : null}</nav> : null}
  </div>;
}
