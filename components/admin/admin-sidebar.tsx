"use client";

import {AdminNav} from "@/components/admin/admin-nav";
import type {AppLocale} from "@/i18n/routing";

export function AdminSidebar({locale, collapsed = false, onNavigate, showBrand = true}: Readonly<{locale: AppLocale; collapsed?: boolean; onNavigate?: () => void; showBrand?: boolean}>) {
  return <AdminNav collapsed={collapsed} locale={locale} onNavigate={onNavigate} showBrand={showBrand}/>;
}
