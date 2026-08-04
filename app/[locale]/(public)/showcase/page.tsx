import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {ShowcaseCard} from "@/components/marketing/showcase-card";
import {ShowcaseFilters} from "@/components/marketing/showcase-filters";
import {EmptyState} from "@/components/marketing/empty-state";
import {PageHero} from "@/components/marketing/page-hero";
import type {AppLocale} from "@/i18n/routing";
import {showcaseRepository} from "@/lib/db/repos/showcase";
import {buildPageMetadata} from "@/lib/metadata";
import {parseShowcaseFilters, toPublicListing} from "@/lib/showcase/contracts";

export const dynamic = "force-dynamic";
type Props = Readonly<{params: Promise<{locale: string}>; searchParams: Promise<Record<string, string | string[] | undefined>>}>;

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "Showcase"});
  return buildPageMetadata({locale: locale as AppLocale, pathname: "/showcase", title: t("metaTitle"), description: t("metaDescription")});
}

export default async function ShowcasePage({params, searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const [t, query] = await Promise.all([getTranslations({locale, namespace: "Showcase"}), searchParams]);
  const filters = parseShowcaseFilters(query);
  const listings = (await showcaseRepository.listPublished(filters)).map((row) => toPublicListing(row, locale));
  const cardLabels = {premium: t("premium"), memberSince: t("memberSince"), view: t("view")};
  return <><PageHero eyebrow={t("eyebrow")} title={t("title")} description={t("description")}/><main className="container mx-auto space-y-8 px-6 py-16"><ShowcaseFilters filters={filters} labels={{search: t("filters.search"), category: t("filters.category"), useCase: t("filters.useCase"), deployment: t("filters.deployment"), language: t("filters.language"), worksWith: t("filters.worksWith"), submit: t("filters.submit"), clear: t("filters.clear")}}/>{listings.length ? <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">{listings.map((listing) => <ShowcaseCard key={listing.slug} listing={listing} locale={locale} labels={cardLabels}/>)}</div> : <EmptyState title={t("emptyTitle")} description={t("emptyDescription")}/>}</main></>;
}
