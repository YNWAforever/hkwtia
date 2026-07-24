import type {Metadata} from "next";
import Link from "next/link";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {EmptyState} from "@/components/marketing/empty-state";
import {PageHero} from "@/components/marketing/page-hero";
import type {AppLocale} from "@/i18n/routing";
import {eventsRepository, localizeEvent} from "@/lib/db/repos/events";
import {buildPageMetadata} from "@/lib/metadata";

export const dynamic = "force-dynamic";

type Props = {params: Promise<{locale: string}>};
const anonymous = {kind: "anonymous", userId: null} as const;

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "Events"});
  return buildPageMetadata({locale: locale as AppLocale, pathname: "/events", title: t("metaTitle"), description: t("metaDescription")});
}

export default async function EventsPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations({locale, namespace: "Events"});
  const records = (await eventsRepository.listPublic(anonymous)).map((event) => localizeEvent(event, locale));
  const formatter = new Intl.DateTimeFormat(locale, {dateStyle: "long", timeZone: "Asia/Hong_Kong"});
  return <><PageHero eyebrow={t("eyebrow")} title={t("title")} description={t("description")}/><section className="container mx-auto px-6 py-16">{records.length > 0 ? <div className="grid gap-6 md:grid-cols-2">{records.map((event) => <article className="glass-card space-y-3 p-6" key={event.id}><h2 className="font-serif text-2xl font-semibold"><Link href={`/${locale}/events/${event.slug}`}>{event.title}</Link></h2><p>{event.description}</p><p className="text-sm text-muted-foreground">{formatter.format(new Date(event.startsAt))}</p></article>)}</div> : <EmptyState title={t("emptyTitle")} description={t("emptyDescription")}/>}</section></>;
}
