import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {ContactConciergeLauncher} from '@/components/marketing/contact-concierge-launcher';
import {CONTACT_TOPICS, PreparedEmailForm} from '@/components/marketing/prepared-email-form';
import {InnerCardGrid} from '@/components/wt/inner-card-grid';
import {PageHero} from '@/components/wt/page-hero';
import {Section} from '@/components/wt/section';
import {siteConfig} from '@/config/site';
import type {AppLocale} from '@/i18n/routing';
import {buildPageMetadata} from '@/lib/metadata';
import {localizedPath} from '@/lib/urls';

type Props = {params: Promise<{locale: string}>; searchParams?: Promise<Record<string, string | string[] | undefined>>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: 'Contact'});
  return buildPageMetadata({locale: locale as AppLocale, pathname: '/contact', title: t('metaTitle'), description: t('metaDescription')});
}

export default async function ContactPage({params, searchParams = Promise.resolve({})}: Props) {
  const [{locale}, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const [t, common] = await Promise.all([
    getTranslations({locale, namespace: 'Contact'}),
    getTranslations({locale, namespace: 'Common'}),
  ]);
  const appLocale = locale as AppLocale;
  const rawTopic = query.topic;
  const initialTopic = typeof rawTopic === 'string' ? rawTopic : undefined;

  const routeCards = [
    {href: '/events', title: t('routes.events.title'), copy: t('routes.events.description')},
    {href: '/membership', title: t('routes.membership.title'), copy: t('routes.membership.description')},
    {href: '/showcase', title: t('routes.showcase.title'), copy: t('routes.showcase.description')},
    {href: '/launchpad', title: t('routes.launchpad.title'), copy: t('routes.launchpad.description')},
    {href: '/about', title: t('routes.about.title'), copy: t('routes.about.description')},
    {href: '/news', title: t('routes.news.title'), copy: t('routes.news.description')},
  ].map((route) => ({...route, href: localizedPath(appLocale, route.href)}));

  const emailLabels = {
    topicLabel: t('emailTopics.topicLabel'),
    composeAction: t('emailTopics.composeAction'),
    topics: Object.fromEntries(CONTACT_TOPICS.map((topic) => [topic, t(`emailTopics.${topic}.label`)])) as Record<string, string>,
    subjects: Object.fromEntries(CONTACT_TOPICS.map((topic) => [topic, t(`emailTopics.${topic}.subject`)])) as Record<string, string>,
    bodies: Object.fromEntries(CONTACT_TOPICS.map((topic) => [topic, t(`emailTopics.${topic}.body`)])) as Record<string, string>,
  } as Parameters<typeof PreparedEmailForm>[0]['labels'];

  return (
    <>
      <PageHero
        eyebrow={t('eyebrow')}
        title={t('title')}
        lead={t('description')}
        breadcrumb={{homeHref: '/', homeLabel: common('breadcrumbHome'), current: t('breadcrumbCurrent')}}
        breadcrumbLabel={common('breadcrumbLabel')}
      />
      <Section tone="paper">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <address className="not-italic text-muted-foreground">
            <h2 className="font-serif text-2xl font-semibold text-foreground">{t('channelsTitle')}</h2>
            <a className="block font-medium text-foreground underline-offset-4 hover:underline" href={`mailto:${siteConfig.contact.email}`}>{siteConfig.contact.email}</a>
            {siteConfig.contact.phone === undefined ? null : (
              <a className="block font-medium text-foreground underline-offset-4 hover:underline" href={`tel:${siteConfig.contact.phone.replace(/\s/g, '')}`}>{siteConfig.contact.phone}</a>
            )}
            <p>{t('address')}</p>
          </address>

          <div>
            <PreparedEmailForm labels={emailLabels} initialTopic={initialTopic} />
          </div>
        </div>
      </Section>

      <Section tone="bright">
        <h2 id="contact-routes-title" className="font-serif text-3xl font-semibold">{t('routesTitle')}</h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">{t('routesDescription')}</p>
        <div className="mt-6">
          <InnerCardGrid items={routeCards} actionLabel={t('viewLabel')} />
        </div>
      </Section>

      <Section tone="paper">
        <div className="glass-card flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-serif text-2xl font-semibold">{t('conciergeTitle')}</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">{t('conciergeDescription')}</p>
          </div>
          <ContactConciergeLauncher label={t('conciergeLauncher')} />
        </div>
      </Section>
    </>
  );
}
