import {isIndustryTag} from "@/config/industry-tags";
import type {AppLocale} from "@/i18n/routing";
import type {MemberFilters} from "@/lib/db/repos/company-profiles";
import {MEMBERSHIP_PLAN_CODES, type MembershipPlanCode} from "@/lib/membership/constants";

/**
 * The `/members` query contract (S-3). It lives beside the page rather than in
 * the repository because it is the *url* half of the directory: the page parses
 * a `searchParams` bag with it, and `MemberFilters`' own SQL half re-validates
 * every value it is handed (`directoryFilters` in
 * `lib/db/repos/company-profiles.ts`). Two gates, not one shared assumption —
 * a filter that reaches the repository from anywhere else is still checked.
 *
 * `import type` only: the repository is `server-only`, and the filter *shape*
 * is the one thing a component may share with it. The type is imported rather
 * than restated so a new axis cannot be added on one side alone.
 */
const MAX_QUERY_LENGTH = 120;

/** `searchParams` hands back `string | string[] | undefined`; a repeated key takes its first value. */
function firstValue(value: unknown): string | null {
  if (Array.isArray(value)) return firstValue(value[0]);
  return typeof value === "string" ? value : null;
}

function parseQuery(value: unknown): string | null {
  const trimmed = (firstValue(value) ?? "").trim();
  // Symmetric with `searchPattern` in the repository: an empty or over-long
  // search is dropped, so the directory renders unfiltered instead of empty.
  return trimmed.length === 0 || trimmed.length > MAX_QUERY_LENGTH ? null : trimmed;
}

function parseTag(value: unknown): string | null {
  const tag = firstValue(value);
  return tag !== null && isIndustryTag(tag) ? tag : null;
}

function parsePlan(value: unknown): MembershipPlanCode | null {
  const plan = firstValue(value);
  return plan !== null && (MEMBERSHIP_PLAN_CODES as readonly string[]).includes(plan)
    ? plan as MembershipPlanCode
    : null;
}

export function parseMemberFilters(input: Readonly<Record<string, unknown>>): MemberFilters {
  return {q: parseQuery(input.q), tag: parseTag(input.tag), plan: parsePlan(input.plan)};
}

/** The same filters as a link or a hidden-field set; an unset axis emits nothing. */
export function memberFilterQuery(filters: MemberFilters): URLSearchParams {
  const query = new URLSearchParams();
  for (const key of ["q", "tag", "plan"] as const) {
    const value = filters[key];
    if (value) query.set(key, value);
  }
  return query;
}

/**
 * A member writes their own copy, so one language can be missing where the message bundles are
 * always in parity. Fall back to the language they did fill in rather than dropping the sentence:
 * a zh-HK reader is better served by the English tagline than by a blank card, and an empty
 * string is treated as absent so a cleared field never renders as a gap the reader must interpret.
 */
export function localeText(
  value: Readonly<{en: string | null; zhHk: string | null}>,
  locale: AppLocale,
): string | null {
  const [preferred, fallback] = locale === "zh-HK" ? [value.zhHk, value.en] : [value.en, value.zhHk];
  return (preferred?.trim() || fallback?.trim()) || null;
}
