import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {parsePolicySections, PolicySections} from '@/components/marketing/policy-sections';
import {PageHero} from '@/components/wt/page-hero';
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
  const [t, common] = await Promise.all([
    getTranslations({locale, namespace: 'AiTransparency'}),
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
      <section className="container mx-auto max-w-3xl px-6 pb-16">
        <Link className="font-semibold text-primary" href="/ai-ops">{t('aiOpsLink')}</Link>
      </section>
    </>
  );
}
