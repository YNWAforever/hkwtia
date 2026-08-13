import type {MetadataRoute} from "next";

import {publicRoutes} from "@/config/public-routes";
import {events} from "@/content/events";
import type {AppLocale} from "@/i18n/routing";
import {eventsRepository} from "@/lib/db/repos/events";
import {
  listPublishedBuildLogs,
  listPublishedNews,
  type PublishedBuildLogSummary,
} from "@/lib/db/repos/public-posts";
import {showcaseRepository} from "@/lib/db/repos/showcase";
import {absoluteUrl, localizedPath} from "@/lib/urls";

const locales: AppLocale[] = ["en", "zh-HK"];

function alternates(pathname: string) {
  return {
    languages: {
      en: absoluteUrl(localizedPath("en", pathname)),
      "zh-HK": absoluteUrl(localizedPath("zh-HK", pathname)),
    },
  };
}

function localizedEntries(pathname: string): MetadataRoute.Sitemap {
  const languages = alternates(pathname);
  return locales.map((locale) => ({
    url: absoluteUrl(localizedPath(locale, pathname)),
    alternates: languages,
  }));
}

const anonymous = {kind: "anonymous", userId: null} as const;

/**
 * Every database-backed route below is mutable, so this document must be built
 * per request like the pages it indexes.
 *
 * Without this the route prerenders once at build time and never revalidates —
 * `compute: "static"`, `response: "complete"` in the prerender manifest. Staff
 * publishing news, approving a showcase listing or adding an event would then
 * produce pages that are live and crawlable but absent from the sitemap until
 * the next deploy. Worse, the per-read `catch`es below degrade silently, so a
 * build that cannot reach the database bakes a sitemap of static routes only
 * and reports nothing. Every other database-backed public page sets this, or
 * inherits it from its layout; this route has no layout to inherit from.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Independent reads, so they run concurrently: the sequential form paid the
  // full connect timeout four times over when the database was unreachable.
  // Each still degrades on its own, so one failure cannot empty the others.
  const [buildLogs, eventSlugs, newsSlugs, showcaseSlugs] = await Promise.all([
    listPublishedBuildLogs().catch((): readonly PublishedBuildLogSummary[] => []),
    // Event pages are database-backed, so the static content list alone would
    // leave every published event out of the sitemap.
    eventsRepository.listPublic(anonymous)
      .then((rows) => rows.map(({slug}) => slug))
      .catch((): readonly string[] => []),
    listPublishedNews()
      .then((rows) => rows.map(({slug}) => slug))
      .catch((): readonly string[] => []),
    showcaseRepository.listPublishedSlugs().catch((): readonly string[] => []),
  ]);
  const staticEntries = publicRoutes.flatMap((pathname) =>
    localizedEntries(pathname));
  const eventSlugSet = new Set([...events.map(({slug}) => slug), ...eventSlugs]);
  const eventEntries = [...eventSlugSet].flatMap((slug) =>
    localizedEntries(`/events/${slug}`));
  // News and build logs share the /news namespace and a unique slug index.
  const newsEntries = [...new Set([...newsSlugs, ...buildLogs.map(({slug}) => slug)])]
    .flatMap((slug) => localizedEntries(`/news/${slug}`));
  const showcaseEntries = showcaseSlugs.flatMap((slug) =>
    localizedEntries(`/showcase/${slug}`));

  return [
    ...staticEntries,
    ...eventEntries,
    ...newsEntries,
    ...showcaseEntries,
  ];
}
