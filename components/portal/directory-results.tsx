import Link from "next/link";

import type {AppLocale} from "@/i18n/routing";
import {labelSeparator} from "@/lib/i18n/punctuation";
import type {DirectoryPage} from "@/lib/portal/content";
import {localizedPath} from "@/lib/urls";

type Labels = Readonly<{
  search: string;
  empty: string;
  next: string;
  previous: string;
  company: string;
  industry: string;
  sizeBand: string;
}>;

type Props = Readonly<{
  locale: AppLocale;
  page: DirectoryPage;
  query: string;
  labels: Labels;
}>;

function pageHref(locale: AppLocale, query: string, cursor: string | null): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (cursor) params.set("cursor", cursor);
  const suffix = params.toString();
  return `${localizedPath(locale, "/portal/directory")}${suffix ? `?${suffix}` : ""}`;
}

export function DirectoryResults({locale, page, query, labels}: Props) {
  return (
    <div className="space-y-6">
      <form action={localizedPath(locale, "/portal/directory")} className="flex flex-col gap-3 sm:flex-row" method="get">
        <label className="sr-only" htmlFor="directory-search">{labels.search}</label>
        <input className="min-h-11 flex-1 rounded-md border border-input bg-background px-3" defaultValue={query} id="directory-search" name="q" placeholder={labels.search} type="search" />
        <button className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90" type="submit">{labels.search}</button>
      </form>

      {page.items.length === 0 ? (
        <section className="glass-card p-6">
          <p className="text-muted-foreground">{labels.empty}</p>
        </section>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {page.items.map((record) => (
            <article className="glass-card space-y-3 p-5" key={`${record.userId}:${record.companyId ?? ""}`}>
              <div>
                <h2 className="font-serif text-2xl font-semibold">{record.displayName}</h2>
                {record.jobTitle ? <p className="text-sm text-muted-foreground">{record.jobTitle}</p> : null}
              </div>
              {record.companyDisplayName ? <p className="text-sm"><span className="font-medium">{labels.company}{labelSeparator(locale)}</span>{record.companyDisplayName}</p> : null}
              {record.industry ? <p className="text-sm"><span className="font-medium">{labels.industry}{labelSeparator(locale)}</span>{record.industry}</p> : null}
              {record.sizeBand ? <p className="text-sm"><span className="font-medium">{labels.sizeBand}{labelSeparator(locale)}</span>{record.sizeBand}</p> : null}
            </article>
          ))}
        </div>
      )}

      {(page.nextCursor || query) ? (
        <nav aria-label={labels.search} className="flex items-center justify-between gap-4 text-sm">
          <span>{page.nextCursor ? <Link className="rounded-md border border-border px-3 py-2 hover:bg-muted" href={pageHref(locale, query, page.nextCursor)}>{labels.next}</Link> : null}</span>
          <Link className="rounded-md border border-border px-3 py-2 hover:bg-muted" href={localizedPath(locale, "/portal/directory")}>{labels.previous}</Link>
        </nav>
      ) : null}
    </div>
  );
}