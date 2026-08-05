import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {PageHero} from '@/components/marketing/page-hero';
import {parsePolicySections, PolicySections} from '@/components/marketing/policy-sections';
import type {AppLocale} from '@/i18n/routing';
import {Link} from '@/i18n/navigation';
import {buildPageMetadata} from '@/lib/metadata';

type Props = {params: Promise<{locale: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: 'AiTransparency'});
  return buildPageMetadata({locale: locale as AppLocale, pathname: '/ai-transparency', title: t('metaTitle'), description: t('metaDescription')});
}

export default async function AiTransparencyPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations({locale, namespace: 'AiTransparency'});

  return (
    <>
      <PageHero eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
      <PolicySections sections={parsePolicySections(t.raw('sections'))} />
      <section className="container mx-auto max-w-3xl px-6 pb-16">
        <Link className="font-semibold text-primary" href="/ai-ops">{t('aiOpsLink')}</Link>
      </section>
    </>
  );
}
