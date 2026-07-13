import {getTranslations} from 'next-intl/server';

import {Link} from '@/i18n/navigation';
import type {AppLocale} from '@/i18n/routing';

export async function SiteFooter({locale}: {locale: AppLocale}) {
  const t = await getTranslations({locale, namespace: 'Footer'});

  return (
    <footer className="border-t border-border/60 py-14">
      <div className="container mx-auto grid gap-10 px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <p className="editorial-serif gradient-text text-2xl font-bold">{t('brand')}</p>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">{t('summary')}</p>
          <p className="mt-4 text-xs text-muted-foreground">{t('address')}</p>
        </div>
        <nav aria-label={t('navigate')}>
          <h2 className="text-xs font-semibold uppercase tracking-[0.15em]">{t('navigate')}</h2>
          <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
            <li><Link href="/">{t('home')}</Link></li>
            <li><Link href="/membership">{t('membership')}</Link></li>
            <li><Link href="/about">{t('about')}</Link></li>
            <li><Link href="/contact">{t('contact')}</Link></li>
          </ul>
        </nav>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.15em]">{t('connect')}</h2>
          <address className="mt-4 space-y-2 text-sm not-italic text-muted-foreground">
            <a className="block" href="mailto:contact@hkwtia.org">contact@hkwtia.org</a>
            <a className="block" href="tel:+85229899164">+852 2989 9164</a>
          </address>
        </div>
        <div className="border-t border-border/50 pt-6 text-xs text-muted-foreground md:col-span-4">
          {t('copyright', {year: new Date().getFullYear()})}
        </div>
      </div>
    </footer>
  );
}
