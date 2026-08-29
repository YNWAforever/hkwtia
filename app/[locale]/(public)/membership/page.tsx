import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {FAQ} from "@/components/marketing/faq";
import {PageHero} from "@/components/marketing/page-hero";
import {Section} from "@/components/marketing/section";
import {TierComparison, type MembershipTier} from "@/components/marketing/tier-comparison";
import {StructuredData} from "@/components/seo/structured-data";
import type {AppLocale} from "@/i18n/routing";
import {membershipPlansRepository} from "@/lib/db/repos/membership-plans";
import {buildPageMetadata} from "@/lib/metadata";
import {buildPublicMembershipCatalog, publicPriceIds} from "@/lib/membership/public-catalog";
import {buildFaqData} from "@/lib/structured-data";

export const dynamic = "force-dynamic";

type Props = {params: Promise<{locale: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "Membership"});
  return buildPageMetadata({
    locale: locale as AppLocale,
    pathname: "/membership",
    title: t("metaTitle"),
    description: t("metaDescription"),
  });
}

export default async function MembershipPage({params}: Props) {
  const {locale: rawLocale} = await params;
  const locale = rawLocale as AppLocale;
  setRequestLocale(locale);

  const [t, rows] = await Promise.all([
    getTranslations({locale, namespace: "Membership"}),
    membershipPlansRepository.list().catch(() => null),
  ]);
  const publicTiers = rows === null
    ? []
    : buildPublicMembershipCatalog({locale, rows, priceIds: publicPriceIds()});
  const labels = {
    free: t("priceLabels.free"),
    review: t("priceLabels.review"),
    annual: t("cadenceLabels.annual"),
    monthly: t("cadenceLabels.monthly"),
  };
  const benefits = [t("benefits.network"), t("benefits.programs"), t("benefits.visibility")];
  const tiers: MembershipTier[] = publicTiers.map((tier) => ({
    ...tier,
    name: t(`tiers.${tier.code}.name`),
    description: t(`tiers.${tier.code}.description`),
    benefits,
    action: tier.cta.kind === "contact" ? t("actions.contact") : t("actions.join"),
    labels,
  }));
  const faq = [0, 1, 2].map((index) => ({
    question: t(`faq.${index}.question`),
    answer: t(`faq.${index}.answer`),
  }));

  return <>
    <StructuredData data={buildFaqData(faq)} />
    <PageHero eyebrow={t("eyebrow")} title={t("title")} description={t("summary")} />
    <Section heading={t("tiersTitle")} intro={t("tiersIntro")}>
      {tiers.length > 0
        ? <TierComparison locale={locale} tiers={tiers} />
        : <p className="text-muted-foreground" role="status">{t("unavailable")}</p>}
    </Section>
    <Section heading={t("faqTitle")}><FAQ items={faq} /></Section>
  </>;
}
