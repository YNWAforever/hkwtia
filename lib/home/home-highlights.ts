import "server-only";

import type {AppLocale} from "@/i18n/routing";
import {eventsRepository, type FeaturedPublicEventOptions} from "@/lib/db/repos/events";
import {
  listPublishedNews,
  type PublishedNewsSummary,
  type PublicReadOptions as PublicPostsReadOptions,
} from "@/lib/db/repos/public-posts";
import {showcaseRepository, type PublicReadOptions as ShowcaseReadOptions, type PublicShowcaseRow} from "@/lib/db/repos/showcase";
import type {PublicEventProjection} from "@/lib/events/public";
import {toPublicListing, type PublicListing} from "@/lib/showcase/contracts";

export type HomeSlot<T> =
  | Readonly<{status: "available"; item: T}>
  | Readonly<{status: "empty"}>
  | Readonly<{status: "unavailable"}>;
export type HomeHighlights = Readonly<{
  event: HomeSlot<PublicEventProjection>;
  news: HomeSlot<PublishedNewsSummary>;
  showcase: HomeSlot<PublicListing>;
}>;
export type HomeHighlightReaders = Readonly<{
  events: (options: FeaturedPublicEventOptions) => Promise<readonly PublicEventProjection[]>;
  news: (
    locale: AppLocale,
    asOf: Date,
    options: PublicPostsReadOptions,
  ) => Promise<readonly PublishedNewsSummary[]>;
  showcase: (
    filters: Readonly<Record<string, unknown>>,
    options: ShowcaseReadOptions,
  ) => Promise<readonly PublicShowcaseRow[]>;
}>;

const anonymous = {kind: "anonymous", userId: null} as const;
const defaultReaders = {
  news: (locale: AppLocale, asOf: Date, options: PublicPostsReadOptions) =>
    listPublishedNews(locale, asOf, options),
  showcase: (
    filters: Readonly<Record<string, unknown>>,
    options: ShowcaseReadOptions,
  ) => showcaseRepository.listPublished(filters, options),
};

function slot<T, Mapped>(
  result: PromiseSettledResult<readonly T[]>,
  map: (item: T) => Mapped,
): HomeSlot<Mapped> {
  if (result.status === "rejected") return {status: "unavailable"};
  const [item] = result.value;
  return item === undefined ? {status: "empty"} : {status: "available", item: map(item)};
}

export async function loadHomeHighlights(input: Readonly<{
  locale: AppLocale;
  asOf?: Date;
  readers?: HomeHighlightReaders;
}>): Promise<HomeHighlights> {
  const {locale, asOf = new Date(), readers} = input;
  const eventReader = readers?.events ?? ((options: FeaturedPublicEventOptions) =>
    eventsRepository.listPublic(anonymous, {status: "open", asOf: options.asOf, locale})
      .then((rows) => rows.slice(0, options.limit)));
  const newsReader = readers?.news ?? defaultReaders.news;
  const showcaseReader = readers?.showcase ?? defaultReaders.showcase;
  const [eventResult, newsResult, showcaseResult] = await Promise.allSettled([
    eventReader({asOf, limit: 1}),
    newsReader(locale, asOf, {limit: 1}),
    showcaseReader({}, {limit: 1}),
  ] as const);
  return {
    event: slot(eventResult, (event) => event),
    news: slot(newsResult, (item) => item),
    showcase: slot(showcaseResult, (listing) => toPublicListing(listing, locale)),
  };
}
