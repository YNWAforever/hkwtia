import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {parsePolicySections, PolicySections} from "@/components/marketing/policy-sections";
import {StructuredData} from "@/components/seo/structured-data";
import {PageHero} from "@/components/wt/page-hero";
import type {AppLocale} from "@/i18n/routing";
import {buildPageMetadata} from "@/lib/metadata";
import {routeBreadcrumbItems} from "@/lib/seo/route-breadcrumbs";
import {buildBreadcrumbData} from "@/lib/structured-data";

type Props = {params: Promise<{locale: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "RefundPolicy"});
  return buildPageMetadata({locale: locale as AppLocale, pathname: "/refund-policy", title: t("metaTitle"), description: t("metaDescription")});
}

export default async function RefundPolicyPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const [t, common, tRoot] = await Promise.all([
    getTranslations({locale, namespace: "RefundPolicy"}),
    getTranslations({locale, namespace: "Common"}),
    // Unscoped: the breadcrumb label keys are fully qualified (`Common.breadcrumbRefundPolicy`).
    getTranslations({locale}),
  ]);

  return (
    <>
      <PageHero
        eyebrow={t("eyebrow")}
        title={t("title")}
        lead={t("description")}
        breadcrumb={{homeHref: "/", homeLabel: common("breadcrumbHome"), current: t("breadcrumbCurrent")}}
        breadcrumbLabel={common("breadcrumbLabel")}
      />
      <PolicySections sections={parsePolicySections(t.raw("sections"))} />
      <StructuredData data={buildBreadcrumbData(routeBreadcrumbItems(locale as AppLocale, "/refund-policy", tRoot))} />
    </>
  );
}
