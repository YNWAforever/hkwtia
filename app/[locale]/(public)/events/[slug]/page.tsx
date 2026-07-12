import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';
import {notFound} from 'next/navigation';

import {EventDetail} from '@/components/marketing/event-detail';
import {events} from '@/content/events';
import type {AppLocale} from '@/i18n/routing';
import {buildPageMetadata} from '@/lib/metadata';

type Props = {params: Promise<{locale: string; slug: string}>};

export function generateStaticParams() {
  return events.map(({slug}) => ({slug}));
}

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale, slug} = await params;
  const record = events.find((item) => item.slug === slug);
  if (!record) notFound();
  const t = await getTranslations({locale, namespace: record.namespace});
  return buildPageMetadata({locale: locale as AppLocale, pathname: `/events/${record.slug}`, title: t('title'), description: t('description'), image: record.image});
}

export default async function EventPage({params}: Props) {
  const {locale, slug} = await params;
  const record = events.find((item) => item.slug === slug);
  if (!record) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({locale, namespace: record.namespace});
  return <EventDetail record={record} title={t('title')} />;
}
