import {getTranslations, setRequestLocale} from "next-intl/server";

import {InboxList} from "@/components/admin/inbox-list";
import type {AppLocale} from "@/i18n/routing";
import {listInbox} from "@/lib/admin/inbox";
import {requireAdminPageActor} from "@/lib/admin/page-auth";

type Props = Readonly<{params: Promise<{locale: string}>; searchParams: Promise<Record<string, string | string[] | undefined>>}>;

function channelFrom(value: string | string[] | undefined): "all" | "whatsapp" | "web" {
  return value === "whatsapp" || value === "web" ? value : "all";
}

/**
 * The filter is a URL parameter and therefore untrusted; anything unrecognised
 * falls back to "all" rather than reaching the repository, which would refuse it
 * with a ZodError and turn a mistyped link into the error state.
 */
function handlingFrom(value: string | string[] | undefined): "all" | "bot" | "human" | "closed" {
  return value === "bot" || value === "human" || value === "closed" ? value : "all";
}

export default async function AdminInboxPage({params, searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const t = await getTranslations({locale, namespace: "Admin.inbox"});
  const query = await searchParams;
  const channel = channelFrom(query.channel);
  const handling = handlingFrom(query.handling);
  const header = <header className="space-y-3"><p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p><h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{t("title")}</h1><p className="text-lg text-muted-foreground">{t("description")}</p></header>;
  let rows;
  try {
    rows = await listInbox(actor, channel, handling);
  } catch {
    return <div className="space-y-8">{header}<p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-4 text-destructive" role="alert">{t("error")}</p></div>;
  }
  return <div className="space-y-8">{header}<InboxList channel={channel} handling={handling} labels={{owner: t("columns.owner"), channel: t("columns.channel"), last: t("columns.last"), when: t("columns.when"), messages: t("columns.messages"), status: t("columns.status"), handling: t("columns.handling"), assignee: t("columns.assignee"), unread: t("columns.unread"), anonymous: t("anonymous"), unassigned: t("unassigned"), unreadYes: t("unreadYes"), escalated: t("escalated"), empty: t("empty"), open: t("open"), filters: {all: t("filters.all"), whatsapp: t("filters.whatsapp"), web: t("filters.web")}, handlingValues: {bot: t("handling.bot"), human: t("handling.human"), closed: t("handling.closed")}, handlingFilters: {all: t("handling.filterAll"), human: t("handling.filterHuman"), bot: t("handling.filterBot")}}} locale={locale} rows={rows} /></div>;
}
