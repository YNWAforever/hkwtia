import type {MetadataRoute} from "next";

import {publicRoutes} from "@/config/public-routes";
import {milestones} from "@/content/milestones";
import {featuredOnly, milestonesOnly} from "@/lib/history/milestones";
import type {AppLocale} from "@/i18n/routing";
import {eventsRepository} from "@/lib/db/repos/events";
import {listPublishedBuildLogs, listPublishedNews, type PublishedBuildLogSummary} from "@/lib/db/repos/public-posts";
import {showcaseRepository} from "@/lib/db/repos/showcase";
import {absoluteUrl, localizedPath} from "@/lib/urls";

const locales: AppLocale[] = ["en", "zh-HK"];
const anonymous = {kind: "anonymous", userId: null} as const;

function alternates(pathname: string) {
  return {languages: {en: absoluteUrl(localizedPath("en", pathname)), "zh-HK": absoluteUrl(localizedPath("zh-HK", pathname))}};
}

function localizedEntries(pathname: string): MetadataRoute.Sitemap {
  const languages = alternates(pathname);
  return locales.map((locale) => ({url: absoluteUrl(localizedPath(locale, pathname)), alternates: languages}));
}

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const asOf = new Date();
  const [buildLogs, eventSlugs, newsSlugs, showcaseSlugs] = await Promise.all([
    listPublishedBuildLogs().catch((): readonly PublishedBuildLogSummary[] => []),
    eventsRepository.listPublic(anonymous, {status: "open", asOf}).then((rows) => rows.map(({slug}) => slug)).catch((): readonly string[] => []),
    listPublishedNews().then((rows) => rows.map(({slug}) => slug)).catch((): readonly string[] => []),
    showcaseRepository.listPublishedSlugs().catch((): readonly string[] => []),
  ]);
  const staticEntries = publicRoutes.flatMap((pathname) => localizedEntries(pathname));
  const eventEntries = eventSlugs.flatMap((slug) => localizedEntries(`/events/${slug}`));
  const newsEntries = [...new Set([...newsSlugs, ...buildLogs.map(({slug}) => slug)])].flatMap((slug) => localizedEntries(`/news/${slug}`));
  const milestoneEntries = featuredOnly(milestonesOnly(milestones)).flatMap(({slug}) => localizedEntries(`/about/history/${slug}`));
  const showcaseEntries = showcaseSlugs.flatMap((slug) => localizedEntries(`/showcase/${slug}`));
  return [...staticEntries, ...eventEntries, ...newsEntries, ...showcaseEntries, ...milestoneEntries];
}
