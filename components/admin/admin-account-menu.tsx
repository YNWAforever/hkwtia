"use client";

import {useTranslations} from "next-intl";
import {PortalSignOutButton} from "@/components/portal/portal-sign-out-button";

type Role = "staff" | "exco" | "superadmin";
export function AdminAccountMenu({identity, role}: Readonly<{identity: string; role: Role}>) {
  const t = useTranslations("Admin");
  return <details className="relative">
    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md border px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
      <span className="max-w-32 truncate font-medium">{identity}</span>
      <span className="text-muted-foreground">{t(`shell.roles.${role}`)}</span>
    </summary>
    <div className="absolute right-0 z-50 mt-1 min-w-48 rounded-md border bg-background p-2 shadow-lg">
      <p className="px-3 py-2 text-xs text-muted-foreground">{t("shell.account")}</p>
      <PortalSignOutButton destination="/admin-login" errorLabel={t("shell.signOutError")} label={t("shell.signOut")}/>
      <PortalSignOutButton destination="/admin-login" errorLabel={t("shell.signOutError")} label={t("shell.switchAccount")}/>
    </div>
  </details>;
}
