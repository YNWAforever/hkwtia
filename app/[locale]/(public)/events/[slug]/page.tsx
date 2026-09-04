import type {CSSProperties} from "react";
import type {Metadata} from "next";
import Link from "next/link";
import {notFound} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {EventDetail} from "@/components/marketing/event-detail";
import {EventRegistrationForm} from "@/components/portal/event-registration-form";
import {StructuredData} from "@/components/seo/structured-data";
import type {AppLocale} from "@/i18n/routing";
import {eventsRepository} from "@/lib/db/repos/events";
import {eventBoundary} from "@/lib/events/public";
import {formatEventDate} from "@/lib/home/format-event-date";
import {isPrivateMediaDeliveryUrl, isRegistrableMediaUrl} from "@/lib/media/url";
import {runPublicEventRegistrationAction} from "@/lib/events/registration-action";
import type {RegistrationActionState} from "@/lib/events/registration-state";
import {buildPageMetadata} from "@/lib/metadata";
import {buildEventData} from "@/lib/structured-data";
import {localizedPath} from "@/lib/urls";

export const dynamic = "force-dynamic";
type Props = Readonly<{params: Promise<{locale: string; slug: string}>}>;
// Same own-origin placeholder components/home/hero.tsx uses "until WP-5" -- no donor
// /editorial event photo is ported into public/ yet.
const EVENT_HERO_PLACEHOLDER = "/images/projects-hero.jpg";

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale, slug} = await params;
  const row = await eventsRepository.getPublicBySlug(slug, locale, {asOf: new Date()}).catch(() => null);
  if (!row) return {};
  return buildPageMetadata({locale: locale as AppLocale, pathname: `/events/${row.slug}`, title: row.title, description: row.description});
}

export default async function EventPage({params}: Props) {
  const {locale, slug} = await params;
  setRequestLocale(locale);
  const asOf = new Date();
  const [event, t] = await Promise.all([eventsRepository.getPublicBySlug(slug, locale, {asOf}).catch(() => null), getTranslations({locale, namespace: "Events"})]);
  if (!event) notFound();
  const displayEvent = event.hero && !(isPrivateMediaDeliveryUrl(event.hero.url) || isRegistrableMediaUrl(event.hero.url)) ? {...event, hero: null} : event;
  const appLocale = locale as AppLocale;
  const registrationMessages = {registered: t("registration.registered"), waitlist: t("registration.waitlist"), alreadyRegistered: t("registration.alreadyRegistered"), alreadyWaitlisted: t("registration.alreadyWaitlisted"), unauthenticated: t("registration.unauthenticated"), ineligible: t("registration.ineligible"), closed: t("registration.closed"), error: t("registration.error")};
  async function registerAction(state: RegistrationActionState, formData: FormData): Promise<RegistrationActionState> { "use server"; return runPublicEventRegistrationAction(state, formData, {messages: registrationMessages}); }
  const past = eventBoundary({startsAt: new Date(displayEvent.startsAt), endsAt: displayEvent.endsAt ? new Date(displayEvent.endsAt) : null}) < asOf;
  const detailLabels = {date: t("detail.date"), venue: t("detail.venue"), capacity: t("detail.capacity")};
  // app/styles/wisetech.css:565's `.event-detail-hero` background-image reads var(--wt-event-photo)
  // with no fallback -- an unset custom property invalidates the whole declaration, so this is
  // always set: the event's own validated, already-filtered hero, or the placeholder above.
  const heroStyle = {"--wt-event-photo": `url(${displayEvent.hero?.url ?? EVENT_HERO_PLACEHOLDER})`} as CSSProperties;

  return (
    <>
      <StructuredData data={buildEventData({...displayEvent, image: displayEvent.hero?.url}, displayEvent.title, appLocale)} />
      <section className="event-detail-page">
        {/* EventDetail is rendered completely unchanged inside this wrapper: its own <h1> is
            the page's only title, styled by the donor's `.event-detail-hero h1` descendant rule
            without this file touching EventDetail's markup at all. */}
        <section className="event-detail-hero" style={heroStyle}>
          <div className="shell">
            <div className="event-detail-meta">
              <span>{t("detail.eyebrow")}</span>
              <span>{formatEventDate(displayEvent.startsAt, appLocale)}</span>
            </div>
            <EventDetail event={displayEvent} labels={detailLabels} locale={locale} />
          </div>
        </section>
        <div className="shell">
          <div className="event-detail-layout">
            <div className="event-detail-main">
              <section>
                <h2>{t("detail.factsTitle")}</h2>
                <div className="event-detail-facts">
                  <div><span>{detailLabels.date}</span><time dateTime={displayEvent.startsAt}>{formatEventDate(displayEvent.startsAt, appLocale)}</time></div>
                  {displayEvent.venue ? <div><span>{detailLabels.venue}</span><strong>{displayEvent.venue}</strong></div> : null}
                  {displayEvent.capacity !== null ? <div><span>{detailLabels.capacity}</span><strong>{displayEvent.capacity}</strong></div> : null}
                </div>
              </section>
            </div>
            <aside className="event-detail-aside">
              <h2>{t("detail.asideTitle")}</h2>
              {/* Plain next/link + localizedPath, not @/i18n/navigation's Link: the latter's
                  createNavigation() call needs next/navigation's redirect/permanentRedirect at
                  module-eval time, which breaks the pinned event-public-detail-review test's
                  partial next/navigation mock. event-registration-form.tsx already uses this
                  same plain-Link + localizedPath pattern for its own event-scoped links. */}
              <Link href={localizedPath(appLocale, "/contact")}>{t("detail.asideContact")}</Link>
              <Link href={localizedPath(appLocale, "/events")}>{t("detail.asideBrowse")}</Link>
            </aside>
          </div>
        </div>
        {!past ? (
          <div className="event-action-bar">
            <div>
              <time dateTime={displayEvent.startsAt}>{formatEventDate(displayEvent.startsAt, appLocale)}</time>
              <strong>{t("status.open")}</strong>
            </div>
            <div>
              <EventRegistrationForm action={registerAction} eventId={displayEvent.id} links={{ineligible: localizedPath(appLocale, "/membership"), unauthenticated: localizedPath(appLocale, "/join")}} messages={registrationMessages} pendingLabel={t("registration.pending")} registerLabel={t("registration.submit")} />
            </div>
          </div>
        ) : (
          <div className="event-action-bar">
            <div><strong>{t("detail.pastEventLabel")}</strong></div>
            <div><p>{t("detail.pastEventNotice")}</p></div>
          </div>
        )}
      </section>
    </>
  );
}
