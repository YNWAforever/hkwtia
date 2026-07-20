import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {setRequestLocale} from "next-intl/server";

import {PageHero} from "@/components/marketing/page-hero";
import {eventsRepository, localizeEvent} from "@/lib/db/repos/events";

export const dynamic = "force-dynamic";

type Props = Readonly<{params: Promise<{locale: string; slug: string}>}>;
const anonymous = {kind: "anonymous", userId: null} as const;

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale, slug} = await params;
  const row = await eventsRepository.getBySlug(anonymous, slug);
  if (!row) return {};
  const event = localizeEvent(row, locale);
  return {title: event.title, description: event.description};
}

export default async function EventPage({params}: Props) {
  const {locale, slug} = await params;
  const row = await eventsRepository.getBySlug(anonymous, slug);
  if (!row) notFound();
  setRequestLocale(locale);
  const event = localizeEvent(row, locale);
  const formatter = new Intl.DateTimeFormat(locale, {dateStyle: "full", timeStyle: "short", timeZone: "Asia/Hong_Kong"});
  return <><PageHero eyebrow={formatter.format(new Date(event.startsAt))} title={event.title} description={event.description}/><section className="container mx-auto space-y-3 px-6 py-12"><p>{event.venue}</p>{event.endsAt ? <p>{formatter.format(new Date(event.endsAt))}</p> : null}</section></>;
}
