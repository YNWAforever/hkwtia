import {getTranslations} from "next-intl/server";
import {AnnouncementBar} from "@/components/layout/announcement-bar";
import {SiteHeader} from "@/components/layout/site-header";
import type {AppLocale} from "@/i18n/routing";
import {announcementsRepository} from "@/lib/db/repos/announcements";
import {toAnnouncementBarView} from "@/lib/public-shell/announcement";

/** One boundary keeps the banner and header offset in agreement without blocking main. */
export async function PublicHeader({locale}: Readonly<{locale: AppLocale}>) {
  const [messages, active] = await Promise.all([
    getTranslations({locale, namespace: "Announcement"}),
    announcementsRepository.getActive(new Date()).catch(() => null),
  ]);
  const announcement = active ? toAnnouncementBarView(active, locale) : null;
  return <>
    <AnnouncementBar announcement={announcement} label={messages("label")} dismissLabel={messages("dismiss")} />
    <SiteHeader locale={locale} hasAnnouncement={announcement !== null} />
  </>;
}
