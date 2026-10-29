import {OPS_MEMBERSHIP_TIERS} from "@/config/membership-journey";
import {membershipSelfServicePolicy} from "@/lib/membership/policy-self-service";
import {PLAN_CATALOG} from "@/lib/membership/plans";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AwaitReadModel } from "@/components/server/await-read-model";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { MembershipDimensions } from "@/components/marketing/membership-dimensions";
import { ActionLink } from "@/components/wt/action-link";
import { PlanGrid, type PlanGridTier } from "@/components/marketing/plan-grid";
import { PricingNote } from "@/components/marketing/pricing-note";
import { WhatsAppLink } from "@/components/marketing/whatsapp-link";
import { StructuredData } from "@/components/seo/structured-data";
import { ClosingBand } from "@/components/wt/closing-band";
import { HonestEmpty } from "@/components/wt/honest-empty";
import { PageHero } from "@/components/wt/page-hero";
import { Section } from "@/components/wt/section";
import { StepGrid } from "@/components/wt/step-grid";
import { siteConfig } from "@/config/site";
import type { AppLocale } from "@/i18n/routing";
import { membershipPlansRepository } from "@/lib/db/repos/membership-plans";
import { buildPageMetadata } from "@/lib/metadata";
import { routeBreadcrumbItems } from "@/lib/seo/route-breadcrumbs";
import { buildBreadcrumbData } from "@/lib/structured-data";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string }> };

const DIMENSION_KEYS = [
  "network",
  "programmes",
  "visibility",
  "events",
  "showcase",
  "committees",
  "seats",
  "billing",
  "onboarding",
  "governance",
  "support",
  "renewal",
] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Membership" });
  return buildPageMetadata({
    locale: locale as AppLocale,
    pathname: "/membership",
    title: t("metaTitle"),
    description: t("metaDescription"),
  });
}

