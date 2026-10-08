import {revalidatePath} from "next/cache";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {PrivateLink as Link} from "@/components/internal-shell/private-link";

import {PortalDateBlock} from "@/components/portal/date-block";
import {EventRegistrationForm} from "@/components/portal/event-registration-form";
import {PortalPageHeader} from "@/components/portal/page-header";
import {HonestEmpty} from "@/components/wt/honest-empty";
import {StatusLabel} from "@/components/wt/status-label";
import type {AppLocale} from "@/i18n/routing";
import {requireActor} from "@/lib/auth/actor";
import {portalPageActor} from "@/lib/portal/page-actor";
import {registerForEvent} from "@/lib/db/repos/events";
import {memberEventViewFromRow} from "@/lib/events/member-contract";
import {listMyCompanyEvents, loadMemberEventsContext} from "@/lib/events/member-core";
import type {RegistrationActionState} from "@/lib/events/registration-state";
import {localizedEventTitle} from "@/lib/portal/event-title";
import {formatPortalDate} from "@/lib/portal/format-date";
import {runEventRegistrationAction} from "@/lib/portal/event-action-core";
import {getMemberEvents} from "@/lib/portal/content";
import {localizedPath} from "@/lib/urls";

export const dynamic = "force-dynamic";
type Props = Readonly<{params: Promise<{locale: string}>}>;

export default async function MemberEventsPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await portalPageActor(locale, "/portal/events");
  const events = await getMemberEvents(actor, undefined, locale);
  // Null when the member manages no company (or the membership is inactive):
  // the publishing section is then simply absent rather than an error.
  const mine = await listMyCompanyEvents(actor).catch(() => null);
  // A quota read failure drops only the quota line; the member's events still render.
  const quota = mine ? await loadMemberEventsContext(actor).catch(() => null) : null;
  const t = await getTranslations({locale, namespace: "Portal"});
  const rows = await Promise.all(events.map(async (event) => {
    if ("title" in event) return event;
    const eventT = await getTranslations({locale, namespace: event.namespace});
    return {...event, id: event.slug, title: eventT("title"), description: ""};
  }));
  const messages = {
    registered: t("events.registered"), waitlist: t("events.waitlist"), alreadyRegistered: t("events.alreadyRegistered"), alreadyWaitlisted: t("events.alreadyWaitlisted"),
    unauthenticated: t("events.unauthenticated"), ineligible: t("events.ineligible"), closed: t("events.closed"), error: t("events.registerError"),
  };
  function registrationControl(event: (typeof rows)[number]) {
    if (!("registrationMode" in event)) return <p className="portal-status-note">{t("events.registrationUnavailable")}</p>;
    if (event.registrationMode === "rsvp") {
      return <EventRegistrationForm action={registerAction} eventId={event.id} links={{ineligible: localizedPath(locale, "/membership"), unauthenticated: localizedPath(locale, "/join")}} messages={messages} pendingLabel={t("events.registering")} registerLabel={t("events.register")}/>;
    }
    if (event.registrationMode === "external" && event.externalRegistrationUrl) {
      return <a className="text-link" href={event.externalRegistrationUrl} rel="noopener noreferrer" target="_blank">{t("events.externalRegister")}<span className="sr-only"> {t("common.newTab")}</span></a>;
    }
    if (event.registrationMode === "ticketed" && event.visibility === "public") {
      return <Link className="text-link" href={localizedPath(locale, `/events/${event.slug}`)}>{t("events.viewTickets")}</Link>;
    }
    return <p className="portal-status-note">{t("events.registrationUnavailable")}</p>;
  }
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
  const upcoming = rows.length === 0 ? (
    <HonestEmpty variant="inner" headingLevel={2} title={t("events.emptyTitle")} copy={t("events.empty")} actions={[{href: "/events", label: t("events.emptyAction")}]}/>
  ) : (
    <div className="portal-card-grid">
      {rows.map((event) => (
        <article className="portal-card portal-event-card" key={event.slug}>
          <PortalDateBlock locale={locale} value={event.startsAt}/>
          <div className="portal-event-body">
            <h2>{event.title}</h2>
            {event.venue ? <p>{event.venue}</p> : null}
            {registrationControl(event)}
          </div>
        </article>
      ))}
    </div>
  );
  const quotaLimit = quota ? (Number.isFinite(quota.limit) ? String(quota.limit) : t("memberEvents.unlimited")) : "";
  return (
    <div className="portal-events">
      <PortalPageHeader eyebrow={t("navGroups.benefits")} title={t("events.title")} lead={t("events.description")}/>
      {upcoming}
      {mine ? (
        <section className="portal-events-mine">
          <div className="portal-section-head">
            <h2>{t("memberEvents.listTitle")}</h2>
            <Link className="button" href={localizedPath(locale, "/portal/events/new")}>{t("memberEvents.newAction")}</Link>
          </div>
          {quota ? <p className="portal-status-note">{t("memberEvents.quota", {used: quota.usedThisQuarter, limit: quotaLimit})}</p> : null}
          {mine.events.length === 0 ? <p className="portal-status-note">{t("memberEvents.listEmpty")}</p> : (
            <ul className="portal-card-grid">
              {mine.events.map((row) => ({event: memberEventViewFromRow(row), startsAt: row.starts_at})).map(({event, startsAt}) => (
                <li className="portal-card portal-event-card" key={event.id}>
                  <PortalDateBlock locale={locale} value={startsAt}/>
                  <div className="portal-event-body">
                    <StatusLabel>{t(`memberEvents.status.${event.status}`)}</StatusLabel>
                    <h3>{localizedEventTitle(locale, event)}</h3>
                    <p>{formatPortalDate(locale, startsAt)}</p>
                    {event.status === "rejected" && event.rejectionReason ? <p className="portal-form-alert">{t("memberEvents.rejectedWith", {reason: event.rejectionReason})}</p> : null}
                    <Link className="text-link" href={localizedPath(locale, `/portal/events/${event.id}/edit`)}>{t("memberEvents.edit")}</Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
