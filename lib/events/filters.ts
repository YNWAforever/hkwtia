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
// The events.tags column limit the member form advertises; a longer value can never match a row.
const MAX_TAG_LENGTH = 40;

function first(value: string | readonly string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** Trim, lowercase, collapse every run of non-alphanumerics to one hyphen and drop edge hyphens. */
function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * The one spelling a tag has on both sides of the `tags @> ARRAY[...]`
 * predicate. Tags used to be stored as typed ("AI", "Machine Learning") while
 * `?tag=` was lowercased and slug-validated, so a search for `ai` never matched
 * a row tagged `AI`. Every write path (member form, admin form, repository
 * schema) runs through this, and so does the URL parser; null means "no tag".
 */
export function normaliseEventTag(value: string): string | null {
  const tag = slugify(value);
  return tag.length > 0 && tag.length <= MAX_TAG_LENGTH ? tag : null;
}

export function parseEventFilters(query: Record<string, string | readonly string[] | undefined>): EventFilters {
  const format = first(query.format);
  const month = first(query.month);
  // A typed organiser name ("Acme Robotics") becomes a `companies.slug`-shaped value, so
  // the text box matches without the visitor knowing the slug -- 0029 derives the first
  // slug from `display_name` the same way. See organiserSlugFromDisplayName below.
  const organiser = organiserSlugFromDisplayName(first(query.organiser));
  return {
    format: format === "in_person" || format === "online" || format === "hybrid" ? format : null,
    month: MONTH.test(month) ? month : null,
    // 96 matches the longest slug the directory will mint (Phase B2).
    organiser: organiser.length <= 96 && SLUG.test(organiser) ? organiser : null,
    tag: normaliseEventTag(first(query.tag)),
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
 * Normalises a *typed* organiser query to the one shape a `companies.slug` can
 * take -- "Acme Ltd." is `acme-ltd`, not `acme-ltd-` (which the SLUG regex
 * rejects and would drop the whole axis).
 *
 * Phase B2 Task 1 gave companies a real `slug` column, so the SQL predicate is
 * now `eq(companies.slug, filters.organiser)` and this is no longer the twin of
 * anything in lib/db/repos/events.ts. It stays because `?organiser=` is a free
 * text box: a visitor types a name, not a slug, and the derivation is what
 * turns "Acme Robotics" into `acme-robotics`. That still hits, because
 * `drizzle/0029_phase_b_company_slugs.sql` mints the first slug from
 * `display_name` through exactly this function -- but only until an owner edits
 * their slug, after which the slug is the identity and the old name stops
 * matching. That is the intended B2 behaviour, not a regression.
 *
 * `parseEventFilters` above is its only production caller.
 * `tests/fixtures/company-slug.ts`, the TypeScript twin of the 0029 backfill,
 * is the other -- which is why the derivation must not change without changing
 * that migration too.
 */
export function organiserSlugFromDisplayName(displayName: string): string {
  return slugify(displayName);
}
