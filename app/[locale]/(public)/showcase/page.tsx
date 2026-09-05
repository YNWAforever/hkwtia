import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {DirectoryPrompts} from "@/components/marketing/directory-prompts";
import {ShowcaseCard} from "@/components/marketing/showcase-card";
import {ShowcaseFilters} from "@/components/marketing/showcase-filters";
import {SolutionNeeds} from "@/components/marketing/solution-needs";
import {SolutionPathways} from "@/components/marketing/solution-pathways";
import {SolutionVerification} from "@/components/marketing/solution-verification";
import {ActionLink} from "@/components/wt/action-link";
import {HonestEmpty} from "@/components/wt/honest-empty";
import {InterestBand} from "@/components/wt/interest-band";
import {PageHero} from "@/components/wt/page-hero";
import {Section} from "@/components/wt/section";
import type {AppLocale} from "@/i18n/routing";
import {showcaseRepository} from "@/lib/db/repos/showcase";
import {buildPageMetadata} from "@/lib/metadata";
import {parseShowcaseFilters, toPublicListing} from "@/lib/showcase/contracts";

export const dynamic = "force-dynamic";
type Props = Readonly<{params: Promise<{locale: string}>; searchParams: Promise<Record<string, string | string[] | undefined>>}>;

const PROMPTS = [
  {key: "aiConcierge", query: "AI concierge"},
  {key: "cybersecurity", query: "Cybersecurity"},
  {key: "crossBorderTrade", query: "Cross-border trade"},
  {key: "cloudMigration", query: "Cloud migration"},
  {key: "generativeAi", query: "Generative AI"},
  {key: "fintech", query: "Fintech"},
] as const;

const USE_CASES = [
  "customerService", "cybersecurity", "tradeCompliance", "supplyChain", "fintechPayments", "dataAnalytics",
  "hrTalent", "marketingAutomation", "legalCompliance", "smartManufacturing", "sustainabilityEsg", "crossBorderTrade",
] as const;
const USE_CASE_SLUGS: Record<(typeof USE_CASES)[number], string> = {
  customerService: "customer-service", cybersecurity: "cybersecurity", tradeCompliance: "trade-compliance",
  supplyChain: "supply-chain", fintechPayments: "fintech-payments", dataAnalytics: "data-analytics",
  hrTalent: "hr-talent", marketingAutomation: "marketing-automation", legalCompliance: "legal-compliance",
  smartManufacturing: "smart-manufacturing", sustainabilityEsg: "sustainability-esg", crossBorderTrade: "cross-border-trade",
};
const BADGE_KEYS = ["verifiedDeployment", "reviewedEvidence", "dataHandling"] as const;

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "Showcase"});
  return buildPageMetadata({locale: locale as AppLocale, pathname: "/showcase", title: t("metaTitle"), description: t("metaDescription")});
}

export default async function ShowcasePage({params, searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const [t, tCommon, query] = await Promise.all([
    getTranslations({locale, namespace: "Showcase"}),
    getTranslations({locale, namespace: "Common"}),
    searchParams,
  ]);
  const filters = parseShowcaseFilters(query);
  // A database outage degrades to the empty state rather than a 500 -- unchanged from today.
  const rows = await showcaseRepository.listPublished(filters).catch(() => []);
  const listings = rows.map((row) => toPublicListing(row, locale));
  const cardLabels = {premium: t("premium"), goneGlobal: t("goneGlobal"), memberSince: t("memberSince"), category: t("filters.category"), view: t("view")};
  const filterLabels = {search: t("filters.search"), category: t("filters.category"), useCase: t("filters.useCase"), deployment: t("filters.deployment"), language: t("filters.language"), worksWith: t("filters.worksWith"), submit: t("filters.submit"), clear: t("filters.clear")};
  const prompts = PROMPTS.map((prompt) => ({query: prompt.query, label: t(`prompts.${prompt.key}`)}));
  const chips = USE_CASES.map((key) => ({slug: USE_CASE_SLUGS[key], label: t(`needs.${key}`)}));
  const badges = BADGE_KEYS.map((key) => ({title: t(`verification.badges.${key}.title`), copy: t(`verification.badges.${key}.copy`)}));

  return <>
    <PageHero
      breadcrumb={{homeHref: "/", homeLabel: tCommon("breadcrumbHome"), current: t("title")}}
      breadcrumbLabel={tCommon("breadcrumbLabel")}
      eyebrow={t("eyebrow")}
      lead={t("description")}
      title={t("title")}
    />
    <Section id="results" labelledBy="showcase-results-title">
      <h2 className="sr-only" id="showcase-results-title">{t("resultsTitle")}</h2>
      <DirectoryPrompts locale={locale} prompts={prompts} />
      <ShowcaseFilters filters={filters} labels={filterLabels} locale={locale} />
      <SolutionNeeds chips={chips} filters={filters} locale={locale} />
      {listings.length > 0
        ? <div className="partner-record-grid">{listings.map((listing) => <ShowcaseCard key={listing.slug} labels={cardLabels} listing={listing} locale={locale} />)}</div>
        : <HonestEmpty actions={[{label: t("filters.clear"), href: "/showcase"}]} copy={t("emptyDescription")} title={t("emptyTitle")} variant="inner" />}
    </Section>
    <SolutionVerification badges={badges} copy={t("verification.copy")} label={t("verification.label")} title={t("verification.title")} />
    <Section labelledBy="showcase-pathways-title">
      <h2 className="sr-only" id="showcase-pathways-title">{t("pathways.heading")}</h2>
      <SolutionPathways
        buyer={{label: t("pathways.buyer.label"), title: t("pathways.buyer.title"), copy: t("pathways.buyer.copy"), action: t("pathways.buyer.action"), href: "/contact"}}
        provider={{label: t("pathways.provider.label"), title: t("pathways.provider.title"), copy: t("pathways.provider.copy"), action: t("ownerCta"), href: "/portal/company/listing"}}
      />
    </Section>
    <InterestBand
      action={<ActionLink href="/events" variant="button-light">{t("interest.action")}</ActionLink>}
      copy={t("interest.copy")}
      eyebrow={t("interest.eyebrow")}
      title={t("interest.title")}
    />
  </>;
}
