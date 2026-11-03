import type {MetadataRoute} from "next";

import {publicRoutes} from "@/config/public-routes";
import {milestones} from "@/content/milestones";
import {companyProfilesRepository} from "@/lib/db/repos/company-profiles";
import {eventsRepository} from "@/lib/db/repos/events";
import {
  listPublishedBuildLogs,
  listPublishedNews,
  type PublishedNewsSummary,
} from "@/lib/db/repos/public-posts";
import {showcaseRepository} from "@/lib/db/repos/showcase";
import {milestonesOnly} from "@/lib/history/milestones";
import type {AppLocale} from "@/i18n/routing";
import {buildLastmod, contentFileLastmod, staticRouteLastmod} from "@/lib/seo/sitemap-lastmod";
import {absoluteUrl, localizedPath} from "@/lib/urls";

const locales: AppLocale[] = ["en", "zh-HK"];

function alternates(pathname: string) {
  const englishUrl = absoluteUrl(localizedPath("en", pathname));
  return {
    languages: {
      en: englishUrl,
      "zh-HK": absoluteUrl(localizedPath("zh-HK", pathname)),
      "x-default": englishUrl, // x-default -> English (design D-2): hreflang tags stay zh-HK, not the donor's zh-Hant.
    },
  };
}

function localizedEntries(pathname: string, lastModified: Date): MetadataRoute.Sitemap {
  const languages = alternates(pathname);
  return locales.map((locale) => ({
    url: absoluteUrl(localizedPath(locale, pathname)),
    lastModified,
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

  for (const post of english) {
    const pathname = `/news/${post.slug}`;
    entries.push({
      url: absoluteUrl(localizedPath("en", pathname)),
      lastModified: post.publishedAt,
      ...(chineseSlugs.has(post.slug) ? {alternates: alternates(pathname)} : {}),
    });
  }
  for (const post of chinese) {
    const pathname = `/news/${post.slug}`;
    entries.push({
      url: absoluteUrl(localizedPath("zh-HK", pathname)),
      lastModified: post.publishedAt,
      ...(englishSlugs.has(post.slug) ? {alternates: alternates(pathname)} : {}),
    });
  }

  return entries;
}

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const asOf = new Date();
  const [buildLogs, eventSlugs, englishNews, chineseNews, showcaseSlugs, memberSlugs] = await Promise.all([
    listPublishedBuildLogs(),
    eventsRepository.listPublicSlugs(),
    listPublishedNews("en", asOf),
    listPublishedNews("zh-HK", asOf),
    showcaseRepository.listPublishedSlugs(),
    // A transient read failure must not publish an apparently complete partial sitemap.
    companyProfilesRepository.listPublishedSlugs(),
  ]);
  // Static pages use the page file's mtime. Database listings without a row timestamp
  // use the build stamp. News and build logs use publishedAt. Milestone pages share
  // the content file's mtime. None of these are invented calendar dates.
  const built = buildLastmod();
  const milestoneModified = contentFileLastmod("content/milestones.ts");
  const staticEntries = publicRoutes.flatMap((pathname) => localizedEntries(pathname, staticRouteLastmod(pathname)));
  const eventEntries = eventSlugs.flatMap((slug) => localizedEntries(`/events/${slug}`, built));
  const buildLogEntries = buildLogs.flatMap((post) => localizedEntries(`/news/${post.slug}`, post.publishedAt));
  const newsEntries = localizedNewsEntries(englishNews, chineseNews);
  // Every milestone, not only the featured six: these are 25 years of association
  // history, already bilingual, and they are the largest body of indexable content the
  // site has. Must stay in lockstep with generateStaticParams in the history route --
  // a sitemap wider than the route publishes urls that 404.
  const milestoneEntries = milestonesOnly(milestones)
    .flatMap(({slug}) => localizedEntries(`/about/history/${slug}`, milestoneModified));
  const showcaseEntries = showcaseSlugs.flatMap((slug) => localizedEntries(`/showcase/${slug}`, built));
  const memberEntries = memberSlugs.flatMap((slug) => localizedEntries(`/members/${slug}`, built));
  return [
    ...staticEntries,
    ...eventEntries,
    ...newsEntries,
    ...buildLogEntries,
    ...showcaseEntries,
    ...memberEntries,
    ...milestoneEntries,
  ];
}
