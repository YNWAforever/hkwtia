import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {EditorialHero} from '@/components/marketing/editorial-hero';
import {FeatureGrid} from '@/components/marketing/feature-grid';
import {HomeHighlightCard} from '@/components/marketing/home-highlight-card';
import {HomePartnerWall} from '@/components/marketing/home-partner-wall';
import {ProgramGrid} from '@/components/marketing/program-grid';
import {Section} from '@/components/marketing/section';
import {StructuredData} from '@/components/seo/structured-data';
import type {AppLocale} from '@/i18n/routing';
import {partnersRepository} from '@/lib/db/repos/partners';
import {loadHomeHighlights} from '@/lib/home/home-highlights';
import {buildPageMetadata} from '@/lib/metadata';
import {buildOrganizationData} from '@/lib/structured-data';

type Props = {params: Promise<{locale: string}>};

export const dynamic = 'force-dynamic';

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: 'Home'});
  return buildPageMetadata({locale: locale as AppLocale, pathname: '/', title: t('metaTitle'), description: t('metaDescription'), image: '/images/projects-hero.jpg'});
}

export default async function HomePage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const appLocale = locale as AppLocale;
  const [t, highlights, partners] = await Promise.all([
    getTranslations('Home'),
    loadHomeHighlights({locale: appLocale}),
    partnersRepository.listPublished(appLocale, {limit: 12}).catch(() => null),
  ]);
  const formatDate = (value: Date | string) => new Intl.DateTimeFormat(locale, {dateStyle: 'long', timeZone: 'Asia/Hong_Kong'}).format(new Date(value));
  const features = ['connect', 'accelerate', 'represent'].map((key) => ({title: t(`features.${key}.title`), description: t(`features.${key}.description`)}));
  const programLabels = Object.fromEntries(['cpai', 'hkict', 'tct', 'asa'].map((id) => [id, {title: t(`programs.${id}.title`), description: t(`programs.${id}.description`)}]));
  const {event, news, showcase} = highlights;

  return (
    <>
      <StructuredData data={buildOrganizationData()} />
      <EditorialHero actions={[{label: t('actions.events'), href: '/events'}, {label: t('actions.membership'), href: '/membership'}]} description={t('summary')} discoverLabel={t('actions.discover')} eyebrow={t('eyebrow')} image="/images/projects-hero.jpg" imageAlt={t('imageAlt')} title={t('question')} />
      <div className="scroll-mt-24 lg:scroll-mt-36" id="home-discover">
        <Section heading={t('highlightsTitle')} intro={t('highlightsIntro')}>
          <div className="grid gap-6 lg:grid-cols-3">
            <HomeHighlightCard actionLabel={t('highlights.event.view')} href={event.status === 'available' ? `/events/${event.item.slug}` : '/events'} label={t('highlights.event.label')} meta={event.status === 'available' ? formatDate(event.item.startsAt) : undefined} state={event.status} stateMessage={event.status === 'empty' ? t('highlights.event.empty') : event.status === 'unavailable' ? t('highlights.event.unavailable') : undefined} summary={event.status === 'available' ? event.item.description : undefined} title={event.status === 'available' ? event.item.title : undefined} />
            <HomeHighlightCard actionLabel={t('highlights.news.view')} href={news.status === 'available' ? `/news/${news.item.slug}` : '/news'} label={t('highlights.news.label')} meta={news.status === 'available' ? formatDate(news.item.publishedAt) : undefined} state={news.status} stateMessage={news.status === 'empty' ? t('highlights.news.empty') : news.status === 'unavailable' ? t('highlights.news.unavailable') : undefined} summary={news.status === 'available' ? news.item.author : undefined} title={news.status === 'available' ? news.item.title : undefined} />
            <HomeHighlightCard actionLabel={t('highlights.showcase.view')} href={showcase.status === 'available' ? `/showcase/${showcase.item.slug}` : '/showcase'} image={showcase.status === 'available' && showcase.item.logo ? {src: showcase.item.logo.url, alt: showcase.item.logo.alt} : undefined} label={t('highlights.showcase.label')} meta={showcase.status === 'available' ? showcase.item.category : undefined} state={showcase.status} stateMessage={showcase.status === 'empty' ? t('highlights.showcase.empty') : showcase.status === 'unavailable' ? t('highlights.showcase.unavailable') : undefined} summary={showcase.status === 'available' ? showcase.item.tagline : undefined} title={showcase.status === 'available' ? showcase.item.name : undefined} />
          </div>
        </Section>
      </div>
      {partners?.length ? <HomePartnerWall intro={t('partnerWallIntro')} partners={partners} title={t('partnerWallTitle')} /> : null}
      <Section heading={t('featuresTitle')} intro={t('featuresIntro')}><FeatureGrid features={features} /></Section>
      <Section heading={t('programsTitle')} intro={t('programsIntro')}><ProgramGrid labels={programLabels} viewLabel={t('viewProgram')} /></Section>
    </>
  );
}
