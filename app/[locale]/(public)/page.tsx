import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';
import {HomeContent} from '@/components/home/home-content';
import type {AppLocale} from '@/i18n/routing';
import {buildPageMetadata} from '@/lib/metadata';
import {ogImagePath} from '@/lib/og/resolve-renderer';

type Props = {params: Promise<{locale: string}>};

export const dynamic = 'force-dynamic';

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: 'Home'});
  // The shared card carries the homepage's question, not the brand name twice. It replaced
  // /images/projects-hero.jpg, the pre-donor placeholder the hero itself dropped (hero.tsx):
  // a generated stage scene whose signage reads as gibberish, so every shared homepage link
  // previewed an event WTIA never held.
  return buildPageMetadata({locale: locale as AppLocale, pathname: '/', title: t('metaTitle'), description: t('metaDescription'), image: ogImagePath({kind: 'page', title: t('hero.title'), eyebrow: 'WTIA', imageUrl: null})});
}

export default async function HomePage({params}: Props) {
 const {locale}=await params;setRequestLocale(locale);
 return <HomeContent locale={locale as AppLocale}/>;
}
