import type {Event, EventAttendanceModeEnumeration, FAQPage, Organization, WebSite, WithContext} from 'schema-dts';

import {siteConfig} from '@/config/site';
import type {EventRecord} from '@/content/schemas';
import type {AppLocale} from '@/i18n/routing';
import type {PublicEventFormat} from '@/lib/events/public';
import {absoluteUrl, localizedPath} from '@/lib/urls';

export type FaqItem = Readonly<{
  question: string;
  answer: string;
}>;

// E-68: reads siteConfig.contact -- the English machine-readable record -- never
// Footer.addressLines, which is the per-locale printed authority for what a reader sees.
export function buildOrganizationData(): WithContext<Organization> {
  const {contact} = siteConfig;
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: siteConfig.name,
    alternateName: ['WiseTech Hong Kong', 'HKWTA', 'WTIA'],
    description: siteConfig.defaultDescription,
    url: absoluteUrl('/'),
    logo: absoluteUrl(siteConfig.defaultImage),
    email: contact.email,
    ...(contact.phone ? {telephone: contact.phone} : {}),
    address: {
      '@type': 'PostalAddress',
      streetAddress: contact.addressLines.slice(0, -1).join(', '),
      addressLocality: contact.addressLines.at(-1),
      addressCountry: 'HK',
    },
  };
}

export function buildWebSiteData(): WithContext<WebSite> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteConfig.name,
    url: absoluteUrl('/'),
    inLanguage: ['en-HK', 'zh-Hant-HK'],
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

// Programme B-6: a member-organised event names its company as the organizer, with a URL
// only once Phase B2 gives the company a public page; an admin-authored event (no
// organiser) keeps WTIA. `format` is optional because the static content records that
// also feed this builder carry none.
type EventDataRecord = Pick<EventRecord, 'slug' | 'startsAt' | 'endsAt'> & Readonly<{
  venue: string | null;
  image?: string;
  format?: PublicEventFormat;
  organiser?: Readonly<{name: string; url: string | null}> | null;
}>;

const ATTENDANCE_MODE: Readonly<Record<PublicEventFormat, EventAttendanceModeEnumeration>> = {
  in_person: 'https://schema.org/OfflineEventAttendanceMode',
  online: 'https://schema.org/OnlineEventAttendanceMode',
  hybrid: 'https://schema.org/MixedEventAttendanceMode',
};

export function buildEventData(record: EventDataRecord, title: string, locale?: AppLocale): WithContext<Event> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: title,
    startDate: record.startsAt,
    ...(record.endsAt ? {endDate: record.endsAt} : {}),
    ...(record.format ? {eventAttendanceMode: ATTENDANCE_MODE[record.format]} : {}),
    image: absoluteUrl(record.image ?? siteConfig.defaultImage),
    url: absoluteUrl(locale ? localizedPath(locale, `/events/${record.slug}`) : `/events/${record.slug}`),
    ...(record.venue ? {location: {
      '@type': 'Place' as const,
      name: record.venue,
    }} : {}),
    organizer: record.organiser ? {
      '@type': 'Organization',
      name: record.organiser.name,
      ...(record.organiser.url ? {url: record.organiser.url} : {}),
    } : {
      '@type': 'Organization',
      name: siteConfig.name,
      url: absoluteUrl('/'),
    },
  };
}
