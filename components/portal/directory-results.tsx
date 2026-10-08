import {PrivateLink as Link} from "@/components/internal-shell/private-link";
import {HonestEmpty} from "@/components/wt/honest-empty";

import type {AppLocale} from "@/i18n/routing";
import {directoryPaging} from "@/lib/portal/directory-paging";
import type {DirectoryPage} from "@/lib/portal/content";
import {localizedPath} from "@/lib/urls";

type Labels = Readonly<{
  search: string;
  showingFor: string;
  clear: string;
  empty: string;
  emptyQuery: string;
  emptyQueryHint: string;
  emptyNone: string;
  emptyNoneAction: string;
  next: string;
  first: string;
  pages: string;
  company: string;
  industry: string;
  sizeBand: string;
}>;

type Props = Readonly<{
  locale: AppLocale;
  page: DirectoryPage;
  query: string;
  cursor?: string | null;
  labels: Labels;
}>;

function pageHref(locale: AppLocale, params: {q?: string; cursor?: string}): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.cursor) search.set("cursor", params.cursor);
  const suffix = search.toString();
  return `${localizedPath(locale, "/portal/directory")}${suffix ? `?${suffix}` : ""}`;
}

export function DirectoryResults({locale, page, query: rawQuery, cursor = null, labels}: Props) {
  // Whitespace is not a search: trim here too, so no caller can render a "results for" line for "  ".
  const query = rawQuery.trim();
  const paging = directoryPaging({query, cursor, nextCursor: page.nextCursor});

  return (
    <div className="portal-directory">
      <form action={localizedPath(locale, "/portal/directory")} className="portal-form portal-directory-search" method="get" role="search">
        <div className="portal-field">
          <label htmlFor="directory-search">{labels.search}</label>
          <input defaultValue={query} id="directory-search" name="q" type="search" />
        </div>
        <button className="button" type="submit">{labels.search}</button>
      </form>

      {query ? (
        <p className="portal-field-help portal-directory-showing">
          {labels.showingFor}{" "}
          <Link className="text-link" href={localizedPath(locale, "/portal/directory")}>{labels.clear}</Link>
        </p>
      ) : null}

      {page.items.length === 0 ? (
        <>
          <HonestEmpty copy={query ? labels.emptyQueryHint : labels.emptyNone} headingLevel={2} title={query ? labels.emptyQuery : labels.empty} variant="inner" />
          {query ? null : (
            <p className="portal-directory-next">
              <Link className="text-link" href={localizedPath(locale, "/portal/profile")}>{labels.emptyNoneAction}</Link>
            </p>
          )}
        </>
      ) : (
        <ul className="portal-card-grid portal-directory-list">
          {page.items.map((record) => (
            <li className="portal-card" key={`${record.userId}:${record.companyId ?? ""}`}>
              <h2 className="portal-directory-name">{record.displayName}</h2>
              {record.jobTitle ? <p className="portal-directory-role">{record.jobTitle}</p> : null}
              <dl className="portal-record">
                {record.companyDisplayName ? <div><dt>{labels.company}</dt><dd>{record.companyDisplayName}</dd></div> : null}
                {record.industry ? <div><dt>{labels.industry}</dt><dd>{record.industry}</dd></div> : null}
                {record.sizeBand ? <div><dt>{labels.sizeBand}</dt><dd>{record.sizeBand}</dd></div> : null}
              </dl>
            </li>
          ))}
        </ul>
      )}

      {paging.first || paging.next ? (
        <nav aria-label={labels.pages} className="portal-paging">
          {paging.first ? <Link className="text-link" href={pageHref(locale, paging.first)}>{labels.first}</Link> : <span />}
          {paging.next ? <Link className="text-link" href={pageHref(locale, paging.next)}>{labels.next}</Link> : null}
        </nav>
      ) : null}
    </div>
  );
}
