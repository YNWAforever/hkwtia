import {getTranslations, setRequestLocale} from "next-intl/server";

import {PortalPageHeader} from "@/components/portal/page-header";
import {DirectoryResults} from "@/components/portal/directory-results";
import type {AppLocale} from "@/i18n/routing";
import {requireActor} from "@/lib/auth/actor";
import {searchDirectory} from "@/lib/portal/content";

type Props = Readonly<{params: Promise<{locale: string}>; searchParams: Promise<Record<string, string | string[] | undefined>>}>;

function queryValue(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

export const dynamic = "force-dynamic";

export default async function DirectoryPage({params, searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const query = await searchParams;
  const search = queryValue(query.q);
  const cursor = queryValue(query.cursor) || null;
  const actor = await requireActor();
  const page = await searchDirectory(actor, {search, limit: 20}, cursor);
  const t = await getTranslations({locale, namespace: "Portal"});

  return (
    <div className="portal-directory-page">
      <PortalPageHeader eyebrow={t("navGroups.benefits")} lead={t("directory.description")} title={t("directory.title")} />
      <DirectoryResults
        cursor={cursor}
        labels={{
          search: t("directory.search"),
          showingFor: t("directory.showingFor", {query: search}),
          clear: t("directory.clear"),
          empty: t("directory.empty"),
          emptyQuery: t("directory.emptyQuery", {query: search}),
          emptyNone: t("directory.emptyNone"),
          emptyNoneAction: t("directory.emptyNoneAction"),
          next: t("directory.next"),
          first: t("directory.first"),
          company: t("directory.company"),
          industry: t("directory.industry"),
          sizeBand: t("directory.sizeBand"),
        }}
        locale={locale}
        page={page}
        query={search}
      />
    </div>
  );
}
