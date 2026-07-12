import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {PageHero} from '@/components/marketing/page-hero';
import {PreviewState} from '@/components/marketing/preview-state';
import type {AppLocale} from '@/i18n/routing';
import {buildPageMetadata} from '@/lib/metadata';

type Props = {params: Promise<{locale: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: 'Showcase'});
  return buildPageMetadata({locale: locale as AppLocale, pathname: '/showcase', title: t('metaTitle'), description: t('metaDescription')});
}

export default async function ShowcasePage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations({locale, namespace: 'Showcase'});

  return (
    <>
      <PageHero eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
      <div className="container mx-auto px-6 py-16">
        <PreviewState eyebrow={t('eyebrow')} title={t('title')} description={t('description')} milestone={t('milestone')} links={[]} />
      </div>
    </>
  );
}
