import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {EmptyState} from '@/components/marketing/empty-state';
import {PageHero} from '@/components/marketing/page-hero';
import {newsPosts} from '@/content/news';
import type {AppLocale} from '@/i18n/routing';
import {buildPageMetadata} from '@/lib/metadata';

type Props = {params: Promise<{locale: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: 'News'});
  return buildPageMetadata({locale: locale as AppLocale, pathname: '/news', title: t('metaTitle'), description: t('metaDescription')});
}

export default async function NewsPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations({locale, namespace: 'News'});

  return (
    <>
      <PageHero eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
      <section className="container mx-auto px-6 py-16">
        {newsPosts.length > 0 ? newsPosts.map((post) => <p key={post.slug}>{post.slug}</p>) : <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />}
      </section>
    </>
  );
}
