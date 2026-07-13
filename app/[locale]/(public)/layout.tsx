import {getTranslations, setRequestLocale} from 'next-intl/server';
import type {ReactNode} from 'react';

import {SiteFooter} from '@/components/layout/site-footer';
import {SiteHeader} from '@/components/layout/site-header';
import type {AppLocale} from '@/i18n/routing';

type PublicLayoutProps = {
  children: ReactNode;
  params: Promise<{locale: string}>;
};

export default async function PublicLayout({children, params}: PublicLayoutProps) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Common');
  const appLocale = locale as AppLocale;

  return (
    <>
      <a className="skip-link" href="#main-content">
        {t('skipToContent')}
      </a>
      <SiteHeader locale={appLocale} />
      <main id="main-content">{children}</main>
      <SiteFooter locale={appLocale} />
    </>
  );
}
