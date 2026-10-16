import {Arrow} from "@/components/wt/arrow";
import {Link} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";
import type {PublicEventProjection} from "@/lib/events/public";
import {formatEventDate} from "@/lib/home/format-event-date";

type EventDayGroup = Readonly<{key: string; heading: string; events: readonly PublicEventProjection[]}>;

// Hong Kong calendar day, not the UTC date -- consistent with this codebase's existing
// Asia/Hong_Kong convention everywhere else events are formatted (lib/home/format-event-date.ts).
function dayKey(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit"})
    .formatToParts(new Date(value))
    .map((part) => part.value)
    .join("");
}

// Sorts defensively rather than trusting the caller to have pre-sorted by `startsAt` -- the sole
// caller today pre-sorts by `coalesce(endsAt, startsAt)`, which is not the same ordering, so a
// same-day short event scheduled after a longer earlier event could otherwise land out of true
// date order. This keeps "chronological order" a guarantee this function makes itself.
function groupByDay(events: readonly PublicEventProjection[], locale: AppLocale): readonly EventDayGroup[] {
  const sorted = [...events].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const order: string[] = [];
  const byKey = new Map<string, PublicEventProjection[]>();
  for (const event of sorted) {
    const key = dayKey(event.startsAt);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(event);
    else { byKey.set(key, [event]); order.push(key); }
  }
  return order.map((key) => ({key, heading: formatEventDate(byKey.get(key)![0].startsAt, locale), events: byKey.get(key)!}));
}

// Donor `.event-calendar-view` (app/styles/wisetech.css:358-364) has no distinct day-group-header
// class of its own -- confirmed via grep, no day-group/date-group/calendar-day/calendar-group
// selector exists anywhere in the ported stylesheet. Its `>a` row already carries one event's own
// large serif <time>; day-header grouping (design spec §2, restraint precedent from Group C's
// compass grids) reuses the existing, generic `.status-label` class rather than inventing one.
export function EventCalendarView({events, locale}: Readonly<{events: readonly PublicEventProjection[]; locale: AppLocale}>) {
  const groups = groupByDay(events, locale);
  return (
    <div>
      {groups.map((group) => (
        <section key={group.key}>
          <h3 className="status-label">{group.heading}</h3>
          <div className="event-calendar-view">
            {group.events.map((event) => (
              <Link href={`/events/${event.slug}`} key={event.id}>
                {/* aria-label mirrors EventCard's bare-day-number <time> (components/marketing/event-card.tsx)
                    -- a lone number is meaningless out of context to a screen reader navigating link-by-link.
                    Reuses the day group's own `heading`, which is the same full date for every event in this
                    group, instead of a second Intl.DateTimeFormat call per event. */}
                <time aria-label={group.heading} dateTime={event.startsAt}>{new Intl.DateTimeFormat(locale, {day: "numeric", timeZone: "Asia/Hong_Kong"}).format(new Date(event.startsAt))}</time>
                <div>
                  {event.venue ? <span>{event.venue}</span> : null}
                  <h3>{event.title}</h3>
                  <p>{event.description}</p>
                </div>
                <Arrow />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