export default async function MembershipPage({ params }: Props) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as AppLocale;
  setRequestLocale(locale);

  const rowsPromise = membershipPlansRepository.list().catch(() => null);
  const [t, tCommon, tWhatsApp, tRoot] = await Promise.all([
    getTranslations({ locale, namespace: "Membership" }),
    getTranslations({ locale, namespace: "Common" }),
    getTranslations({ locale, namespace: "WhatsApp" }),
    // Unscoped: the breadcrumb label keys are fully qualified (`Navigation.links.*`).
    getTranslations({ locale }),
  ]);
  const dimensions = DIMENSION_KEYS.map((key) => ({
    title: t(`dimensions.${key}.title`),
    copy: t(`dimensions.${key}.copy`),
  }));
  const steps = [0, 1, 2, 3, 4].map((index) => ({
    title: t(`first90.steps.${index}.title`),
    copy: t(`first90.steps.${index}.copy`),
  }));
  const questions = Array.from({ length: 9 }, (_, index) => ({
    question: t(`faq.${index}.question`),
    answer: t(`faq.${index}.answer`),
  }));

  function renderPlans(
    rows: Awaited<ReturnType<typeof membershipPlansRepository.list>> | null,
  ) {
    void rows;
    const annual = t("cadenceLabels.annual");
    // Paid prices are the ops list. Community is free and does not wait on Stripe.
    // Checkout for the paid tiers still needs a price id; this page does not create one.
    const money = new Intl.NumberFormat(locale, {style: "currency", currency: "HKD", minimumFractionDigits: 0, maximumFractionDigits: 0});
    const offer = [
      {code: "community" as const, annualPriceHkd: null},
      ...OPS_MEMBERSHIP_TIERS,
    ];
    const tiers: PlanGridTier[] = offer.map((tier) => ({
      code: tier.code,
      name: t(`tiers.${tier.code}.name`),
      description: t(`tiers.${tier.code}.description`),
      priceLines: [tier.annualPriceHkd === null ? t("priceLabels.free") : `${money.format(tier.annualPriceHkd)} ${annual}`],
      seatLabel: t("compare.seats", {count: PLAN_CATALOG[tier.code].seatAllowance}),
      benefits: t.raw(`tierBenefits.${tier.code}`) as string[],
      action: t("actions.join"),
      href: `/join?plan=${tier.code}`,
    }));
    const pricingReady = true;
    return (
      <Section id="plans" labelledBy="membership-plans-title">
        <h2 className="sr-only" id="membership-plans-title">
          {t("tiersTitle")}
        </h2>
        {tiers.length > 0 ? (
          <>
            <PlanGrid
              labels={{audience: t("compare.audience"), fee: t("compare.fee"), uses: t("compare.uses"), next: t("compare.next")}}
              sme={{
                label: t("sme.label"),
                title: t("sme.title"),
                copy: t("sme.copy"),
                action: t("sme.action"),
                href: "/contact",
              }}
              tiers={tiers}
            />
            <PricingNote
              copy={t(
                pricingReady ? "pricing.readyCopy" : "pricing.fallbackCopy",
              )}
              label={t(
                pricingReady ? "pricing.readyLabel" : "pricing.fallbackLabel",
              )}
            />
          </>
        ) : (
          <HonestEmpty
            copy={t("tiersIntro")}
            title={t("unavailable")}
            variant="inner"
          />
        )}
      </Section>
    );
  }

  return (
    <>
      <PageHero
        className="defer-following-sections"
        breadcrumb={{
          homeHref: "/",
          homeLabel: tCommon("breadcrumbHome"),
          current: t("breadcrumbCurrent"),
        }}
        breadcrumbLabel={tCommon("breadcrumbLabel")}
        eyebrow={t("eyebrow")}
        lead={t("summary")}
        title={t("title")}
        actions={[{href: "#plans", label: t("compare.action")}]}
      />
      <Section labelledBy="membership-tracks-title">
        <h2 id="membership-tracks-title">{t("tracks.title")}</h2>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="font-serif text-2xl font-semibold">{t("tracks.individual.title")}</h3>
            <p className="mt-2 text-muted-foreground">{t("tracks.individual.copy")}</p>
          </div>
          <div>
            <h3 className="font-serif text-2xl font-semibold">{t("tracks.organisation.title")}</h3>
            <p className="mt-2 text-muted-foreground">{t("tracks.organisation.copy")}</p>
            <p className="mt-2 text-muted-foreground">{t("tracks.sla")}</p>
          </div>
        </div>
      </Section>
      <Section labelledBy="membership-renew-title">
        <h2 id="membership-renew-title">{t("renew.title")}</h2>
        <p className="mt-2 text-muted-foreground">{t("renew.copy")}</p>
        <div className="mt-4">
          <ActionLink href="/member-login?next=/portal/billing" prefetch={false} variant="text-link">{t("renew.action")}</ActionLink>
        </div>
      </Section>
      <nav aria-label={t("selfService.title")} className="shell flex flex-wrap items-center gap-5 py-6">
        <ActionLink href={membershipSelfServicePolicy.links.billing.href} prefetch={false} variant="text-link">{t(membershipSelfServicePolicy.links.billing.labelKey)}</ActionLink>
        <ActionLink href={membershipSelfServicePolicy.links.support.href} variant="text-link">{t(membershipSelfServicePolicy.links.support.labelKey)}</ActionLink>
      </nav>
      <Suspense
        fallback={
          <div className="min-h-screen">
            <p className="shell py-10" role="status">
              {tCommon("membershipPlansLoading")}
            </p>
          </div>
        }
      >
        <AwaitReadModel pending={rowsPromise}>
          {(rows) => (
            <>
              {renderPlans(rows)}
              <Section labelledBy="membership-dimensions-title">
                <h2 className="sr-only" id="membership-dimensions-title">
                  {t("dimensionsTitle")}
                </h2>
                <MembershipDimensions items={dimensions} />
              </Section>
              <Section id="faq" labelledBy="membership-faq-title">
                <h2 id="membership-faq-title">{t("faqTitle")}</h2>
                <dl className="mt-8 grid gap-6 md:grid-cols-2">
                  {questions.map(({ question, answer }) => (
                    <div
                      className="rounded-lg border bg-card p-5"
                      key={question}
                    >
                      <dt className="font-semibold">{question}</dt>
                      <dd className="mt-2 text-muted-foreground">{answer}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-6 flex flex-wrap gap-5">
                  <ActionLink href="/refund-policy" variant="text-link">
                    {t("faqLinks.refund")}
                  </ActionLink>
                  <ActionLink href="/contact" variant="text-link">
                    {t("faqLinks.contact")}
                  </ActionLink>
                </div>
              </Section>
              <Section labelledBy="membership-first90-title">
                <h2 id="membership-first90-title">{t("first90.heading")}</h2>
                <StepGrid steps={steps} />
              </Section>
              <ClosingBand
                actions={[
                  { label: t("closing.join"), href: "/join" },
                  {
                    label: t("closing.contact"),
                    href: `mailto:${siteConfig.contact.email}`,
                  },
                ]}
                copy={t("closing.copy")}
                extra={
                  <WhatsAppLink
                    className="text-link light-link"
                    label={tWhatsApp("chat")}
                    locale={locale}
                    prefill={tWhatsApp("prefill.membership")}
                    source="membership"
                  />
                }
                eyebrow={t("closing.eyebrow")}
                title={t("closing.title")}
              />
              <StructuredData
                data={buildBreadcrumbData(
                  routeBreadcrumbItems(locale, "/membership", tRoot),
                )}
              />
            </>
          )}
        </AwaitReadModel>
      </Suspense>
    </>
  );
}
