import Link from "next/link";

import type {AppLocale} from "@/i18n/routing";
import {adminMemberListHref, type AdminMemberPage} from "@/lib/admin/member-types";
import {localizedPath} from "@/lib/urls";

export type MemberTableLabels = Readonly<{
  search: string; caption: string; empty: string; name: string; email: string; company: string;
  plan: string; status: string; renewal: string; score: string; next: string; previous: string;
  view: string; unavailable: string; planCodes: Readonly<Record<string, string>>;
  statusCodes: Readonly<Record<string, string>>;
}>;
type Props = Readonly<{locale: AppLocale; labels: MemberTableLabels; page: AdminMemberPage;
  query: string; cursor?: string | null; history?: readonly (string | null)[]; limit?: number}>;

export function MemberTable({locale, labels, page, query, cursor = null, history = [], limit = 20}: Props) {
  const prefix = locale === "zh-HK" ? "/zh" : "";
  const current = {search: query, cursor, limit};
  const currentList = adminMemberListHref(prefix, current, history);
  const nextHistory = [...history, cursor].slice(-10);
  const previousCursor = history.length ? history[history.length - 1] ?? null : null;
  const previousHistory = history.slice(0, -1);
  const dateFormatter = new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeZone: "Asia/Hong_Kong"});
  const columns = [labels.name, labels.email, labels.company, labels.plan, labels.status, labels.renewal, labels.score, labels.view];
  return <div className="space-y-6">
    <form action={localizedPath(locale, "/admin/members")} className="flex flex-col gap-3 sm:flex-row" method="get">
      <label className="sr-only" htmlFor="admin-member-search">{labels.search}</label>
      <input className="min-h-11 flex-1 rounded-md border border-input bg-background px-3" defaultValue={query} id="admin-member-search" name="q" placeholder={labels.search} type="search" />
      <button className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90" type="submit">{labels.search}</button>
    </form>
    <div className="overflow-x-auto rounded-md border border-border"><table className="min-w-full text-left text-sm">
      <caption className="caption-top px-4 py-3 text-left font-medium text-foreground">{labels.caption}</caption>
      <thead className="border-y border-border bg-muted/40 text-muted-foreground"><tr>{columns.map((label) => <th className="px-4 py-3 font-medium" key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{page.items.map((member) => {
        const href = `${localizedPath(locale, `/admin/members/${encodeURIComponent(member.profileId)}`)}${currentList.includes("?") ? currentList.slice(currentList.indexOf("?")) : ""}`;
        return <tr className="border-b border-border last:border-0" key={member.profileId}>
          <th className="px-4 py-3 font-medium text-foreground" scope="row"><Link className="rounded-sm text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2" href={href}>{member.displayName}</Link></th>
          <td className="px-4 py-3">{member.email ?? labels.unavailable}</td>
          <td className="px-4 py-3">{member.companyName ?? labels.unavailable}</td>
          <td className="px-4 py-3">{member.planCode ? labels.planCodes[member.planCode] ?? member.planCode : labels.unavailable}</td>
          <td className="px-4 py-3">{member.membershipStatus ? labels.statusCodes[member.membershipStatus] ?? member.membershipStatus : labels.unavailable}</td>
          <td className="px-4 py-3">{member.renewalAt ? <time dateTime={member.renewalAt}>{dateFormatter.format(new Date(member.renewalAt))}</time> : labels.unavailable}</td>
          <td className="px-4 py-3">{member.score ?? labels.unavailable}</td>
          <td className="px-4 py-3"><Link className="rounded-sm text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2" href={href}>{labels.view}</Link></td>
        </tr>;
      })}</tbody>
    </table>{page.items.length === 0 ? <p className="px-4 py-6 text-muted-foreground">{labels.empty}</p> : null}</div>
    {history.length > 0 || page.nextCursor ? <nav aria-label={labels.caption} className="flex justify-between text-sm">
      {history.length > 0 ? <Link className="rounded-md border border-border px-3 py-2 hover:bg-muted focus-visible:outline" href={adminMemberListHref(prefix, {...current, cursor: previousCursor}, previousHistory)}>{labels.previous}</Link> : <span/>}
      {page.nextCursor ? <Link className="rounded-md border border-border px-3 py-2 hover:bg-muted focus-visible:outline" href={adminMemberListHref(prefix, {...current, cursor: page.nextCursor}, nextHistory)}>{labels.next}</Link> : null}
    </nav> : null}
  </div>;
}
