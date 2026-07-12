import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {PageHero} from '@/components/marketing/page-hero';
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
      <section className="container mx-auto px-6 py-16">
        <div className="glass-card space-y-4 p-6">
          <p className="text-muted-foreground">{t('summary')}</p>
          <Link className="font-semibold text-primary" href="/ai-ops">{t('aiOpsLink')}</Link>
        </div>
      </section>
    </>
  );
}
