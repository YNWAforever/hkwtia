import type {AppLocale} from "@/i18n/routing";
import type {EventFilters} from "@/lib/events/filters";
import type {PublicEventFormat, PublicEventStatus} from "@/lib/events/public";
import {localizedPath} from "@/lib/urls";

export type EventFilterPanelLabels = Readonly<{
  legend: string;
  format: string;
  formats: Readonly<Record<"any" | PublicEventFormat, string>>;
  month: string;
  organiser: string;
  tag: string;
  apply: string;
  clear: string;
}>;

const FORMATS: readonly PublicEventFormat[] = ["in_person", "online", "hybrid"];

// Programme B-6. Plain GET form, the same server-rendered idiom as the quick tabs above it
// and components/marketing/showcase-filters.tsx: the URL is the whole filter state, so a
// filtered list is linkable and the page needs no client island. Donor classes
// `.event-filter-panel`, `.event-filter-grid` and `.directory-actions` are already styled
// in app/styles/wisetech.css. The hidden `status` keeps the open/past tab through a submit.
export function EventFilterPanel({locale, status, filters, labels}: Readonly<{locale: AppLocale; status: PublicEventStatus; filters: EventFilters; labels: EventFilterPanelLabels}>) {
  const action = localizedPath(locale, "/events");
  const field = "min-h-11 w-full rounded-md border border-input bg-background px-3";
  return (
    <form action={action} className="event-filter-panel" method="get">
      <fieldset className="event-filter-grid">
        <legend className="sr-only">{labels.legend}</legend>
        <input name="status" type="hidden" value={status} />
        <label>
          <span>{labels.format}</span>
          <select className={field} defaultValue={filters.format ?? ""} name="format">
            <option value="">{labels.formats.any}</option>
            {FORMATS.map((key) => <option key={key} value={key}>{labels.formats[key]}</option>)}
          </select>
        </label>
        <label>
          <span>{labels.month}</span>
          <input className={field} defaultValue={filters.month ?? ""} name="month" type="month" />
        </label>
        <label>
          <span>{labels.organiser}</span>
          <input className={field} defaultValue={filters.organiser ?? ""} name="organiser" type="text" />
        </label>
        <label>
          <span>{labels.tag}</span>
          <input className={field} defaultValue={filters.tag ?? ""} name="tag" type="text" />
        </label>
      </fieldset>
      <div className="directory-actions">
        <button className="button" type="submit">{labels.apply}</button>
        <a className="text-link" href={`${action}?status=${status}`}>{labels.clear}</a>
      </div>
    </form>
  );
}
