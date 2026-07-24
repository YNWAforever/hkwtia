import Link from "next/link";

import type {AppLocale} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";

export type PortalNavLabels = Readonly<{
  navigation: string;
  dashboard: string;
  profile: string;
  company: string;
  directory: string;
  events: string;
  documents: string;
  billing: string;
  signOut: string;
}>;

export function PortalNav({locale, labels}: {locale: AppLocale; labels: PortalNavLabels}) {
  const items = [
    {href: localizedPath(locale, "/portal"), label: labels.dashboard},
    {href: localizedPath(locale, "/portal/profile"), label: labels.profile},
    {href: localizedPath(locale, "/portal/company"), label: labels.company},
    {href: localizedPath(locale, "/portal/directory"), label: labels.directory},
    {href: localizedPath(locale, "/portal/events"), label: labels.events},
    {href: localizedPath(locale, "/portal/documents"), label: labels.documents},
    {href: localizedPath(locale, "/portal/billing"), label: labels.billing},
  ];

  return (
    <nav aria-label={labels.navigation} className="border-b border-border/70 bg-background/85 px-4 py-4 backdrop-blur sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Link className="font-serif text-xl font-semibold text-foreground" href={localizedPath(locale, "/portal")}>WTIA</Link>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {items.map((item) => (
            <Link className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
          <span aria-hidden="true" className="hidden h-5 w-px bg-border sm:block" />
          <span className="sr-only">{labels.signOut}</span>
        </div>
      </div>
    </nav>
  );
}
