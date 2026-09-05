import {setRequestLocale} from "next-intl/server";

import type {ReactNode} from "react";

import {AdminNav} from "@/components/admin/admin-nav";
import type {AppLocale} from "@/i18n/routing";
import {requireAdminPageActor} from "@/lib/admin/page-auth";

export const dynamic = "force-dynamic";
type Props = Readonly<{children: ReactNode; params: Promise<{locale: string}>}>;

export default async function AdminLayout({children, params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  await requireAdminPageActor();
  return <div className="min-h-screen bg-background"><AdminNav locale={locale} /><main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">{children}</main></div>;
}
