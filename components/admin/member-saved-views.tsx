import {PrivateLink as Link} from "@/components/internal-shell/private-link";

import {MemberSavedViewForm} from "@/components/admin/member-saved-view-form";
import type {AppLocale} from "@/i18n/routing";
import type {AdminMemberQuery} from "@/lib/admin/member-query";
import {adminMemberListHref} from "@/lib/admin/member-types";
import type {MemberViewRecord} from "@/lib/admin/member-views";

export type MemberSavedViewLabels = Readonly<{title: string; name: string; save: string; saved: string; invalid: string; error: string; shared: string; empty: string}>;
export function MemberSavedViews({locale, query, views, canShare, labels}: Readonly<{locale: AppLocale; query: AdminMemberQuery; views: readonly MemberViewRecord[]; canShare: boolean; labels: MemberSavedViewLabels}>) {
  const prefix = locale === "zh-HK" ? "/zh" : "";
  return <section aria-labelledby="member-saved-views-heading" className="space-y-4 rounded-md border border-border p-4">
    <h2 className="font-serif text-xl font-semibold" id="member-saved-views-heading">{labels.title}</h2>
    {views.length ? <ul className="flex flex-wrap gap-2">{views.map((view) => <li key={view.id}><Link className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm hover:bg-muted" href={adminMemberListHref(prefix, view.query)}>{view.name}{view.shared ? ` · ${labels.shared}` : ""}</Link></li>)}</ul> : <p className="text-sm text-muted-foreground">{labels.empty}</p>}
    <MemberSavedViewForm canShare={canShare} labels={labels} query={query}/>
  </section>;
}
