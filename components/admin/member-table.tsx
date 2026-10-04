import type {CompanyOption,CompanySearch} from "@/components/admin/company-picker";
import type {BatchOperation} from "@/lib/admin/batches/types";
import {MemberBulkTable, type MemberSelectionLabels, type MemberBatchLabels} from "@/components/admin/member-bulk-table";
import {MemberFilters, type MemberFilterLabels} from "@/components/admin/member-filters";
import type {AppLocale} from "@/i18n/routing";
import {adminMemberQuerySchema, type AdminMemberQuery} from "@/lib/admin/member-query";
import {adminMemberListHref, type AdminMemberPage} from "@/lib/admin/member-types";
import {localizedPath} from "@/lib/urls";

export type MemberTableLabels = Readonly<{
  search: string; caption: string; empty: string; name: string; email: string; company: string;
  plan: string; status: string; renewal: string; score: string; next: string; previous: string;
  view: string; unavailable: string; planCodes: Readonly<Record<string, string>>;
  statusCodes: Readonly<Record<string, string>>; filters?: MemberFilterLabels; selection: MemberSelectionLabels; batch?: MemberBatchLabels;
}>;
type Props = Readonly<{companyOptions?:readonly CompanyOption[];companySearch?:CompanySearch;companyReadFailed?:boolean;availableOperations?: readonly BatchOperation[]; ownerOptions?: readonly Readonly<{id: string; name: string}>[]; locale: AppLocale; labels: MemberTableLabels; page: AdminMemberPage;
  query: string; filters?: AdminMemberQuery; cursor?: string | null; history?: readonly (string | null)[]; limit?: number}>;

export function MemberTable({companyOptions,companySearch,companyReadFailed,locale, labels, page, query, filters, cursor = null, history = [], limit, ownerOptions, availableOperations}: Props) {
  const prefix = locale === "zh-HK" ? "/zh" : "";
  const base = filters ?? adminMemberQuerySchema.parse({search: query});
  const current = {...base, search: query, cursor, limit: limit ?? base.limit};
  const currentList = adminMemberListHref(prefix, current, history);
  const suffix = currentList.includes("?") ? currentList.slice(currentList.indexOf("?")) : "";
  const rowHrefs = Object.fromEntries(page.items.map((member) => [member.profileId,
    `${localizedPath(locale, `/admin/members/${encodeURIComponent(member.profileId)}`)}${suffix}`]));
  const previousHref = history.length ? adminMemberListHref(prefix, {...current, cursor: history[history.length - 1] ?? null}, history.slice(0, -1)) : null;
  const nextHref = page.nextCursor ? adminMemberListHref(prefix, {...current, cursor: page.nextCursor}, [...history, cursor].slice(-10)) : null;
  const selectionKey = JSON.stringify({...current, cursor: null, limit: null});
  return <div className="space-y-6">
    {labels.filters ? <MemberFilters key={JSON.stringify({...filters,search:query,cursor:null})} companyOptions={companyOptions} companySearch={companySearch} companyReadFailed={companyReadFailed} locale={locale} query={current} searchLabel={labels.search} labels={labels.filters} statusCodes={labels.statusCodes} planCodes={labels.planCodes}/> : <form action={localizedPath(locale, "/admin/members")} className="flex flex-col gap-3 sm:flex-row" method="get"><label className="sr-only" htmlFor="admin-member-search">{labels.search}</label><input className="min-h-11 flex-1 rounded-md border border-input bg-background px-3" defaultValue={query} id="admin-member-search" name="q" placeholder={labels.search} type="search" /><button className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" type="submit">{labels.search}</button></form>}
    <MemberBulkTable availableOperations={availableOperations} ownerOptions={ownerOptions} key={selectionKey} locale={locale} items={page.items} totalMatching={page.totalMatching} labels={labels} selectionLabels={labels.selection} selectionKey={selectionKey} selectionQuery={{...current, cursor: null}} batchLabels={labels.batch} rowHrefs={rowHrefs} previousHref={previousHref} nextHref={nextHref}/>
  </div>;
}
