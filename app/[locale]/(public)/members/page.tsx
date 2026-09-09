import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {MemberCard} from "@/components/marketing/member-card";
import {MemberFilters} from "@/components/marketing/member-filters";
import {ClosingBand} from "@/components/wt/closing-band";
import {HonestEmpty} from "@/components/wt/honest-empty";
import {PageHero} from "@/components/wt/page-hero";
import {Section} from "@/components/wt/section";
import type {AppLocale} from "@/i18n/routing";
import {companyProfilesRepository} from "@/lib/db/repos/company-profiles";
import {buildPageMetadata} from "@/lib/metadata";
import {parseMemberFilters} from "@/lib/members/public";
import {MEMBERSHIP_PLAN_CODES, type MembershipPlanCode} from "@/lib/membership/constants";

// D-11: the public member directory, over reviewed `public_profile_status = 'published'` rows.
// `force-dynamic` because the whole page is a filtered read of a table staff edit continuously;
// caching it would show a stranger a profile its owner had already taken down.
export const dynamic = "force-dynamic";

type Props = Readonly<{params: Promise<{locale: string}>; searchParams: Promise<Record<string, string | string[] | undefined>>}>;

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "Members"});
  return buildPageMetadata({locale: locale as AppLocale, pathname: "/members", title: t("metaTitle"), description: t("metaDescription")});
}

export default async function MembersPage({params, searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const [t, tCommon, query] = await Promise.all([
    getTranslations({locale, namespace: "Members"}),
    getTranslations({locale, namespace: "Common"}),
    searchParams,
  ]);
  const filters = parseMemberFilters(query);
  // A public page degrades rather than 500s: an unreachable database renders the honest empty
  // state, the same contract /showcase and /events already keep.
  const members = await companyProfilesRepository.listPublished(filters).catch(() => []);
  const plans = Object.fromEntries(
    MEMBERSHIP_PLAN_CODES.map((plan) => [plan, t(`plans.${plan}`)]),
  ) as Record<MembershipPlanCode, string>;

  return <>
    <PageHero
      breadcrumb={{homeHref: "/", homeLabel: tCommon("breadcrumbHome"), current: t("breadcrumbCurrent")}}
      breadcrumbLabel={tCommon("breadcrumbLabel")}
      eyebrow={t("eyebrow")}
      lead={t("description")}
      title={t("title")}
    />
    <Section id="results" labelledBy="members-results-title">
      {/* The count is the section's accessible name and a polite live region: a filter submit is a
          full navigation, so this is what tells a screen-reader user what came back. */}
      <p aria-live="polite" className="sr-only" id="members-results-title" role="status">{t("resultsTitle", {count: members.length})}</p>
      <MemberFilters
        filters={filters}
        labels={{
          search: t("filters.search"), tag: t("filters.tag"), anyTag: t("filters.anyTag"),
          plan: t("filters.plan"), anyPlan: t("filters.anyPlan"), submit: t("filters.submit"),
          clear: t("filters.clear"), plans,
        }}
        locale={locale}
      />
      {members.length > 0
        ? <div className="partner-record-grid">
          {members.map((member) => <MemberCard key={member.slug} labels={{plans, view: t("view")}} locale={locale} member={member} />)}
        </div>
        : <HonestEmpty actions={[{label: t("filters.clear"), href: "/members"}]} copy={t("emptyDescription")} title={t("emptyTitle")} variant="inner" />}
    </Section>
    <ClosingBand
      actions={[{label: t("detail.join"), href: "/membership"}]}
      copy={t("metaDescription")}
      eyebrow={t("eyebrow")}
      title={t("detail.joinCta")}
    />
  </>;
}
