import {getTranslations, setRequestLocale} from "next-intl/server";

import type {AppLocale} from "@/i18n/routing";
import {requireActor} from "@/lib/auth/actor";
import {getMemberEvents} from "@/lib/portal/content";

export const dynamic = "force-dynamic";

type Props = Readonly<{params: Promise<{locale: string}>}>;

export default async function MemberEventsPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireActor();
  const events = await getMemberEvents(actor);
  const t = await getTranslations({locale, namespace: "Portal"});
  const dateFormatter = new Intl.DateTimeFormat(locale, {dateStyle: "long", timeZone: "Asia/Hong_Kong"});
  const eventRows = await Promise.all(events.map(async (event) => {
    const eventT = await getTranslations({locale, namespace: event.namespace});
    return {...event, title: eventT("title")};
  }));

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("events.title")}</p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{t("events.title")}</h1>
        <p className="text-lg text-muted-foreground">{t("events.description")}</p>
      </header>
      {eventRows.length === 0 ? (
        <section className="glass-card p-6"><p className="text-muted-foreground">{t("events.empty")}</p></section>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {eventRows.map((event) => (
            <article className="glass-card space-y-3 p-5" key={event.slug}>
              <h2 className="font-serif text-2xl font-semibold">{event.title}</h2>
              <p className="text-sm"><span className="font-medium">{t("events.date")}:</span> {dateFormatter.format(new Date(event.startsAt))}</p>
              <p className="text-sm"><span className="font-medium">{t("events.venue")}:</span> {event.venue}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}