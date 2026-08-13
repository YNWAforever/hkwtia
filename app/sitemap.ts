import type {MetadataRoute} from "next";

import {publicRoutes} from "@/config/public-routes";
import {milestones} from "@/content/milestones";
import {featuredOnly, milestonesOnly} from "@/lib/history/milestones";
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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let buildLogs: readonly PublishedBuildLogSummary[] = [];
  let newsSlugs: readonly string[] = [];
  let showcaseSlugs: readonly string[] = [];
  // Event pages are database-backed, so the static content list alone would
  // leave every published event out of the sitemap.
  let eventSlugs: readonly string[] = [];
  try {
    buildLogs = await listPublishedBuildLogs();
  } catch {
    buildLogs = [];
  }
  try {
    eventSlugs = (await eventsRepository.listPublic(anonymous)).map(({slug}) => slug);
  } catch {
    eventSlugs = [];
  }
  try {
    newsSlugs = (await listPublishedNews()).map(({slug}) => slug);
  } catch {
    newsSlugs = [];
  }
  try {
    showcaseSlugs = await showcaseRepository.listPublishedSlugs();
  } catch {
    showcaseSlugs = [];
  }
  const staticEntries = publicRoutes.flatMap((pathname) =>
    localizedEntries(pathname));
  const eventSlugSet = new Set([...events.map(({slug}) => slug), ...eventSlugs]);
  const eventEntries = [...eventSlugSet].flatMap((slug) =>
    localizedEntries(`/events/${slug}`));
  // News and build logs share the /news namespace and a unique slug index.
  const newsEntries = [...new Set([...newsSlugs, ...buildLogs.map(({slug}) => slug)])]
    .flatMap((slug) => localizedEntries(`/news/${slug}`));
  // Only the featured milestones have pages of their own; the rest render
  // inline on the timeline, so listing them would advertise a 404. This is
  // typed content rather than a database read, so it cannot fail the way the
  // reads above can and needs no catch.
  const milestoneEntries = featuredOnly(milestonesOnly(milestones)).flatMap(({slug}) =>
    localizedEntries(`/about/history/${slug}`));
  const showcaseEntries = showcaseSlugs.flatMap((slug) =>
    localizedEntries(`/showcase/${slug}`));

  return [
    ...staticEntries,
    ...eventEntries,
    ...newsEntries,
    ...showcaseEntries,
    ...milestoneEntries,
  ];
}
