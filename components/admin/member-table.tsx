import Link from "next/link";

import type {AppLocale} from "@/i18n/routing";
import type {AdminMemberPage} from "@/lib/admin/member-types";
import {localizedPath} from "@/lib/urls";

export type MemberTableLabels = Readonly<{search: string; caption: string; empty: string; name: string; email: string; company: string; plan: string; status: string; renewal: string; score: string; next: string; unavailable: string}>;
type Props = Readonly<{locale: AppLocale; labels: MemberTableLabels; page: AdminMemberPage; query: string}>;

function pageHref(locale: AppLocale, query: string, cursor: string): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  params.set("cursor", cursor);
  return `${localizedPath(locale, "/admin/members")}?${params.toString()}`;
}

export function MemberTable({locale, labels, page, query}: Props) {
  const columns = [labels.name, labels.email, labels.company, labels.plan, labels.status, labels.renewal, labels.score];
  return <div className="space-y-6">
    <form action={localizedPath(locale, "/admin/members")} className="flex flex-col gap-3 sm:flex-row" method="get"><label className="sr-only" htmlFor="admin-member-search">{labels.search}</label><input className="min-h-11 flex-1 rounded-md border border-input bg-background px-3" defaultValue={query} id="admin-member-search" name="q" placeholder={labels.search} type="search" /><button className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90" type="submit">{labels.search}</button></form>
    <div className="overflow-x-auto rounded-md border border-border"><table className="min-w-full text-left text-sm"><caption className="caption-top px-4 py-3 text-left font-medium text-foreground">{labels.caption}</caption><thead className="border-y border-border bg-muted/40 text-muted-foreground"><tr>{columns.map((label) => <th className="px-4 py-3 font-medium" key={label} scope="col">{label}</th>)}</tr></thead><tbody>{page.items.map((member) => <tr className="border-b border-border last:border-0" key={member.profileId}><th className="px-4 py-3 font-medium text-foreground" scope="row">{member.displayName}</th><td className="px-4 py-3">{member.email ?? labels.unavailable}</td><td className="px-4 py-3">{member.companyName ?? labels.unavailable}</td><td className="px-4 py-3">{member.planCode ?? labels.unavailable}</td><td className="px-4 py-3">{member.membershipStatus ?? labels.unavailable}</td><td className="px-4 py-3">{member.renewalAt ?? labels.unavailable}</td><td className="px-4 py-3">{member.score ?? labels.unavailable}</td></tr>)}</tbody></table>{page.items.length === 0 ? <p className="px-4 py-6 text-muted-foreground">{labels.empty}</p> : null}</div>
    {page.nextCursor ? <nav aria-label={labels.caption} className="flex justify-end text-sm"><Link className="rounded-md border border-border px-3 py-2 hover:bg-muted" href={pageHref(locale, query, page.nextCursor)}>{labels.next}</Link></nav> : null}
  </div>;
}
