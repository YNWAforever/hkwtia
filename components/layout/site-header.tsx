import {Suspense} from "react";
import {getTranslations} from "next-intl/server";

import {DesktopMegaNavigation} from "@/components/layout/desktop-mega-navigation";
import {DualBrandLockup} from "@/components/layout/dual-brand-lockup";
import {LocaleSwitcher} from "@/components/layout/locale-switcher";
import {MobileNavigation} from "@/components/layout/mobile-navigation";
import {Button} from "@/components/ui/button";
import {localizeNavigation, type NavigationMessageKey} from "@/config/navigation";
import {Link} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";
import {cn} from "@/lib/utils";

export type SiteHeaderVariant = "solid" | "hero-overlay";

type SiteHeaderProps = {
  locale: AppLocale;
  variant?: SiteHeaderVariant;
};

export async function SiteHeader({locale, variant = "solid"}: SiteHeaderProps) {
  const t = await getTranslations({locale, namespace: "Navigation"});
  const navigation = localizeNavigation((key: NavigationMessageKey) => t(key));
  const mobileLabels = {
    open: t("openMenu"),
    close: t("closeMenu"),
    title: t("menuTitle"),
    description: t("menuDescription"),
    english: t("english"),
    chinese: t("chinese"),
    switchToEnglish: t("switchToEnglish"),
    switchToChinese: t("switchToChinese"),
  };
  const brand = {
    homeLabel: t("homeLabel"),
    publicName: t("brand.publicName"),
    operator: t("brand.operator"),
    logoAlt: t("logoAlt"),
  };

  return (
    <header
      data-variant={variant}
      className={cn(
        "z-40 border-b",
        variant === "solid"
          ? "sticky top-0 border-shell-border bg-shell-raised/95 text-shell-ink backdrop-blur-xl"
          : "absolute inset-x-0 top-0 border-transparent bg-transparent text-white",
      )}
    >
      <div className="mx-auto flex min-h-20 max-w-shell items-center justify-between gap-4 px-4 sm:px-6">
        <DualBrandLockup labels={brand} priority compact />
        <div className="hidden items-center gap-2 lg:flex">
          <Link className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold hover:bg-shell-warm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--shell-focus))]" href={navigation.memberPortal.href}>
            {navigation.memberPortal.label}
          </Link>
          <LocaleSwitcher locale={locale} englishLabel={mobileLabels.english} chineseLabel={mobileLabels.chinese} switchToEnglishLabel={mobileLabels.switchToEnglish} switchToChineseLabel={mobileLabels.switchToChinese} />
          <Button asChild variant="outline" className="min-h-11 rounded-full px-5">
            <Link href={navigation.actions.join.href}>{navigation.actions.join.label}</Link>
          </Button>
        </div>
        <Suspense fallback={<div aria-hidden="true" className="min-h-11 min-w-11 lg:hidden" />}>
          <MobileNavigation locale={locale} navigation={navigation} labels={mobileLabels} />
        </Suspense>
      </div>
      <div className="hidden border-t border-shell-border lg:block">
        <div className="mx-auto flex min-h-14 max-w-shell items-center justify-between gap-5 px-6">
          <Suspense fallback={<nav aria-label={t("primaryLabel")} />}>
            <DesktopMegaNavigation groups={navigation.groups} primaryLabel={t("primaryLabel")} />
          </Suspense>
          <Button asChild className="min-h-11 shrink-0 rounded-full bg-shell-navy px-5 text-white hover:bg-shell-blue">
            <Link href={navigation.actions.findEvent.href}>{navigation.actions.findEvent.label}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
