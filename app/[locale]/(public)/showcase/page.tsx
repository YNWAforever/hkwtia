import type {Metadata} from "next";
import Link from "next/link";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {ShowcaseCard} from "@/components/marketing/showcase-card";
import {ShowcaseFilters} from "@/components/marketing/showcase-filters";
import {EmptyState} from "@/components/marketing/empty-state";
import {PageHero} from "@/components/marketing/page-hero";
import type {AppLocale} from "@/i18n/routing";
import {showcaseRepository} from "@/lib/db/repos/showcase";
import {buildPageMetadata} from "@/lib/metadata";
import {parseShowcaseFilters, toPublicListing} from "@/lib/showcase/contracts";
import {localizedPath} from "@/lib/urls";

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
  // A database outage degrades to the empty state rather than a 500, matching
  // /news. This page is also where eight migrated member-story redirects land,
  // so someone following a link from a 2017 interview would otherwise meet an
  // error page rather than a directory that happens to be empty.
  const rows = await showcaseRepository.listPublished(filters).catch(() => []);
  const listings = rows.map((row) => toPublicListing(row, locale));
  const cardLabels = {premium: t("premium"), goneGlobal: t("goneGlobal"), memberSince: t("memberSince"), view: t("view")};
  return <>
    <PageHero eyebrow={t("eyebrow")} title={t("title")} description={t("description")}/>
    <section className="container mx-auto px-6 pt-16">
      <div className="glass-card flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div className="max-w-2xl">
          <h2 className="font-serif text-2xl font-semibold sm:text-3xl">{t("introTitle")}</h2>
          <p className="mt-3 leading-7 text-muted-foreground">{t("introDescription")}</p>
        </div>
        <Link
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          href={localizedPath(locale, "/portal/company/listing")}
        >
          {t("ownerCta")}
        </Link>
      </div>
    </section>
    <section aria-labelledby="showcase-results-title" className="container mx-auto space-y-8 px-6 py-16" id="results">
      <div className="max-w-2xl">
        <h2 className="font-serif text-3xl font-semibold" id="showcase-results-title">{t("resultsTitle")}</h2>
        <p className="mt-3 leading-7 text-muted-foreground">{t("resultsDescription")}</p>
      </div>
      <ShowcaseFilters locale={locale} filters={filters} labels={{search: t("filters.search"), category: t("filters.category"), useCase: t("filters.useCase"), deployment: t("filters.deployment"), language: t("filters.language"), worksWith: t("filters.worksWith"), submit: t("filters.submit"), clear: t("filters.clear")}}/>
      {listings.length
        ? <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">{listings.map((listing) => <ShowcaseCard key={listing.slug} listing={listing} locale={locale} labels={cardLabels}/>)}</div>
        : <EmptyState title={t("emptyTitle")} description={t("emptyDescription")}/>}
    </section>
  </>;
}
