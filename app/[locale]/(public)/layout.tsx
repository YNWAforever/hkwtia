import {getTranslations, setRequestLocale} from 'next-intl/server';
import type {ReactNode} from 'react';

import {ConciergeWidget} from '@/components/ai/concierge-widget';
import {AnnouncementBar} from '@/components/layout/announcement-bar';
import {SiteFooter} from '@/components/layout/site-footer';
import {SiteHeader} from '@/components/layout/site-header';
import type {AppLocale} from '@/i18n/routing';
import {localizeConcierge} from '@/lib/ai/concierge-labels';
import {localizeConciergePrompts} from '@/lib/ai/concierge-prompts';
import {publicEnv} from '@/lib/config/env';
import {announcementsRepository} from '@/lib/db/repos/announcements';
import {toAnnouncementBarView} from '@/lib/public-shell/announcement';

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
  const [t, concierge, announcementMessages, activeAnnouncement] = await Promise.all([
    getTranslations({locale, namespace: 'Common'}),
    getTranslations({locale, namespace: 'Concierge'}),
    getTranslations({locale, namespace: 'Announcement'}),
    announcementsRepository.getActive(new Date()).catch(() => null),
  ]);
  const appLocale = locale as AppLocale;
  const conciergeLabels = localizeConcierge((key) => concierge.raw(key));
  const conciergePrompts = localizeConciergePrompts((key) => concierge.raw(key));
  const {turnstileSiteKey} = publicEnv();
  const announcement = activeAnnouncement ? toAnnouncementBarView(activeAnnouncement, appLocale) : null;

  return (
    <div className="site-root" lang={appLocale === "zh-HK" ? "zh-Hant-HK" : "en"}>
      <a className="skip-link" href="#main-content">
        {t('skipToContent')}
      </a>
      <AnnouncementBar
        announcement={announcement}
        label={announcementMessages('label')}
        dismissLabel={announcementMessages('dismiss')}
      />
      <SiteHeader locale={appLocale} hasAnnouncement={announcement !== null} />
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
