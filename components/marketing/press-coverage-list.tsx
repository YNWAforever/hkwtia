import type {AppLocale} from "@/i18n/routing";
import {formatPressDate, type PressCard} from "@/lib/media/press-clippings";
import {titleLangForLocale} from "@/lib/news/archive-document";

export function PressCoverageList({
  rows,
  locale,
  labels,
}: Readonly<{
  rows: readonly PressCard[];
  locale: AppLocale;
  labels: Readonly<{
    externalNote: string;
    wire: string;
    inclusionHub: string;
    inclusionNoWtia: string;
    ctaExternal: string;
    ctaExternalA11y: string;
    ctaInternal: string;
    ctaInternalA11y: string;
  }>;
}>) {
  const groups = groupByYear(rows);
  return (
    <div className="press-list">
      <p className="press-external-note">{labels.externalNote}</p>
      {groups.map((group) => (
        <section key={group.year} aria-labelledby={`press-year-${group.year}`} className="press-year">
          <h2 id={`press-year-${group.year}`}>{group.year}</h2>
          <ol className="press-year-list">
            {group.rows.map((row) => (
              <li key={row.articleUrl}>
                <PressCardView labels={labels} locale={locale} row={row} />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function PressCardView({
  row,
  locale,
  labels,
}: Readonly<{
  row: PressCard;
  locale: AppLocale;
  labels: Readonly<{
    wire: string;
    inclusionHub: string;
    inclusionNoWtia: string;
    ctaExternal: string;
    ctaExternalA11y: string;
    ctaInternal: string;
    ctaInternalA11y: string;
  }>;
}>) {
  const titleLang = titleLangForLocale(row.title, locale);
  const external = row.linkKind === "external";
  return (
    <article
      className="press-card"
      data-distribution={row.distribution}
      data-gap-reason={row.gapReason ?? undefined}
      data-inclusion={row.inclusionFlag ?? undefined}
      data-summary-status={row.summaryStatus}
    >
      <p className="press-card-meta">
        <span className="press-outlet">
          {row.distribution === "wire" ? <span className="press-wire">{labels.wire}</span> : null}
          <span>{row.outlet}</span>
        </span>
        {row.dateTime ? <time dateTime={row.dateTime}>{formatPressDate(row.dateTime, locale)}</time> : <span>{row.dateLabel}</span>}
      </p>
      <h3 className="press-title" lang={titleLang}>{row.title}</h3>
      {row.inclusionFlag === "topic_hub" ? <p className="press-inclusion" role="note">{labels.inclusionHub}</p> : null}
      {row.inclusionFlag === "no_wtia_mention" ? <p className="press-inclusion" role="note">{labels.inclusionNoWtia}</p> : null}
      {row.summary ? <p className="press-card-summary">{row.summary}</p> : null}
      <a
        className="press-card-cta"
        href={row.articleUrl}
        {...(external ? {target: "_blank", rel: "noopener noreferrer"} : {})}
        aria-label={external ? labels.ctaExternalA11y : labels.ctaInternalA11y}
      >
        <span>{external ? labels.ctaExternal : labels.ctaInternal}</span>
        {external ? <ExternalMark /> : null}
      </a>
    </article>
  );
}

function ExternalMark() {
  return (
    <svg aria-hidden="true" className="press-external-icon" focusable="false" viewBox="0 0 16 16">
      <path d="M4 3h9v9h-1.5V5.6L4.4 12.7 3.3 11.6 10.4 4.5H4V3z" fill="currentColor" />
    </svg>
  );
}

function groupByYear(rows: readonly PressCard[]): readonly {year: string; rows: PressCard[]}[] {
  const groups: {year: string; rows: PressCard[]}[] = [];
  for (const row of rows) {
    const year = row.year ?? "undated";
    const last = groups[groups.length - 1];
    if (!last || last.year !== year) groups.push({year, rows: [row]});
    else last.rows.push(row);
  }
  return groups;
}
