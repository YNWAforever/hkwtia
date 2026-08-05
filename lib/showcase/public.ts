import type {SoftwareApplication, WithContext} from "schema-dts";

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

/**
 * Typed so the projection can only be rendered through `StructuredData`, which
 * escapes `<` before the JSON reaches `dangerouslySetInnerHTML`.
 */
export function softwareApplicationJsonLd(
  listing: PublicListing,
  locale: AppLocale,
): WithContext<SoftwareApplication> {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: listing.name,
    description: listing.description,
    applicationCategory: listing.category,
    operatingSystem: listing.deploymentOptions.join(", "),
    inLanguage: listing.supportedLanguages,
    featureList: listing.useCases,
    // schema.org models add-ons as nested applications, not bare strings.
    softwareAddOn: listing.worksWith.map((name) => ({
      "@type": "SoftwareApplication" as const,
      name,
    })),
    url: absoluteUrl(localizedPath(locale, `/showcase/${listing.slug}`)),
    ...(listing.logoReference ? {image: absoluteUrl(listing.logoReference)} : {}),
  };
}
