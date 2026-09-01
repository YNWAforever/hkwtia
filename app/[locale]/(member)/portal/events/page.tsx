import {revalidatePath} from "next/cache";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {EventRegistrationForm} from "@/components/portal/event-registration-form";
import type {AppLocale} from "@/i18n/routing";
import {requireActor} from "@/lib/auth/actor";
import {registerForEvent} from "@/lib/db/repos/events";
import type {RegistrationActionState} from "@/lib/events/registration-state";
import {runEventRegistrationAction} from "@/lib/portal/event-action-core";
import {getMemberEvents} from "@/lib/portal/content";
import {localizedPath} from "@/lib/urls";

export const dynamic = "force-dynamic";
type Props = Readonly<{params: Promise<{locale: string}>}>;

export default async function MemberEventsPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireActor();
  const events = await getMemberEvents(actor, undefined, locale);
  const t = await getTranslations({locale, namespace: "Portal"});
  const formatter = new Intl.DateTimeFormat(locale, {dateStyle: "long", timeZone: "Asia/Hong_Kong"});
  const rows = await Promise.all(events.map(async (event) => {
    if ("title" in event) return event;
    const eventT = await getTranslations({locale, namespace: event.namespace});
    return {...event, id: event.slug, title: eventT("title"), description: ""};
  }));
  const messages = {
    registered: t("events.registered"), waitlist: t("events.waitlist"), alreadyRegistered: t("events.alreadyRegistered"), alreadyWaitlisted: t("events.alreadyWaitlisted"),
    unauthenticated: t("events.unauthenticated"), ineligible: t("events.ineligible"), closed: t("events.closed"), error: t("events.registerError"),
  };
  async function registerAction(state: RegistrationActionState, formData: FormData): Promise<RegistrationActionState> {
    "use server";
    return runEventRegistrationAction(state, formData, {
      messages,
      mutate: async (data) => {
        const actionActor = await requireActor();
        const result = await registerForEvent(actionActor, {eventId: data.get("eventId")});
        revalidatePath(`/${locale}/portal/events`);
        return result;
      },
    });
  }
  return <div className="space-y-8"><header className="space-y-3"><p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("events.title")}</p><h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{t("events.title")}</h1><p className="text-lg text-muted-foreground">{t("events.description")}</p></header>{rows.length === 0 ? <section className="glass-card p-6"><p className="text-muted-foreground">{t("events.empty")}</p></section> : <div className="grid gap-4 md:grid-cols-2">{rows.map((event) => <article className="glass-card space-y-3 p-5" key={event.slug}><h2 className="font-serif text-2xl font-semibold">{event.title}</h2><p className="text-sm"><span className="font-medium">{t("events.date")}:</span> {formatter.format(new Date(event.startsAt))}</p><p className="text-sm"><span className="font-medium">{t("events.venue")}:</span> {event.venue}</p><EventRegistrationForm action={registerAction} eventId={event.id} links={{ineligible: localizedPath(locale, "/membership"), unauthenticated: localizedPath(locale, "/join")}} messages={messages} pendingLabel={t("events.registering")} registerLabel={t("events.register")}/></article>)}</div>}</div>;
}
