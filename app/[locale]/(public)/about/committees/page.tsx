import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {PageHero} from "@/components/wt/page-hero";
import {RichRelatedRoutes} from "@/components/wt/rich-related-routes";
import {Section} from "@/components/wt/section";
import {SectionHeading} from "@/components/wt/section-heading";
import type {AppLocale} from "@/i18n/routing";
import {buildOtherAboutRoutes} from "@/lib/about/related-routes";
import {buildPageMetadata} from "@/lib/metadata";

type Props = {params: Promise<{locale: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "Committees"});
  return buildPageMetadata({
    locale: locale as AppLocale,
    pathname: "/about/committees",
    title: t("metaTitle"),
    description: t("metaDescription"),
  });
}

export default async function CommitteesPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Committees");
  const common = await getTranslations({locale, namespace: "Common"});
  const committees = ["executive", "innovation", "membership"] as const;
  // No compass grid here: three fixed committees with no roster or cadence to count or
  // link to (restraint, the same instinct HonestEmpty applies elsewhere).
  const related = await buildOtherAboutRoutes(locale as AppLocale, "committees");

  return (
    <>
      <PageHero
        className="rich-page-hero"
        eyebrow={t("eyebrow")}
        title={t("title")}
        lead={t("summary")}
        breadcrumb={{homeHref: "/", homeLabel: common("breadcrumbHome"), current: t("eyebrow")}}
        breadcrumbLabel={common("breadcrumbLabel")}
      />
      <Section labelledBy="committees-structure-title">
        <SectionHeading eyebrow={t("eyebrow")} title={t("structureTitle")} headingId="committees-structure-title" variant="stacked" />
        <div className="rich-items rich-items-cards">
          {committees.map((committee, index) => (
            <article key={committee}>
              <span className="rich-item-number">{String(index + 1).padStart(2, "0")}</span>
              <h3>{t(`${committee}.title`)}</h3>
              <p>{t(`${committee}.description`)}</p>
            </article>
          ))}
        </div>
      </Section>
      <RichRelatedRoutes items={related} />
    </>
  );
}
