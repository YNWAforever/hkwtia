import {getTranslations, setRequestLocale} from "next-intl/server";

import {InboxList} from "@/components/admin/inbox-list";
import type {AppLocale} from "@/i18n/routing";
import {listInbox} from "@/lib/admin/inbox";
import {requireAdminPageActor} from "@/lib/admin/page-auth";

type Props = Readonly<{params: Promise<{locale: string}>; searchParams: Promise<Record<string, string | string[] | undefined>>}>;

function channelFrom(value: string | string[] | undefined): "all" | "whatsapp" | "web" {
  return value === "whatsapp" || value === "web" ? value : "all";
}

export default async function AdminInboxPage({params, searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const t = await getTranslations({locale, namespace: "Admin.inbox"});
  const channel = channelFrom((await searchParams).channel);
  const header = <header className="space-y-3"><p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p><h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{t("title")}</h1><p className="text-lg text-muted-foreground">{t("description")}</p></header>;
  let rows;
  try {
    rows = await listInbox(actor, channel);
  } catch {
    return <div className="space-y-8">{header}<p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-4 text-destructive" role="alert">{t("error")}</p></div>;
  }
  return <div className="space-y-8">{header}<InboxList channel={channel} labels={{owner: t("columns.owner"), channel: t("columns.channel"), last: t("columns.last"), when: t("columns.when"), messages: t("columns.messages"), status: t("columns.status"), anonymous: t("anonymous"), escalated: t("escalated"), empty: t("empty"), open: t("open"), filters: {all: t("filters.all"), whatsapp: t("filters.whatsapp"), web: t("filters.web")}}} locale={locale} rows={rows} /></div>;
}
