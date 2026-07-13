import type {Event, FAQPage, Organization, WithContext} from 'schema-dts';

import {siteConfig} from '@/config/site';
import type {EventRecord} from '@/content/schemas';
import {absoluteUrl} from '@/lib/urls';

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

export function buildEventData(record: EventRecord, title: string): WithContext<Event> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: title,
    startDate: record.startsAt,
    ...(record.endsAt ? {endDate: record.endsAt} : {}),
    image: absoluteUrl(record.image),
    url: absoluteUrl(`/events/${record.slug}`),
    location: {
      '@type': 'Place',
      name: record.venue,
    },
    organizer: {
      '@type': 'Organization',
      name: siteConfig.name,
      url: absoluteUrl('/'),
    },
  };
}
