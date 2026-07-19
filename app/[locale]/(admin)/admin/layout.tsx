import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";
import type {ReactNode} from "react";

import {AdminNav} from "@/components/admin/admin-nav";
import type {AppLocale} from "@/i18n/routing";
import {requireAdminActor} from "@/lib/auth/actor";

export const dynamic = "force-dynamic";
type Props = Readonly<{children: ReactNode; params: Promise<{locale: string}>}>;

export default async function AdminLayout({children, params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  try {
    await requireAdminActor();
  } catch (error) {
    if (error instanceof Error && (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN")) notFound();
    throw error;
  }
  const t = await getTranslations({locale, namespace: "Admin"});
  return <div className="min-h-screen bg-background"><AdminNav locale={locale} labels={{label: t("navigation.label"), members: t("navigation.members"), segments: t("navigation.segments"), atRisk: t("navigation.atRisk"), events: t("navigation.events"), approvals: t("navigation.approvals"), reports: t("navigation.reports")}} /><main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">{children}</main></div>;
}
