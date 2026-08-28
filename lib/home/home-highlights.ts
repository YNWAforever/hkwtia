import "server-only";

import {
  eventsRepository,
  localizeEvent,
  type FeaturedPublicEventOptions,
  type LocalizedEvent,
} from "@/lib/db/repos/events";
import {
  listPublishedNews,
  type PublishedNewsSummary,
  type PublicReadOptions as PublicPostsReadOptions,
} from "@/lib/db/repos/public-posts";
import {
  showcaseRepository,
  type PublicReadOptions as ShowcaseReadOptions,
  type PublicShowcaseRow,
} from "@/lib/db/repos/showcase";
import type {Event} from "@/lib/db/server-schema";
import {toPublicListing, type PublicListing} from "@/lib/showcase/contracts";
import type {AppLocale} from "@/i18n/routing";

export type HomeSlot<T> =
  | Readonly<{status: "available"; item: T}>
  | Readonly<{status: "empty"}>
  | Readonly<{status: "unavailable"}>;

export type HomeHighlights = Readonly<{
  event: HomeSlot<LocalizedEvent>;
  news: HomeSlot<PublishedNewsSummary>;
  showcase: HomeSlot<PublicListing>;
}>;

export type HomeHighlightReaders = Readonly<{
  events: (options: FeaturedPublicEventOptions) => Promise<readonly Event[]>;
  news: (
    asOf: Date,
    options: PublicPostsReadOptions,
  ) => Promise<readonly PublishedNewsSummary[]>;
  showcase: (
    filters: Readonly<Record<string, unknown>>,
    options: ShowcaseReadOptions,
  ) => Promise<readonly PublicShowcaseRow[]>;
}>;

const anonymous = {kind: "anonymous", userId: null} as const;

const defaultReaders: HomeHighlightReaders = {
  events: (options) => eventsRepository.listFeaturedPublic(anonymous, options),
  news: (asOf, options) => listPublishedNews(asOf, options),
  showcase: (filters, options) => showcaseRepository.listPublished(filters, options),
};

function slot<T, Mapped>(
  result: PromiseSettledResult<readonly T[]>,
  map: (item: T) => Mapped,
): HomeSlot<Mapped> {
  if (result.status === "rejected") return {status: "unavailable"};
  const [item] = result.value;
  return item === undefined
    ? {status: "empty"}
    : {status: "available", item: map(item)};
}

export async function loadHomeHighlights(input: Readonly<{
  locale: AppLocale;
  asOf?: Date;
  readers?: HomeHighlightReaders;
}>): Promise<HomeHighlights> {
  const {locale, asOf = new Date(), readers = defaultReaders} = input;
  const [eventResult, newsResult, showcaseResult] = await Promise.allSettled([
    readers.events({asOf, limit: 1}),
    readers.news(asOf, {limit: 1}),
    readers.showcase({}, {limit: 1}),
  ] as const);

  return {
    event: slot(eventResult, (event) => localizeEvent(event, locale)),
    news: slot(newsResult, (item) => item),
    showcase: slot(showcaseResult, (listing) => toPublicListing(listing, locale)),
  };
}
