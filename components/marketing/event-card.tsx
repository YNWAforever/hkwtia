import {ActionLink} from "@/components/wt/action-link";
import {Link} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";
import type {PublicEventProjection, PublicEventStatus} from "@/lib/events/public";
import {formatEventDate} from "@/lib/home/format-event-date";
import {cn} from "@/lib/utils";

export type EventCardLabels = Readonly<{
  status: Readonly<{open: string; past: string}>;
  venueLabel: string;
  capacityLabel: string;
  cta: string;
}>;

export type EventCardProps = Readonly<{
  event: PublicEventProjection;
  status: PublicEventStatus;
  locale: AppLocale;
  labels: EventCardLabels;
}>;

// `formatToParts` for {day: "numeric", month: "short"} interleaves a "literal" part between the
// day/month values. For "en" that literal is just the separating space (e.g.
// [month "Oct", literal " ", day "24"]) -- dropping it is correct. For "zh-HK" the literal is the
// CJK unit marker itself (e.g. [month "10", literal "月", day "24", literal "日"]) -- dropping it
// left the card rendering bare, unlabeled numbers ("10" over "24") with no indication of which was
// the month and which was the day, unlike the adjacent `fullDate` aria-label. Appending the literal
// immediately after a part only when it is non-whitespace keeps both locales correct without
// hard-coding which locales use CJK markers.
function dateBlockParts(value: string, locale: AppLocale): Readonly<{day: string; month: string}> {
  const parts = new Intl.DateTimeFormat(locale, {day: "numeric", month: "short", timeZone: "Asia/Hong_Kong"}).formatToParts(new Date(value));
  const withTrailingUnit = (type: "day" | "month") => {
    const index = parts.findIndex((part) => part.type === type);
    if (index === -1) return "";
    const next = parts[index + 1];
    const unit = next?.type === "literal" && next.value.trim() !== "" ? next.value : "";
    return parts[index].value + unit;
  };
  return {
    day: withTrailingUnit("day"),
    month: withTrailingUnit("month"),
  };
}

// Donor `.event-library` card grammar (app/styles/wisetech.css:559 `.event-card-v2`, :561
// `.event-date-block`, :563 `.event-card-body`, :566 `.event-status`). No `format` field exists on
// `PublicEventProjection` (confirmed against lib/db/repos/events.ts's `projectPublicEvent`) --
// the donor's "format badge" (online/in-person) has no honest data behind it here, so this card
// surfaces the two real optional facts the repository actually projects (venue, capacity)
// instead of fabricating one. `formatEventDate` is the same Asia/Hong_Kong helper already shared
// by components/home/open-now.tsx and components/home/events-journey.tsx.
export function EventCard({event, status, locale, labels}: EventCardProps) {
  const {day, month} = dateBlockParts(event.startsAt, locale);
  const fullDate = formatEventDate(event.startsAt, locale);

  return (
    <article className="event-card-v2">
      <div className="event-date-block">
        <time aria-label={fullDate} dateTime={event.startsAt}>{day}</time>
        <span>{month}</span>
      </div>
      <div className="event-card-body">
        <span className={cn("event-status", status === "past" && "completed")}>{labels.status[status]}</span>
        <h3><Link href={`/events/${event.slug}`}>{event.title}</Link></h3>
        <p className="line-clamp-3 break-words">{event.description}</p>
        <dl>
          {event.venue ? <div><dt>{labels.venueLabel}</dt><dd>{event.venue}</dd></div> : null}
          {event.capacity !== null ? <div><dt>{labels.capacityLabel}</dt><dd>{event.capacity}</dd></div> : null}
        </dl>
        <div className="event-card-actions">
          <ActionLink href={`/events/${event.slug}`} variant="text-link">{labels.cta}</ActionLink>
        </div>
      </div>
    </article>
  );
}
