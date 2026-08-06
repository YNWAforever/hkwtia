import {getTranslations, setRequestLocale} from "next-intl/server";

import type {AppLocale} from "@/i18n/routing";
import {requireAdminPageActor} from "@/lib/admin/page-auth";

type Props = Readonly<{params: Promise<{locale: string}>}>;

export default async function AdminPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  // The layout already guards this route. Repeating the check here keeps the
  // rule uniform across every admin page, so the boundary test can discover
  // routes instead of relying on a hand-maintained list that fails open.
  await requireAdminPageActor();
  const t = await getTranslations({locale, namespace: "Admin"});
  return <header className="space-y-3"><p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("brand")}</p><h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{t("title")}</h1><p className="text-lg text-muted-foreground">{t("description")}</p></header>;
}
