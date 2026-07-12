import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';
import {notFound} from 'next/navigation';

import {NewsDetail} from '@/components/marketing/news-detail';
import {newsPosts} from '@/content/news';
import type {AppLocale} from '@/i18n/routing';
import {buildPageMetadata} from '@/lib/metadata';

type Props = {params: Promise<{locale: string; slug: string}>};

export function generateStaticParams() {
  return newsPosts.map(({slug}) => ({slug}));
}

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale, slug} = await params;
  const record = newsPosts.find((item) => item.slug === slug);
  if (!record) notFound();
  const t = await getTranslations({locale, namespace: record.namespace});
  return buildPageMetadata({locale: locale as AppLocale, pathname: `/news/${record.slug}`, title: t('title'), description: t('description'), image: record.image});
}

export default async function NewsPostPage({params}: Props) {
  const {locale, slug} = await params;
  const record = newsPosts.find((item) => item.slug === slug);
  if (!record) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({locale, namespace: record.namespace});
  return <NewsDetail record={record} title={t('title')} />;
}
