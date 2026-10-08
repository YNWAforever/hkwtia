import {getTranslations, setRequestLocale} from "next-intl/server";

import {DocumentList} from "@/components/portal/document-list";
import {PortalPageHeader} from "@/components/portal/page-header";
import type {AppLocale} from "@/i18n/routing";
import {portalPageActor} from "@/lib/portal/page-actor";
import {getDocuments} from "@/lib/portal/content";

export const dynamic = "force-dynamic";

type Props = Readonly<{params: Promise<{locale: string}>}>;

export default async function DocumentsPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await portalPageActor(locale, "/portal/documents");
  const documents = await getDocuments(actor);
  const t = await getTranslations({locale, namespace: "Portal"});

  return (
    <div>
      <PortalPageHeader eyebrow={t("navGroups.benefits")} lead={t("documents.description")} title={t("documents.title")} />
      <DocumentList
        items={documents}
        labels={{
          receiptsHeading: t("documents.receiptsHeading"),
          receiptTitle: (amount) => (amount ? t("documents.receiptTitle", {amount}) : t("documents.receiptTitleNoAmount")),
          resourcesHeading: t("documents.resourcesHeading"),
          openReceipt: t("documents.openReceipt"),
          openDocument: t("documents.openDocument"),
          newTab: t("common.newTab"),
          empty: t("documents.empty"),
          emptyLine: t("documents.emptyLine"),
          emptyAction: t("documents.emptyAction"),
        }}
        locale={locale}
      />
    </div>
  );
}
