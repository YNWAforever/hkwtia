import Link from "next/link";

import type {AppLocale} from "@/i18n/routing";
import type {ShowcaseFilters as FilterValues} from "@/lib/showcase/contracts";
import {buildShowcaseQuery} from "@/lib/showcase/public";
import {localizedPath} from "@/lib/urls";

type Labels = Readonly<{search: string; category: string; useCase: string; deployment: string; language: string; worksWith: string; submit: string; clear: string}>;

export function ShowcaseFilters({locale, filters, labels}: Readonly<{locale: AppLocale; filters: FilterValues; labels: Labels}>) {
  const clearHref = localizedPath(locale, "/showcase");
  const fields = [["category", labels.category], ["useCase", labels.useCase], ["deployment", labels.deployment], ["language", labels.language], ["worksWith", labels.worksWith]] as const;
  return (
    <form method="get">
      {/* E-29: the donor's `.directory-search` block is exactly a label + one input/button row.
          The search field gets a real id so `/showcase#q` (the homepage's Market Products panel,
          or anything else) can deep-link straight to it; before this fix the input had a `name`
          but no `id`, so a `#q` fragment resolved to nothing. */}
      <div className="directory-search">
        <label htmlFor="q">{labels.search}</label>
        <div>
          <input defaultValue={filters.q ?? ""} id="q" name="q" />
          <button type="submit">{labels.submit}</button>
        </div>
      </div>
      {/* The five facet fields and the clear link are not part of the donor's `.directory-search`
          content model (that block is only the search bar), so they sit in the real
          `.directory-actions` row instead of a class invented for this purpose. Labels stay
          visually hidden but explicitly associated, matching E-29's own fix. */}
      <div className="directory-actions">
        {fields.map(([name, label]) => (
          <span key={name}>
            <label className="sr-only" htmlFor={`showcase-${name}`}>{label}</label>
            <input defaultValue={filters[name] ?? ""} id={`showcase-${name}`} name={name} placeholder={label} />
          </span>
        ))}
        <Link className="text-link" href={clearHref}>{labels.clear}</Link>
      </div>
      <span className="sr-only">{buildShowcaseQuery(filters).toString()}</span>
    </form>
  );
}
