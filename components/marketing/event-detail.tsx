import Image from "next/image";

import type {PublicEventProjection} from "@/lib/events/public";
import {isPrivateMediaDeliveryUrl} from "@/lib/media/url";

type EventDetailProps = Readonly<{
  event: PublicEventProjection;
  locale: string;
  labels: Readonly<{date: string; venue: string; capacity: string}>;
}>;

export function EventDetail({event, locale, labels}: EventDetailProps) {
  const formatter = new Intl.DateTimeFormat(locale, {dateStyle: "full", timeStyle: "short", timeZone: "Asia/Hong_Kong"});
  const startsAt = formatter.format(new Date(event.startsAt));
  const endsAt = event.endsAt ? formatter.format(new Date(event.endsAt)) : null;
  return <article className="mx-auto max-w-4xl space-y-8">
    {event.hero ? <Image alt={event.hero.alt} className="max-h-96 w-full rounded-lg object-cover" height={720} src={event.hero.url} unoptimized={isPrivateMediaDeliveryUrl(event.hero.url)} width={1280}/> : null}
    <header className="space-y-4"><h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{event.title}</h1><p className="text-xl text-muted-foreground">{event.description}</p></header>
    <dl className="grid gap-4 sm:grid-cols-2"><div><dt className="font-medium">{labels.date}</dt><dd className="text-muted-foreground">{startsAt}{endsAt ? ` – ${endsAt}` : ""}</dd></div>{event.venue ? <div><dt className="font-medium">{labels.venue}</dt><dd className="text-muted-foreground">{event.venue}</dd></div> : null}{event.capacity !== null ? <div><dt className="font-medium">{labels.capacity}</dt><dd className="text-muted-foreground">{event.capacity}</dd></div> : null}</dl>
  </article>;
}
