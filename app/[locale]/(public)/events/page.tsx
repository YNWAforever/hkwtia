import type {Metadata} from "next";
import Link from "next/link";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {EmptyState} from "@/components/marketing/empty-state";
import {PageHero} from "@/components/marketing/page-hero";
import type {AppLocale} from "@/i18n/routing";
import {eventsRepository} from "@/lib/db/repos/events";
import {parsePublicEventStatus} from "@/lib/events/public";
import {buildPageMetadata} from "@/lib/metadata";
import {localizedPath} from "@/lib/urls";

export const dynamic = "force-dynamic";
type Props = Readonly<{params: Promise<{locale: string}>; searchParams: Promise<Record<string, string | string[] | undefined>>}>;
const anonymous = {kind: "anonymous", userId: null} as const;

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "Events"});
  return buildPageMetadata({locale: locale as AppLocale, pathname: "/events", title: t("metaTitle"), description: t("metaDescription")});
}

export default async function EventsPage({params, searchParams}: Props) {
  const [{locale}, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const t = await getTranslations({locale, namespace: "Events"});
  const appLocale = locale as AppLocale;
  const status = parsePublicEventStatus(query.status);
  const asOf = new Date();
  const records = await eventsRepository.listPublic(anonymous, {status, asOf, locale}).catch(() => null);
  const formatter = new Intl.DateTimeFormat(locale, {dateStyle: "long", timeZone: "Asia/Hong_Kong"});
  return <><PageHero eyebrow={t("eyebrow")} title={t("title")} description={t("description")}/><section className="container mx-auto px-6 py-16"><nav aria-label={t("statusLabel")} className="mb-8 flex gap-3">{(["open", "past"] as const).map((value) => <Link aria-current={status === value ? "page" : undefined} className="inline-flex min-h-11 items-center rounded-md border border-input px-4 py-2 text-sm font-medium" href={localizedPath(appLocale, `/events?status=${value}`)} key={value}>{t(`status.${value}`)}</Link>)}</nav><div id="events-results">{records === null ? <EmptyState title={t("unavailableTitle")} description={t("unavailableDescription")}/> : records.length > 0 ? <div className="grid gap-6 md:grid-cols-2">{records.map((event) => <article className="glass-card space-y-3 p-6" key={event.id}><h2 className="font-serif text-2xl font-semibold"><Link href={localizedPath(appLocale, `/events/${event.slug}`)}>{event.title}</Link></h2><p className="line-clamp-3 break-words">{event.description}</p><p className="text-sm text-muted-foreground">{formatter.format(new Date(event.startsAt))}</p></article>)}</div> : <EmptyState title={t(`empty.${status}.title`)} description={t(`empty.${status}.description`)}/>}</div></section></>;
}
