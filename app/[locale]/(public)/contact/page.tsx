import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {PageHero} from '@/components/marketing/page-hero';
import type {AppLocale} from '@/i18n/routing';
import {buildPageMetadata} from '@/lib/metadata';

type Props = {params: Promise<{locale: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: 'Contact'});
  return buildPageMetadata({locale: locale as AppLocale, pathname: '/contact', title: t('metaTitle'), description: t('metaDescription')});
}

export default async function ContactPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations({locale, namespace: 'Contact'});

  return (
    <>
      <PageHero eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
      <section className="container mx-auto px-6 py-16">
        <address className="glass-card space-y-3 p-6 not-italic text-muted-foreground">
          <a className="block font-medium text-foreground" href="mailto:contact@hkwtia.org">contact@hkwtia.org</a>
          <a className="block font-medium text-foreground" href="tel:+85229899164">+852 2989 9164</a>
          <p>{t('address')}</p>
        </address>
      </section>
    </>
  );
}
