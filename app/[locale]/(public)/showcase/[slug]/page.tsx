import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {RequestIntroForm} from "@/components/marketing/request-intro-form";
import {ShowcaseDetail} from "@/components/marketing/showcase-detail";
import {ShowcaseViewBeacon} from "@/components/marketing/showcase-view-beacon";
import {StructuredData} from "@/components/seo/structured-data";
import type {AppLocale} from "@/i18n/routing";
import {showcaseRepository} from "@/lib/db/repos/showcase";
import {buildPageMetadata} from "@/lib/metadata";
import {toPublicListing} from "@/lib/showcase/contracts";
import {softwareApplicationJsonLd} from "@/lib/showcase/public";
import {requestIntroAction} from "@/lib/showcase/lead-request-action";

export const dynamic = "force-dynamic";
type Props = Readonly<{params: Promise<{locale: string; slug: string}>}>;

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale: localeValue, slug} = await params;
  const locale = localeValue as AppLocale;
  const row = await showcaseRepository.getPublishedBySlug(slug).catch(() => null);
  if (!row) return buildPageMetadata({locale, pathname: `/showcase/${slug}`, title: "Showcase", description: "WTIA member showcase"});
  const listing = toPublicListing(row, locale);
  return buildPageMetadata({locale, pathname: `/showcase/${listing.slug}`, title: `${listing.name} | WTIA Showcase`, description: listing.description});
}

export default async function ShowcaseDetailPage({params}: Props) {
  const {locale: localeValue, slug} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const row = await showcaseRepository.getPublishedBySlug(slug);
  if (!row) notFound();
  const listing = toPublicListing(row, locale);
  const t = await getTranslations({locale, namespace: "Showcase"});
  const labels = {premium: t("premium"), goneGlobal: t("goneGlobal"), memberSince: t("memberSince"), overview: t("details.overview"), capabilities: t("details.capabilities"), useCases: t("details.useCases"), deployment: t("details.deployment"), languages: t("details.languages"), worksWith: t("details.worksWith"), caseStudy: t("details.caseStudy"), video: t("details.video"), requestIntro: t("details.requestIntro")};
  const requestIntro = <RequestIntroForm action={requestIntroAction} locale={locale} slug={listing.slug} labels={{name: t("details.form.name"), email: t("details.form.email"), organization: t("details.form.organization"), message: t("details.form.message"), website: t("details.form.website"), submit: t("details.form.submit"), submitting: t("details.form.submitting"), success: t("details.form.success"), invalid: t("details.form.invalid"), rateLimited: t("details.form.rateLimited")}}/>;
  const jsonLd = softwareApplicationJsonLd(listing, locale);
  return <div className="container mx-auto px-6 py-16"><ShowcaseViewBeacon slug={listing.slug}/><ShowcaseDetail listing={listing} locale={locale} labels={labels} requestIntro={requestIntro}/><StructuredData data={jsonLd}/></div>;
}
