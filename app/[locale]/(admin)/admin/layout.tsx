import {getTranslations, setRequestLocale} from "next-intl/server";

import type {ReactNode} from "react";

import {AdminNav} from "@/components/admin/admin-nav";
import {InternalAppShell} from "@/components/internal-shell/app-shell";
import type {AppLocale} from "@/i18n/routing";
import {requireAdminPageActor} from "@/lib/admin/page-auth";

export const dynamic = "force-dynamic";
type Props = Readonly<{children: ReactNode; params: Promise<{locale: string}>}>;

export default async function AdminLayout({children, params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  await requireAdminPageActor();
  const t = await getTranslations({locale, namespace: "Common"});
  return (
    <InternalAppShell navigation={<AdminNav locale={locale} />} skipLabel={t("skipToContent")}>
      {children}
    </InternalAppShell>
  );
}
