import Link from "next/link";

import {INDUSTRY_TAGS, industryTagLabel} from "@/config/industry-tags";
import type {AppLocale} from "@/i18n/routing";
import type {MemberFilters as FilterValues} from "@/lib/db/repos/company-profiles";
import {memberFilterQuery} from "@/lib/members/public";
import {MEMBERSHIP_PLAN_CODES, type MembershipPlanCode} from "@/lib/membership/constants";
import {localizedPath} from "@/lib/urls";

type Labels = Readonly<{
  search: string; tag: string; anyTag: string; plan: string; anyPlan: string;
  submit: string; clear: string; plans: Readonly<Record<MembershipPlanCode, string>>;
}>;

/**
 * The donor's directory search (`directory-search-form` in the authoritative inventory), answered
 * by hkwtia's own data. A plain GET form: every filter is a shareable url, the page stays a Server
 * Component, and the state a reader can see is the state the repository was asked for.
 *
 * Both facets are `<select>`s, not free-text inputs like /showcase's: the tag vocabulary is closed
 * (S-4) and the plan codes are an enum, so a typed value could only ever mean "no results".
 */
export function MemberFilters({locale, filters, labels}: Readonly<{locale: AppLocale; filters: FilterValues; labels: Labels}>) {
  return (
    <form method="get">
      {/* `id="q"` so `/members#q` deep-links to the field, as E-29 fixed for /showcase. */}
      <div className="directory-search">
        <label htmlFor="q">{labels.search}</label>
        <div>
          <input defaultValue={filters.q ?? ""} id="q" name="q" />
          <button type="submit">{labels.submit}</button>
        </div>
      </div>
      <div className="directory-actions">
        <span>
          <label className="sr-only" htmlFor="member-tag">{labels.tag}</label>
          <select defaultValue={filters.tag ?? ""} id="member-tag" name="tag">
            <option value="">{labels.anyTag}</option>
            {INDUSTRY_TAGS.map((tag) => (
              <option key={tag.slug} value={tag.slug}>{industryTagLabel(tag.slug, locale)}</option>
            ))}
          </select>
        </span>
        <span>
          <label className="sr-only" htmlFor="member-plan">{labels.plan}</label>
          <select defaultValue={filters.plan ?? ""} id="member-plan" name="plan">
            <option value="">{labels.anyPlan}</option>
            {MEMBERSHIP_PLAN_CODES.map((plan) => (
              <option key={plan} value={plan}>{labels.plans[plan]}</option>
            ))}
          </select>
        </span>
        {/* `localizedPath`, never a hand-built prefix: `/zh-HK/members` is not a route (boundary 5). */}
        <Link className="text-link" href={localizedPath(locale, "/members")}>{labels.clear}</Link>
      </div>
      <span className="sr-only">{memberFilterQuery(filters).toString()}</span>
    </form>
  );
}
