import {getTranslations, setRequestLocale} from 'next-intl/server';
import type {ReactNode} from 'react';

import {ConciergeWidget} from '@/components/ai/concierge-widget';
import {AnnouncementBar} from '@/components/layout/announcement-bar';
import {SiteFooter} from '@/components/layout/site-footer';
import {SiteHeader} from '@/components/layout/site-header';
import type {AppLocale} from '@/i18n/routing';
import {localizeConcierge} from '@/lib/ai/concierge-labels';
import {publicEnv} from '@/lib/config/env';
import {announcementsRepository} from '@/lib/db/repos/announcements';
import {toAnnouncementBarView} from '@/lib/public-shell/announcement';

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
      <SiteHeader locale={appLocale} />
      <main id="main-content">{children}</main>
      <SiteFooter locale={appLocale} />
      <ConciergeWidget
        locale={appLocale}
        labels={conciergeLabels}
        {...(turnstileSiteKey === undefined ? {} : {turnstileSiteKey})}
      />
    </div>
  );
}
