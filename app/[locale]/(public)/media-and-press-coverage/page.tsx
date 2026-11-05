import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {PressCoverageTable} from '@/components/marketing/press-coverage-table';
import {StructuredData} from '@/components/seo/structured-data';
import {PageHero} from '@/components/wt/page-hero';
import {Section} from '@/components/wt/section';
import {siteConfig} from '@/config/site';
import type {AppLocale} from '@/i18n/routing';
import {listPressClippings} from '@/lib/media/press-clippings';
import {buildPageMetadata} from '@/lib/metadata';
import {routeBreadcrumbItems} from '@/lib/seo/route-breadcrumbs';
import {buildBreadcrumbData} from '@/lib/structured-data';

type Props = {params: Promise<{locale: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: 'Media'});
  return buildPageMetadata({
    locale: locale as AppLocale,
    pathname: '/media-and-press-coverage',
    title: t('metaTitle'),
    description: t('metaDescription'),
  });
}

export default async function MediaAndPressPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const [t, common, tRoot] = await Promise.all([
    getTranslations({locale, namespace: 'Media'}),
    getTranslations({locale, namespace: 'Common'}),
    getTranslations({locale}),
  ]);
  const clippings = listPressClippings();
  const email = siteConfig.contact.email;

  return (
    <>
      <PageHero
        className="defer-following-sections"
        title={t('h1')}
        lead={t('intro')}
        breadcrumb={{homeHref: '/', homeLabel: common('breadcrumbHome'), current: t('h1')}}
        breadcrumbLabel={common('breadcrumbLabel')}
      />
      <Section>
        <p className="press-contact">{contactWithEmail(t('contact'), email)}</p>
        <PressCoverageTable
          caption={t('h1')}
          columns={{date: t('table.date'), outlet: t('table.outlet'), article: t('table.article')}}
          rows={clippings}
        />
      </Section>
      <StructuredData data={buildBreadcrumbData(routeBreadcrumbItems(locale as AppLocale, '/media-and-press-coverage', tRoot))} />
    </>
  );
}

function contactWithEmail(text: string, email: string) {
  const index = text.indexOf(email);
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <a href={`mailto:${email}`}>{email}</a>
      {text.slice(index + email.length)}
    </>
  );
}
