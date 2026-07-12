import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {FeatureGrid} from '@/components/marketing/feature-grid';
import {PageHero} from '@/components/marketing/page-hero';
import {ProgramGrid} from '@/components/marketing/program-grid';
import {Section} from '@/components/marketing/section';
import {Stats} from '@/components/marketing/stats';
import type {AppLocale} from '@/i18n/routing';
import {buildPageMetadata} from '@/lib/metadata';

type Props = {params: Promise<{locale: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: 'Home'});
  return buildPageMetadata({locale: locale as AppLocale, pathname: '/', title: t('metaTitle'), description: t('metaDescription'), image: '/images/projects-hero.jpg'});
}

export default async function HomePage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Home');
  const features = ['connect', 'accelerate', 'represent'].map((key) => ({title: t(`features.${key}.title`), description: t(`features.${key}.description`)}));
  const stats = [0, 1, 2].map((i) => ({value: t(`stats.${i}.value`), label: t(`stats.${i}.label`)}));
  const programLabels = Object.fromEntries(['cpai', 'hkict', 'tct', 'asa'].map((id) => [id, {title: t(`programs.${id}.title`), description: t(`programs.${id}.description`)}]));

  return (
    <>
      <PageHero eyebrow={t('eyebrow')} title={t('title')} description={t('summary')} image="/images/projects-hero.jpg" imageAlt={t('imageAlt')} />
      <Section heading={t('featuresTitle')} intro={t('featuresIntro')}><FeatureGrid features={features} /></Section>
      <Section heading={t('statsTitle')}><Stats items={stats} /></Section>
      <Section heading={t('programsTitle')} intro={t('programsIntro')}><ProgramGrid labels={programLabels} viewLabel={t('viewProgram')} /></Section>
    </>
  );
}
