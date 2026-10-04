import {getTranslations, setRequestLocale} from 'next-intl/server';
import {Suspense, type ReactNode} from 'react';

import {DeferredConciergeWidget as ConciergeWidget} from '@/components/ai/deferred-concierge-widget';
import {PublicHeader} from '@/components/layout/public-header';
import {SiteFooter} from '@/components/layout/site-footer';
import {SiteHeader} from '@/components/layout/site-header';
import type {AppLocale} from '@/i18n/routing';
import {localizeConcierge} from '@/lib/ai/concierge-labels';
import {localizeConciergePrompts} from '@/lib/ai/concierge-prompts';
import {publicEnv} from '@/lib/config/env';



// Ordered after globals.css so the donor rules land after the Tailwind layers. A CSS
// @import inside globals.css would not achieve that: css-loader emits imported files
// ahead of the importing file's own rules (design-fidelity errata E-9). Next emits a
// nested layout's CSS after the root layout's, so importing here keeps that order.
// Scoped to the public route group on purpose: admin, portal and join never render the
// donor markup, and the port's element-level rules (body line-height, the coral
// :focus-visible, [id] scroll-margin) must not change them. WP-6 decides whether the
// app shell adopts any of it.
import "../../styles/wisetech.css";
// Hand-written shell overrides; must load after the generated port so equal-specificity
// rules win. See app/styles/wisetech-shell.css for what belongs here and why.
import "../../styles/wisetech-shell.css";

type PublicLayoutProps = {
  children: ReactNode;
  params: Promise<{locale: string}>;
};

export default async function PublicLayout({children, params}: PublicLayoutProps) {
  const {locale} = await params;
  setRequestLocale(locale);
  const [t, concierge] = await Promise.all([
    getTranslations({locale, namespace: 'Common'}),
    getTranslations({locale, namespace: 'Concierge'}),
  ]);
  const appLocale = locale as AppLocale;
  const conciergeLabels = localizeConcierge((key) => concierge.raw(key));
  const conciergePrompts = localizeConciergePrompts((key) => concierge.raw(key));
  const {turnstileSiteKey} = publicEnv();


  return (
    <div className="site-root" lang={appLocale === "zh-HK" ? "zh-Hant-HK" : "en"}>
      <a className="skip-link" href="#main-content">
        {t('skipToContent')}
      </a>
      <Suspense fallback={<SiteHeader locale={appLocale} navigationPending />}>
        <PublicHeader locale={appLocale} />
      </Suspense>
      <main id="main-content">{children}</main>
      <SiteFooter locale={appLocale} />
      <ConciergeWidget
        locale={appLocale}
        labels={conciergeLabels}
        prompts={conciergePrompts}
        transparencyLabel={concierge('transparency')}
        {...(turnstileSiteKey === undefined ? {} : {turnstileSiteKey})}
      />
    </div>
  );
}
