import Link from "next/link";

import type {AppLocale} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";

export type AdminNavLabels = Readonly<{brand: string; label: string; members: string; segments: string; atRisk: string; events: string; listingsReview: string; cohorts: string; approvals: string; reports: string; automations: string}>;

export function AdminNav({locale, labels}: {locale: AppLocale; labels: AdminNavLabels}) {
  const items = [
    {href: "/admin/members", label: labels.members}, {href: "/admin/segments", label: labels.segments},
    {href: "/admin/at-risk", label: labels.atRisk}, {href: "/admin/events-mgmt", label: labels.events}, {href: "/admin/listings-review", label: labels.listingsReview}, {href: "/admin/cohorts", label: labels.cohorts},
    {href: "/admin/approvals", label: labels.approvals}, {href: "/admin/reports", label: labels.reports},
    {href: "/admin/automations", label: labels.automations},
  ];
  return <nav aria-label={labels.label} className="border-b border-border/70 bg-background/85 px-4 py-4 backdrop-blur sm:px-6">
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <Link className="font-serif text-xl font-semibold text-foreground" href={localizedPath(locale, "/admin")}>{labels.brand}</Link>
      <div className="flex flex-wrap items-center gap-2 text-sm">{items.map((item) => <Link className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" href={localizedPath(locale, item.href)} key={item.href}>{item.label}</Link>)}</div>
    </div>
  </nav>;
}
