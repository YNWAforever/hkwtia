import type {MetadataRoute} from "next";

import {publicRoutes} from "@/config/public-routes";
import {milestones} from "@/content/milestones";
import {eventsRepository} from "@/lib/db/repos/events";
import {
  listPublishedBuildLogs,
  listPublishedNews,
  type PublishedBuildLogSummary,
  type PublishedNewsSummary,
} from "@/lib/db/repos/public-posts";
import {showcaseRepository} from "@/lib/db/repos/showcase";
import {featuredOnly, milestonesOnly} from "@/lib/history/milestones";
import type {AppLocale} from "@/i18n/routing";
import {absoluteUrl, localizedPath} from "@/lib/urls";

const locales: AppLocale[] = ["en", "zh-HK"];
const anonymous = {kind: "anonymous", userId: null} as const;

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

function localizedNewsEntries(
  english: readonly PublishedNewsSummary[],
  chinese: readonly PublishedNewsSummary[],
): MetadataRoute.Sitemap {
  const englishSlugs = new Set(english.map(({slug}) => slug));
  const chineseSlugs = new Set(chinese.map(({slug}) => slug));
  const entries: MetadataRoute.Sitemap = [];

  for (const slug of englishSlugs) {
    const pathname = `/news/${slug}`;
    entries.push({
      url: absoluteUrl(localizedPath("en", pathname)),
      ...(chineseSlugs.has(slug) ? {alternates: alternates(pathname)} : {}),
    });
  }
  for (const slug of chineseSlugs) {
    const pathname = `/news/${slug}`;
    entries.push({
      url: absoluteUrl(localizedPath("zh-HK", pathname)),
      ...(englishSlugs.has(slug) ? {alternates: alternates(pathname)} : {}),
    });
  }

  return entries;
}

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const asOf = new Date();
  const [buildLogs, eventSlugs, englishNews, chineseNews, showcaseSlugs] = await Promise.all([
    listPublishedBuildLogs().catch((): readonly PublishedBuildLogSummary[] => []),
    eventsRepository.listPublic(anonymous, {status: "open", asOf})
      .then((rows) => rows.map(({slug}) => slug))
      .catch((): readonly string[] => []),
    listPublishedNews("en", asOf).catch((): readonly PublishedNewsSummary[] => []),
    listPublishedNews("zh-HK", asOf).catch((): readonly PublishedNewsSummary[] => []),
    showcaseRepository.listPublishedSlugs().catch((): readonly string[] => []),
  ]);
  const staticEntries = publicRoutes.flatMap((pathname) => localizedEntries(pathname));
  const eventEntries = eventSlugs.flatMap((slug) => localizedEntries(`/events/${slug}`));
  const buildLogEntries = buildLogs.flatMap(({slug}) => localizedEntries(`/news/${slug}`));
  const newsEntries = localizedNewsEntries(englishNews, chineseNews);
  const milestoneEntries = featuredOnly(milestonesOnly(milestones))
    .flatMap(({slug}) => localizedEntries(`/about/history/${slug}`));
  const showcaseEntries = showcaseSlugs.flatMap((slug) => localizedEntries(`/showcase/${slug}`));
  return [
    ...staticEntries,
    ...eventEntries,
    ...newsEntries,
    ...buildLogEntries,
    ...showcaseEntries,
    ...milestoneEntries,
  ];
}
