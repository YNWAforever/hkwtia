"use client";

import type {ReactNode} from "react";
import {usePathname} from "next/navigation";
import {useTranslations} from "next-intl";

import {AdminAccountMenu} from "@/components/admin/admin-account-menu";
import {GuardedAdminLink, useAdminUnsavedChanges} from "@/components/admin/unsaved-changes-guard";
import {LocaleSwitcher} from "@/components/layout/locale-switcher";
import {linkLabelKeys} from "@/components/admin/admin-nav";
import {adminNavigationGroups} from "@/config/internal-navigation";
import type {AppLocale} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";

type Role = "staff" | "exco" | "superadmin";
export function AdminTopbar({locale, identity, role, mobileTrigger}: Readonly<{locale: AppLocale; identity: string; role: Role; mobileTrigger: ReactNode}>) {
  const pathname = usePathname();
  const t = useTranslations("Admin");
  const tNav = useTranslations("Navigation");
  const {confirmLeave} = useAdminUnsavedChanges();
  const links = adminNavigationGroups.reduce<Array<{id: keyof typeof linkLabelKeys; href: string}>>((items, group) => {
    for (const link of group.links) items.push(link);
    return items;
  }, []);
  const current = links.filter(link => {
    const href = localizedPath(locale, link.href);
    return href === pathname || pathname.startsWith(`${href}/`);
  }).sort((a, b) => b.href.length - a.href.length)[0];
  return <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur sm:px-6">
    <div className="lg:hidden">{mobileTrigger}</div>
    <nav aria-label={t("shell.breadcrumbs")} className="min-w-0 flex-1 truncate text-sm">
      <GuardedAdminLink className="text-muted-foreground underline underline-offset-4" href={localizedPath(locale, "/admin")}>{t("navigation.dashboard")}</GuardedAdminLink>
      {current && current.href !== "/admin" ? <><span aria-hidden="true" className="mx-2">/</span><span aria-current="page">{t(linkLabelKeys[current.id])}</span></> : null}
    </nav>
    <GuardedAdminLink className="hidden min-h-11 items-center text-sm underline sm:inline-flex" href={localizedPath(locale, "/admin/members")}>{t("shell.searchMembers")}</GuardedAdminLink>
    <GuardedAdminLink className="hidden min-h-11 items-center text-sm underline sm:inline-flex" href={localizedPath(locale, "/")}>{t("shell.viewSite")}</GuardedAdminLink>
    <LocaleSwitcher beforeSwitch={confirmLeave} locale={locale} englishLabel={tNav("english")} chineseLabel={tNav("chinese")} switchToEnglishLabel={tNav("switchToEnglish")} switchToChineseLabel={tNav("switchToChinese")}/>
    <AdminAccountMenu identity={identity} role={role}/>
  </header>;
}
