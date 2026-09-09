import type {PublicEventFormat, PublicEventStatus} from "@/lib/events/public";

/**
 * URL state for /events (programme B-6). Every field is optional and validated
 * on its own, so one bad value never discards the others; anything that fails
 * is null and the page renders unfiltered on that axis.
 */
export type EventFilters = Readonly<{
  format: PublicEventFormat | null;
  month: string | null;
  organiser: string | null;
  tag: string | null;
}>;

export const EMPTY_EVENT_FILTERS: EventFilters = {format: null, month: null, organiser: null, tag: null};

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const HONG_KONG_OFFSET_MS = 8 * 60 * 60 * 1000;

function first(value: string | readonly string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function parseEventFilters(query: Record<string, string | readonly string[] | undefined>): EventFilters {
  const format = first(query.format);
  const month = first(query.month);
  const organiser = first(query.organiser).trim().toLowerCase();
  const tag = first(query.tag).trim().toLowerCase();
  return {
    format: format === "in_person" || format === "online" || format === "hybrid" ? format : null,
    month: MONTH.test(month) ? month : null,
    // 96 matches the longest slug the directory will mint (Phase B2); 40 matches
    // the member event form's tag limit, so a longer value can never match a row.
    organiser: organiser.length <= 96 && SLUG.test(organiser) ? organiser : null,
    tag: tag.length > 0 && tag.length <= 40 && SLUG.test(tag) ? tag : null,
  };
}

/** Query string carrying the status tab plus only the filters that are set. */
export function eventFilterQuery(filters: EventFilters, status: PublicEventStatus): string {
  const params = new URLSearchParams({status});
  if (filters.format) params.set("format", filters.format);
  if (filters.month) params.set("month", filters.month);
  if (filters.organiser) params.set("organiser", filters.organiser);
  if (filters.tag) params.set("tag", filters.tag);
  return params.toString();
}

/**
 * Half-open [start, end) bounds of a `YYYY-MM` month in Asia/Hong_Kong, the
 * zone every event is scheduled in: an event at 01:00 HKT on the 1st belongs to
 * that month even though its UTC instant is still in the previous one.
 */
export function hongKongMonthBounds(month: string): Readonly<{start: Date; end: Date}> {
  const [year, monthIndex] = month.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, monthIndex - 1, 1) - HONG_KONG_OFFSET_MS),
    end: new Date(Date.UTC(year, monthIndex, 1) - HONG_KONG_OFFSET_MS),
  };
}

/**
 * The organiser slug a company display name matches until Phase B2 adds
 * `companies.slug`: the JS twin of the SQL expression in
 * lib/db/repos/events.ts (`organiserSlugPredicate`). Keep the two in step;
 * both are replaced by the real column when B2 merges.
 */
export function organiserSlugFromDisplayName(displayName: string): string {
  return displayName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}
