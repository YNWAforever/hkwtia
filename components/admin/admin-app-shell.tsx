"use client";

import {useState, type ReactNode} from "react";
import {useTranslations} from "next-intl";

import {AdminSidebar} from "@/components/admin/admin-sidebar";
import {AdminTopbar} from "@/components/admin/admin-topbar";
import {AdminUnsavedChangesProvider, GuardedAdminLink} from "@/components/admin/unsaved-changes-guard";
import {Sheet, SheetContent, SheetTrigger} from "@/components/ui/sheet";
import type {AppLocale} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";

type Role = "staff" | "exco" | "superadmin";
type ShellProps = Readonly<{children: ReactNode; locale: AppLocale; identity: string; role: Role; skipLabel: string}>;
export function AdminAppShell(props: ShellProps) {
  const t = useTranslations("Admin");
  return <AdminUnsavedChangesProvider confirmMessage={t("unsavedChanges.confirm")}><AdminAppShellContent {...props}/></AdminUnsavedChangesProvider>;
}
function AdminAppShellContent({children, locale, identity, role, skipLabel}: ShellProps) {
  const t = useTranslations("Admin");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileTrigger = <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
    <SheetTrigger asChild><button aria-label={t("shell.menu")} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border" type="button">☰</button></SheetTrigger>
    <SheetContent aria-label={t("navigation.label")} closeLabel={t("shell.closeMenu")} side="left">
      <AdminSidebar locale={locale} onNavigate={() => setMobileOpen(false)}/>
    </SheetContent>
  </Sheet>;
  return <div className="min-h-screen bg-muted/30 lg:flex">
    <a className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2" href="#main-content">{skipLabel}</a>
    <aside className={`hidden shrink-0 border-r bg-background lg:flex lg:flex-col ${collapsed ? "lg:w-20" : "lg:w-60"}`} data-collapsed={collapsed} data-testid="admin-desktop-sidebar">
      <div className="sticky top-0 flex h-screen flex-col">
        <div className="flex min-h-16 items-center justify-between gap-1 border-b px-2">
          <GuardedAdminLink aria-label={t("brand")} className="min-w-0 truncate px-1 font-serif text-lg font-semibold text-foreground" href={localizedPath(locale, "/admin")}>{collapsed ? t("brandShort").slice(0, 1) : t("brand")}</GuardedAdminLink>
          <button aria-label={t(collapsed ? "shell.expandSidebar" : "shell.collapseSidebar")} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border text-sm focus-visible:outline-2 focus-visible:outline-primary" onClick={() => setCollapsed(!collapsed)} type="button">{collapsed ? "›" : "‹"}</button>
        </div>
        <div className="min-h-0 flex-1"><AdminSidebar collapsed={collapsed} locale={locale} showBrand={false}/></div>
      </div>
    </aside>
    <div className="min-w-0 flex-1">
      <AdminTopbar identity={identity} locale={locale} mobileTrigger={mobileTrigger} role={role}/>
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8" id="main-content" tabIndex={-1}>{children}</main>
    </div>
  </div>;
}
