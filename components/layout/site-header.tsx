import {Suspense} from "react";
import {getTranslations} from "next-intl/server";

import {DesktopMegaNavigation} from "@/components/layout/desktop-mega-navigation";
import {DualBrandLockup} from "@/components/layout/dual-brand-lockup";
import {HeaderShell} from "@/components/layout/header-shell";
import {LocaleSwitcher} from "@/components/layout/locale-switcher";
import {MobileNavigation} from "@/components/layout/mobile-navigation";
import {localizeNavigation, type NavigationMessageKey} from "@/config/navigation";
import {Link} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";

type SiteHeaderProps = {
  locale: AppLocale;
  /** Drives the donor's `.no-announcement` modifier, which lifts the header to `top: 0`. */
  hasAnnouncement?: boolean;
};

// Donor commit f91ecc5 :382-422 — one row: brand, primary navigation, actions. hkwtia's
// second row ("Find an event") is gone; the donor carries that call to action on the
// event-first navigation trigger and in the mobile priority actions (errata E-15).
export async function SiteHeader({locale, hasAnnouncement = false}: SiteHeaderProps) {
  const t = await getTranslations({locale, namespace: "Navigation"});
  const navigation = localizeNavigation((key: NavigationMessageKey) => t(key));
  const mobileLabels = {
    open: t("openMenu"),
    close: t("closeMenu"),
    title: t("menuTitle"),
    description: t("menuDescription"),
    priority: t("mobile.priority"),
    utilities: t("mobile.utilities"),
    exploreEcosystem: t("mobile.exploreEcosystem"),
    search: t("search"),
    viewOverview: t("viewOverview"),
    english: t("english"),
    chinese: t("chinese"),
    switchToEnglish: t("switchToEnglish"),
    switchToChinese: t("switchToChinese"),
  };
  const brand = {
    homeLabel: t("homeLabel"),
    publicName: t("brand.publicName"),
    descriptor: t("brand.descriptor"),
    logoAlt: t("logoAlt"),
  };

  return (
    <HeaderShell hasAnnouncement={hasAnnouncement}>
      <div className="header-inner">
        <DualBrandLockup labels={brand} priority />
        <Suspense fallback={<div aria-hidden="true" className="desktop-nav" />}>
          <DesktopMegaNavigation
            groups={navigation.groups}
            primaryLabel={t("primaryLabel")}
            exploreLabel={t("explore")}
            viewOverviewLabel={t("viewOverview")}
          />
        </Suspense>
        <div className="header-actions">
          {/* No search surface exists yet (spec §4.4 SearchPage row); the icon opens the
              showcase, which is the only place a reader can look records up today. */}
          <Link className="search-link" href="/showcase" aria-label={t("search")}>
            <span aria-hidden="true">⌕</span>
          </Link>
          <LocaleSwitcher
            className="language-link"
            locale={locale}
            englishLabel={mobileLabels.english}
            chineseLabel={mobileLabels.chinese}
            switchToEnglishLabel={mobileLabels.switchToEnglish}
            switchToChineseLabel={mobileLabels.switchToChinese}
          />
          <Link className="signin-link" href={navigation.memberPortal.href}>
            {navigation.memberPortal.label}
          </Link>
          {/* Plain Link, not ActionLink: the donor's header button carries no arrow (errata E-16). */}
          <Link className="button button-small" href={navigation.actions.join.href}>
            {navigation.actions.join.label}
          </Link>
          <Suspense fallback={<div aria-hidden="true" className="mobile-trigger" />}>
            <MobileNavigation locale={locale} navigation={navigation} labels={mobileLabels} brand={brand} />
          </Suspense>
        </div>
      </div>
    </HeaderShell>
  );
}
