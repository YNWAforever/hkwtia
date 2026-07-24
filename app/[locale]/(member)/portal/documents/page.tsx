import {getTranslations, setRequestLocale} from "next-intl/server";

import {DocumentList} from "@/components/portal/document-list";
import type {AppLocale} from "@/i18n/routing";
import {requireActor} from "@/lib/auth/actor";
import {getDocuments} from "@/lib/portal/content";

export const dynamic = "force-dynamic";

type Props = Readonly<{params: Promise<{locale: string}>}>;

export default async function DocumentsPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireActor();
  const documents = await getDocuments(actor);
  const t = await getTranslations({locale, namespace: "Portal"});

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("documents.title")}</p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{t("documents.title")}</h1>
        <p className="text-lg text-muted-foreground">{t("documents.description")}</p>
      </header>
      <DocumentList locale={locale} items={documents} empty={t("documents.empty")} labels={{receipt: t("documents.receipt"), resource: t("documents.resource"), open: t("documents.open")}} />
    </div>
  );
}