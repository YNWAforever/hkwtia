import Link from "next/link";

import type {AppLocale} from "@/i18n/routing";
import type {ShowcaseFilters as FilterValues} from "@/lib/showcase/contracts";
import {buildShowcaseQuery} from "@/lib/showcase/public";
import {localizedPath} from "@/lib/urls";

type Labels = Readonly<{search: string; category: string; useCase: string; deployment: string; language: string; worksWith: string; submit: string; clear: string}>;

export function ShowcaseFilters({locale, filters, labels}: Readonly<{locale: AppLocale; filters: FilterValues; labels: Labels}>) {
  const clearHref = localizedPath(locale, "/showcase");
  const fields = [["category", labels.category], ["useCase", labels.useCase], ["deployment", labels.deployment], ["language", labels.language], ["worksWith", labels.worksWith]] as const;
  return <form className="glass-card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3" method="get"><label className="space-y-2 text-sm font-medium sm:col-span-2 lg:col-span-3"><span>{labels.search}</span><input className="min-h-11 w-full rounded-md border border-input bg-background px-3" defaultValue={filters.q ?? ""} name="q" /></label>{fields.map(([name, label]) => <label className="space-y-2 text-sm font-medium" key={name}><span>{label}</span><input className="min-h-11 w-full rounded-md border border-input bg-background px-3" defaultValue={filters[name] ?? ""} name={name} /></label>)}<div className="flex items-center gap-3 lg:col-span-3"><button className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" type="submit">{labels.submit}</button><Link className="text-sm underline" href={clearHref}>{labels.clear}</Link><span className="sr-only">{buildShowcaseQuery(filters).toString()}</span></div></form>;
}
