import Link from "next/link";
import {CompanyPicker,type CompanyOption,type CompanySearch} from "@/components/admin/company-picker";

import type {AppLocale} from "@/i18n/routing";
import type {AdminMemberQuery} from "@/lib/admin/member-query";
import {adminMemberListHref} from "@/lib/admin/member-types";
import {memberPresetQueries, type MemberPresetId} from "@/lib/admin/member-view-presets";
import {MEMBERSHIP_PLAN_CODES, MEMBERSHIP_STATUSES} from "@/lib/membership/constants";
import {localizedPath} from "@/lib/urls";

export type MemberFilterLabels = Readonly<{companyEmpty?:string;companyError?:string;companyChoose?:string;companySearching?:string;advanced?:string;status: string; plan: string; renewalFrom: string; renewalTo: string; companyId: string; locale: string; completeness: string; sort: string; apply: string; clear: string; any: string; complete: string; incomplete: string; nameAsc: string; nameDesc: string; renewalAsc: string; english: string; chinese: string; viewsLabel: string; views: Readonly<Record<MemberPresetId, string>>}>;

type Props = Readonly<{locale: AppLocale; query: AdminMemberQuery;companyOptions?:readonly CompanyOption[];companySearch?:CompanySearch;companyReadFailed?:boolean; searchLabel: string; labels: MemberFilterLabels; statusCodes: Readonly<Record<string, string>>; planCodes: Readonly<Record<string, string>>}>;

/** GET controls deliberately omit cursor and history, so changing a filter starts on page one. */
export function MemberFilters({locale, query,companyOptions,companySearch,companyReadFailed,searchLabel, labels, statusCodes, planCodes}: Props) {
  const action = localizedPath(locale, "/admin/members");
  const prefix = locale === "zh-HK" ? "/zh" : "";
  const presets = memberPresetQueries(new Date());
  return <form action={action} className="space-y-4 rounded-md border border-border bg-card p-4" method="get">
    <nav aria-label={labels.viewsLabel} className="flex flex-wrap gap-2">{(Object.keys(presets) as MemberPresetId[]).map((id) => <Link className="rounded-full border border-border px-3 py-1 text-sm hover:bg-muted" href={adminMemberListHref(prefix, presets[id])} key={id}>{labels.views[id]}</Link>)}</nav>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <label className="flex-1 space-y-1 text-sm font-medium" htmlFor="admin-member-search"><span>{searchLabel}</span><input className="min-h-11 w-full rounded-md border border-input bg-background px-3" defaultValue={query.search} id="admin-member-search" name="q" type="search" /></label>
      <button className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" type="submit">{labels.apply}</button>
      <Link className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm" href={action}>{labels.clear}</Link>
    </div>
    <details className="space-y-4 rounded-md border p-3"><summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">{labels.advanced ?? labels.viewsLabel}</summary><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <fieldset className="space-y-1"><legend className="text-sm font-medium">{labels.status}</legend>{MEMBERSHIP_STATUSES.map((value) => <label className="flex min-h-8 items-center gap-2 text-sm" key={value}><input defaultChecked={query.status.includes(value)} name="status" type="checkbox" value={value}/>{statusCodes[value] ?? value}</label>)}</fieldset>
      <fieldset className="space-y-1"><legend className="text-sm font-medium">{labels.plan}</legend>{MEMBERSHIP_PLAN_CODES.map((value) => <label className="flex min-h-8 items-center gap-2 text-sm" key={value}><input defaultChecked={query.planCode.includes(value)} name="planCode" type="checkbox" value={value}/>{planCodes[value] ?? value}</label>)}</fieldset>
      <div className="space-y-3"><label className="block space-y-1 text-sm font-medium"><span>{labels.renewalFrom}</span><input className="min-h-11 w-full rounded-md border border-input bg-background px-3" defaultValue={query.renewalFrom ?? ""} name="renewalFrom" type="date" /></label><label className="block space-y-1 text-sm font-medium"><span>{labels.renewalTo}</span><input className="min-h-11 w-full rounded-md border border-input bg-background px-3" defaultValue={query.renewalTo ?? ""} name="renewalTo" type="date" /></label></div>
      <div className="space-y-3"><CompanyPicker key={query.companyId??"any"} value={query.companyId} options={companyOptions} search={companySearch} unavailable={companyReadFailed} labels={{company:labels.companyId,empty:labels.companyEmpty??labels.any,error:labels.companyError??labels.companyId,choose:labels.companyChoose??labels.apply,searching:labels.companySearching??labels.companyId}}/><label className="block space-y-1 text-sm font-medium"><span>{labels.locale}</span><select className="min-h-11 w-full rounded-md border border-input bg-background px-3" defaultValue={query.locale ?? ""} name="locale"><option value="">{labels.any}</option><option value="en">{labels.english}</option><option value="zh-HK">{labels.chinese}</option></select></label></div>
    </div>
    <div className="flex flex-wrap gap-4"><label className="space-y-1 text-sm font-medium"><span>{labels.completeness}</span><select className="block min-h-11 rounded-md border border-input bg-background px-3" defaultValue={query.completeness} name="completeness"><option value="any">{labels.any}</option><option value="complete">{labels.complete}</option><option value="incomplete">{labels.incomplete}</option></select></label><label className="space-y-1 text-sm font-medium"><span>{labels.sort}</span><select className="block min-h-11 rounded-md border border-input bg-background px-3" defaultValue={query.sort} name="sort"><option value="name_asc">{labels.nameAsc}</option><option value="name_desc">{labels.nameDesc}</option><option value="renewal_asc">{labels.renewalAsc}</option></select></label></div>
    </details>
    {query.limit !== 20 ? <input name="limit" type="hidden" value={query.limit}/> : null}
  </form>;
}
