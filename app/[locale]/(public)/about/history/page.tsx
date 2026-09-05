import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {MilestoneTimeline} from "@/components/marketing/milestone-timeline";
import {PageHero} from "@/components/wt/page-hero";
import {RichCompass} from "@/components/wt/rich-compass";
import {RichRelatedRoutes} from "@/components/wt/rich-related-routes";
import {milestones} from "@/content/milestones";
import type {AppLocale} from "@/i18n/routing";
import {buildOtherAboutRoutes} from "@/lib/about/related-routes";
import {historyCompassFacts, milestonesOnly} from "@/lib/history/milestones";
import {buildPageMetadata} from "@/lib/metadata";

type Props = {params: Promise<{locale: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "History"});
  return buildPageMetadata({
    locale: locale as AppLocale,
    pathname: "/about/history",
    title: t("metaTitle"),
    description: t("metaDescription"),
  });
}

// No `dynamic` export: this reads typed content bundled at build time, not a database.
export default async function HistoryPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations("History");
  const common = await getTranslations({locale, namespace: "Common"});
  const history = milestonesOnly(milestones);
  const facts = historyCompassFacts(history);
  const related = await buildOtherAboutRoutes(locale as AppLocale, "history");

  return (
    <>
      <PageHero
        className="rich-page-hero"
        eyebrow={t("eyebrow")}
        title={t("title")}
        lead={t("intro")}
        breadcrumb={{homeHref: "/", homeLabel: common("breadcrumbHome"), current: t("eyebrow")}}
        breadcrumbLabel={common("breadcrumbLabel")}
      />
      <RichCompass
        items={[
          {label: t("compass.foundedLabel"), value: t("compass.foundedValue", {year: facts.foundingYear})},
          {label: t("compass.milestonesLabel"), value: t("compass.milestonesValue", {count: facts.milestoneCount})},
          {label: t("compass.latestLabel"), value: t("compass.latestValue", {year: facts.latestYear})},
        ]}
      />
      <MilestoneTimeline locale={locale as AppLocale} readMoreLabel={t("readMore")} milestones={history} />
      <RichRelatedRoutes items={related} />
    </>
  );
}
