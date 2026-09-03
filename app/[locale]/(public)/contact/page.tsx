import type {Metadata} from 'next';
import Link from 'next/link';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {ContactConciergeLauncher} from '@/components/marketing/contact-concierge-launcher';
import {PageHero} from '@/components/marketing/page-hero';
import {siteConfig} from '@/config/site';
import type {AppLocale} from '@/i18n/routing';
import {buildPageMetadata} from '@/lib/metadata';
import {localizedPath} from '@/lib/urls';

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
  const appLocale = locale as AppLocale;
  const routeCards = [
    {
      href: '/events',
      title: t('routes.events.title'),
      description: t('routes.events.description'),
    },
    {
      href: '/membership',
      title: t('routes.membership.title'),
      description: t('routes.membership.description'),
    },
    {
      href: '/showcase',
      title: t('routes.showcase.title'),
      description: t('routes.showcase.description'),
    },
    {
      href: '/launchpad',
      title: t('routes.launchpad.title'),
      description: t('routes.launchpad.description'),
    },
  ] as const;

  return (
    <>
      <PageHero eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
      <section className="container mx-auto space-y-10 px-6 py-16">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <address className="glass-card space-y-3 p-6 not-italic text-muted-foreground">
            <h2 className="font-serif text-2xl font-semibold text-foreground">{t('channelsTitle')}</h2>
            <a className="block font-medium text-foreground underline-offset-4 hover:underline" href="mailto:contact@hkwtia.org">contact@hkwtia.org</a>
            {siteConfig.contact.phone === undefined ? null : (
              <a className="block font-medium text-foreground underline-offset-4 hover:underline" href={`tel:${siteConfig.contact.phone.replace(/\s/g, '')}`}>{siteConfig.contact.phone}</a>
            )}
            <p>{t('address')}</p>
          </address>

          <div aria-labelledby="contact-routes-title">
            <h2 className="font-serif text-3xl font-semibold" id="contact-routes-title">{t('routesTitle')}</h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">{t('routesDescription')}</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {routeCards.map((route) => (
                <Link
                  className="glass-card group flex min-h-32 flex-col justify-between p-5 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  href={localizedPath(appLocale, route.href)}
                  key={route.href}
                >
                  <h3 className="text-xl font-semibold text-foreground group-hover:text-primary">{route.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{route.description}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <section className="glass-card flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-serif text-2xl font-semibold">{t('conciergeTitle')}</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">{t('conciergeDescription')}</p>
          </div>
          <ContactConciergeLauncher label={t('conciergeLauncher')} />
        </section>
      </section>
    </>
  );
}
