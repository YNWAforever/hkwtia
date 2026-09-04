import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {MembershipDimensions} from "@/components/marketing/membership-dimensions";
import {PlanGrid, type PlanGridTier} from "@/components/marketing/plan-grid";
import {PricingNote} from "@/components/marketing/pricing-note";
import {ClosingBand} from "@/components/wt/closing-band";
import {HonestEmpty} from "@/components/wt/honest-empty";
import {PageHero} from "@/components/wt/page-hero";
import {Section} from "@/components/wt/section";
import {StepGrid} from "@/components/wt/step-grid";
import {siteConfig} from "@/config/site";
import type {AppLocale} from "@/i18n/routing";
import {membershipPlansRepository} from "@/lib/db/repos/membership-plans";
import {buildPageMetadata} from "@/lib/metadata";
import {buildPublicMembershipCatalog, publicPriceIds, type PublicMembershipTier} from "@/lib/membership/public-catalog";

export const dynamic = "force-dynamic";
type Props = {params: Promise<{locale: string}>};

const DIMENSION_KEYS = [
  "network", "programmes", "visibility", "events", "showcase", "committees",
  "seats", "billing", "onboarding", "governance", "support", "renewal",
] as const;

function priceLines(price: PublicMembershipTier["price"], labels: Readonly<{free: string; review: string; annual: string; monthly: string}>): readonly string[] {
  if (price.kind === "free") return [labels.free];
  if (price.kind === "review") return [labels.review];
  return price.options.map((option) => `${option.amount} ${labels[option.cadence]}`);
}

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "Membership"});
  return buildPageMetadata({locale: locale as AppLocale, pathname: "/membership", title: t("metaTitle"), description: t("metaDescription")});
}

export default async function MembershipPage({params}: Props) {
  const {locale: rawLocale} = await params;
  const locale = rawLocale as AppLocale;
  setRequestLocale(locale);

  const [t, tCommon, rows] = await Promise.all([
    getTranslations({locale, namespace: "Membership"}),
    getTranslations({locale, namespace: "Common"}),
    membershipPlansRepository.list().catch(() => null),
  ]);
  const publicTiers = rows === null ? [] : buildPublicMembershipCatalog({locale, rows, priceIds: publicPriceIds()});
  const labels = {free: t("priceLabels.free"), review: t("priceLabels.review"), annual: t("cadenceLabels.annual"), monthly: t("cadenceLabels.monthly")};
  const benefits = [t("benefits.network"), t("benefits.programs"), t("benefits.visibility")];
  const tiers: PlanGridTier[] = publicTiers.map((tier) => ({
    code: tier.code,
    name: t(`tiers.${tier.code}.name`),
    description: t(`tiers.${tier.code}.description`),
    priceLines: priceLines(tier.price, labels),
    benefits,
    action: t("actions.discuss"),
    href: tier.cta.href,
  }));
  // "Ready" means both configured Startup/Corporate price ids actually resolved into the
  // catalog -- the same gate buildPublicMembershipCatalog already applies, read back here.
  // If either tier didn't resolve, PlanGrid silently omits it, so the page must not claim
  // both fees shown are confirmed -- only one would even be on the page.
  const pricingReady = publicTiers.some((tier) => tier.code === "startup") && publicTiers.some((tier) => tier.code === "corporate");
  const dimensions = DIMENSION_KEYS.map((key) => ({title: t(`dimensions.${key}.title`), copy: t(`dimensions.${key}.copy`)}));
  const steps = [0, 1, 2, 3, 4].map((index) => ({title: t(`first90.steps.${index}.title`), copy: t(`first90.steps.${index}.copy`)}));

  return <>
    <PageHero
      breadcrumb={{homeHref: "/", homeLabel: tCommon("breadcrumbHome"), current: t("title")}}
      breadcrumbLabel={tCommon("breadcrumbLabel")}
      eyebrow={t("eyebrow")}
      lead={t("summary")}
      title={t("title")}
    />
    <Section id="plans" labelledBy="membership-plans-title">
      <h2 className="sr-only" id="membership-plans-title">{t("tiersTitle")}</h2>
      {tiers.length > 0
        ? <>
            <PlanGrid sme={{label: t("sme.label"), title: t("sme.title"), copy: t("sme.copy"), action: t("sme.action"), href: "/contact"}} tiers={tiers} />
            <PricingNote copy={t(pricingReady ? "pricing.readyCopy" : "pricing.fallbackCopy")} label={t(pricingReady ? "pricing.readyLabel" : "pricing.fallbackLabel")} />
          </>
        : <HonestEmpty copy={t("tiersIntro")} title={t("unavailable")} variant="inner" />}
    </Section>
    <Section labelledBy="membership-dimensions-title">
      <h2 className="sr-only" id="membership-dimensions-title">{t("faqTitle")}</h2>
      <MembershipDimensions items={dimensions} />
    </Section>
    <Section labelledBy="membership-first90-title">
      <h2 id="membership-first90-title">{t("first90.heading")}</h2>
      <StepGrid steps={steps} />
    </Section>
    <ClosingBand
      actions={[{label: t("closing.join"), href: "/join"}, {label: t("closing.contact"), href: `mailto:${siteConfig.contact.email}`}]}
      copy={t("closing.copy")}
      eyebrow={t("closing.eyebrow")}
      title={t("closing.title")}
    />
  </>;
}
