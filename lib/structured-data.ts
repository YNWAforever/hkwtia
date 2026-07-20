import type {Event, FAQPage, Organization, WithContext} from 'schema-dts';

import {siteConfig} from '@/config/site';
import type {EventRecord} from '@/content/schemas';
import type {AppLocale} from '@/i18n/routing';
import {absoluteUrl, localizedPath} from '@/lib/urls';

export type FaqItem = Readonly<{
  question: string;
  answer: string;
}>;

export function buildOrganizationData(): WithContext<Organization> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: siteConfig.name,
    alternateName: siteConfig.shortName,
    description: siteConfig.defaultDescription,
    url: absoluteUrl('/'),
    logo: absoluteUrl(siteConfig.defaultImage),
  };
}

export function buildFaqData(items: readonly FaqItem[]): WithContext<FAQPage> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question' as const,
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer' as const,
        text: item.answer,
      },
    })),
  };
}

type EventDataRecord = Pick<EventRecord, 'slug' | 'startsAt' | 'endsAt'> & Readonly<{venue: string | null; image?: string}>;

export function buildEventData(record: EventDataRecord, title: string, locale?: AppLocale): WithContext<Event> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: title,
    startDate: record.startsAt,
    ...(record.endsAt ? {endDate: record.endsAt} : {}),
    image: absoluteUrl(record.image ?? siteConfig.defaultImage),
    url: absoluteUrl(locale ? localizedPath(locale, `/events/${record.slug}`) : `/events/${record.slug}`),
    ...(record.venue ? {location: {
      '@type': 'Place' as const,
      name: record.venue,
    }} : {}),
    organizer: {
      '@type': 'Organization',
      name: siteConfig.name,
      url: absoluteUrl('/'),
    },
  };
}
