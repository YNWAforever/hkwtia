import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {PageHero} from '@/components/marketing/page-hero';
import {parsePolicySections, PolicySections} from '@/components/marketing/policy-sections';
import type {AppLocale} from '@/i18n/routing';
import {buildPageMetadata} from '@/lib/metadata';

type Props = {params: Promise<{locale: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: 'Privacy'});
  return buildPageMetadata({locale: locale as AppLocale, pathname: '/privacy', title: t('metaTitle'), description: t('metaDescription')});
}

export default async function PrivacyPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations({locale, namespace: 'Privacy'});

  return (
    <>
      <PageHero eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
      <PolicySections sections={parsePolicySections(t.raw('sections'))} />
    </>
  );
}
