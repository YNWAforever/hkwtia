import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {parsePolicySections, PolicySections} from '@/components/marketing/policy-sections';
import {PageHero} from '@/components/wt/page-hero';
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
  const [t, common] = await Promise.all([
    getTranslations({locale, namespace: 'Privacy'}),
    getTranslations({locale, namespace: 'Common'}),
  ]);

  return (
    <>
      <PageHero
        eyebrow={t('eyebrow')}
        title={t('title')}
        lead={t('description')}
        breadcrumb={{homeHref: '/', homeLabel: common('breadcrumbHome'), current: t('breadcrumbCurrent')}}
        breadcrumbLabel={common('breadcrumbLabel')}
      />
      <PolicySections sections={parsePolicySections(t.raw('sections'))} />
    </>
  );
}
