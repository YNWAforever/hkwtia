import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {StructuredData} from "@/components/seo/structured-data";
import {PageHero} from "@/components/wt/page-hero";
import {RichRelatedRoutes} from "@/components/wt/rich-related-routes";
import type {AppLocale} from "@/i18n/routing";
import {buildOtherAboutRoutes} from "@/lib/about/related-routes";
import {buildPageMetadata} from "@/lib/metadata";
import {routeBreadcrumbItems} from "@/lib/seo/route-breadcrumbs";
import {buildBreadcrumbData} from "@/lib/structured-data";

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
  // Unscoped: the breadcrumb label keys are fully qualified (`Navigation.links.*`).
  const tRoot = await getTranslations({locale});
  // The 2026–2028 roster is not confirmed. Do not list committees that were not supplied.
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
      <RichRelatedRoutes items={related} />
      <StructuredData data={buildBreadcrumbData(routeBreadcrumbItems(locale as AppLocale, "/about/committees", tRoot))} />
    </>
  );
}
