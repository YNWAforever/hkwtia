"use client";

import {useEffect, useSyncExternalStore} from "react";
import Link from "next/link";

import type {AdminMemberListItem} from "@/lib/admin/member-types";
import type {AppLocale} from "@/i18n/routing";

export type MemberSelectionLabels = Readonly<{page: string; all: string; clear: string; selected: string; row: string}>;
type TableLabels = Readonly<{name: string; email: string; company: string; plan: string; status: string; renewal: string; score: string; view: string; caption: string; empty: string; unavailable: string; previous: string; next: string; planCodes?: Readonly<Record<string, string>>; statusCodes?: Readonly<Record<string, string>>}>;
type Props = Readonly<{locale: AppLocale; items: readonly AdminMemberListItem[]; totalMatching: number; labels: TableLabels; selectionLabels: MemberSelectionLabels; selectionKey: string; rowHrefs: Readonly<Record<string, string>>; previousHref: string | null; nextHref: string | null}>;

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

export function MemberBulkTable({locale, items, totalMatching, labels, selectionLabels, selectionKey, rowHrefs, previousHref, nextHref}: Props) {
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

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
      <p aria-live="polite" className="text-sm font-medium" role="status">{format(selectionLabels.selected, selectedCount, "count")}</p>
      {totalMatching > items.length && mode === "ids" ? <button className="min-h-11 rounded-md border border-border px-3 text-sm" onClick={() => writeDraft({...draft, mode: "query", excludedIds: []})} type="button">{format(selectionLabels.all, totalMatching, "count")}</button> : null}
      <button className="min-h-11 rounded-md border border-border px-3 text-sm" onClick={clear} type="button">{selectionLabels.clear}</button>
    </div>
    <div className="overflow-x-auto rounded-md border border-border"><table className="min-w-full text-left text-sm">
      <caption className="caption-top px-4 py-3 text-left font-medium text-foreground">{labels.caption}</caption>
      <thead className="border-y border-border bg-muted/40 text-muted-foreground"><tr><th className="px-4 py-3" scope="col"><input aria-label={selectionLabels.page} checked={pageSelected} onChange={togglePage} type="checkbox"/></th>{columns.map((label) => <th className="px-4 py-3 font-medium" key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{items.map((member) => <tr className="border-b border-border last:border-0" key={member.profileId}>
        <td className="px-4 py-3"><input aria-label={format(selectionLabels.row, member.displayName, "name")} checked={selected(member.profileId)} onChange={() => toggleRow(member.profileId)} type="checkbox"/></td>
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
