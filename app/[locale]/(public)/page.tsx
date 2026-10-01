import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';
import {HomeContent} from '@/components/home/home-content';
import type {AppLocale} from '@/i18n/routing';
import {buildPageMetadata} from '@/lib/metadata';

type Props = {params: Promise<{locale: string}>};

export const dynamic = 'force-dynamic';

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: 'Home'});
  return buildPageMetadata({locale: locale as AppLocale, pathname: '/', title: t('metaTitle'), description: t('metaDescription'), image: '/images/projects-hero.jpg'});
}

export default async function HomePage({params}: Props) {
 const {locale}=await params;setRequestLocale(locale);
 return <HomeContent locale={locale as AppLocale}/>;
}
