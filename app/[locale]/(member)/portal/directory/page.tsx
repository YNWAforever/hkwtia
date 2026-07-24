import {getTranslations, setRequestLocale} from "next-intl/server";

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
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("directory.title")}</p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{t("directory.title")}</h1>
        <p className="text-lg text-muted-foreground">{t("directory.description")}</p>
      </header>
      <DirectoryResults locale={locale} labels={{search: t("directory.search"), empty: t("directory.empty"), next: t("directory.next"), previous: t("directory.previous"), company: t("directory.company"), industry: t("directory.industry"), sizeBand: t("directory.sizeBand")}} page={page} query={search} />
    </div>
  );
}