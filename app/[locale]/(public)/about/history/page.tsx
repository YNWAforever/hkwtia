import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {InstitutionalPageIntro} from "@/components/marketing/institutional-page-intro";
import {MilestoneTimeline} from "@/components/marketing/milestone-timeline";
import {milestones} from "@/content/milestones";
import type {AppLocale} from "@/i18n/routing";
import {milestonesOnly} from "@/lib/history/milestones";
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

// No `dynamic` export: this reads typed content bundled at build time, not a
// database, so static prerendering is correct and can never go stale.
export default async function HistoryPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations("History");

  return (
    <>
      <InstitutionalPageIntro eyebrow={t("eyebrow")} lead={t("intro")} title={t("title")} />
      <MilestoneTimeline
        locale={locale as AppLocale}
        readMoreLabel={t("readMore")}
        milestones={milestonesOnly(milestones)}
      />
    </>
  );
}
