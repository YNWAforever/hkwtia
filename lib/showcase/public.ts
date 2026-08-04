import type {AppLocale} from "@/i18n/routing";
import type {PublicListing, ShowcaseFilters} from "@/lib/showcase/contracts";
import {absoluteUrl, localizedPath} from "@/lib/urls";

export function buildShowcaseQuery(filters: ShowcaseFilters): URLSearchParams {
  const query = new URLSearchParams();
  for (const key of ["category", "useCase", "deployment", "language", "worksWith", "q"] as const) {
    const value = filters[key];
    if (value) query.set(key, value);
  }
  return query;
}

export function softwareApplicationJsonLd(
  listing: PublicListing,
  locale: AppLocale,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: listing.name,
    description: listing.description,
    applicationCategory: listing.category,
    operatingSystem: listing.deploymentOptions.join(", "),
    inLanguage: listing.supportedLanguages,
    featureList: listing.useCases,
    softwareAddOn: listing.worksWith,
    url: absoluteUrl(localizedPath(locale, `/showcase/${listing.slug}`)),
    ...(listing.logoReference ? {image: absoluteUrl(listing.logoReference)} : {}),
  };
}
