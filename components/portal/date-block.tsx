import type {AppLocale} from "@/i18n/routing";
import {formatPortalDate, portalDateParts} from "@/lib/portal/format-date";

// The big day/month tile on an event card. The visual parts are aria-hidden and the full date is
// read instead: the bare spans used to read as "12Nov", with no year (final review M6).
export function PortalDateBlock({locale, value, now}: Readonly<{locale: AppLocale; value: string | Date; now?: Date}>) {
  const date = value instanceof Date ? value : new Date(value);
  const {day, month, year} = portalDateParts(locale, date, now);
  return (
    <time className="portal-date-block" dateTime={date.toISOString()}>
      <span aria-hidden="true" className="portal-date-day">{day}</span>
      <span aria-hidden="true" className="portal-date-month">{month}</span>
      {year ? <span aria-hidden="true" className="portal-date-year">{year}</span> : null}
      <span className="sr-only">{formatPortalDate(locale, date)}</span>
    </time>
  );
}
