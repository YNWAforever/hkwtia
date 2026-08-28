import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {EventDetail} from "@/components/marketing/event-detail";
import {EventRegistrationForm} from "@/components/portal/event-registration-form";
import {StructuredData} from "@/components/seo/structured-data";
import type {AppLocale} from "@/i18n/routing";
import {eventsRepository} from "@/lib/db/repos/events";
import {eventBoundary} from "@/lib/events/public";
import {runPublicEventRegistrationAction, type RegistrationActionState} from "@/lib/events/registration-action";
import {buildPageMetadata} from "@/lib/metadata";
import {buildEventData} from "@/lib/structured-data";
import {localizedPath} from "@/lib/urls";

export const dynamic = "force-dynamic";
type Props = Readonly<{params: Promise<{locale: string; slug: string}>}>;

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale, slug} = await params;
  const row = await eventsRepository.getPublicBySlug(slug, locale, {asOf: new Date()}).catch(() => null);
  if (!row) return {};
  return buildPageMetadata({locale: locale as AppLocale, pathname: `/events/${row.slug}`, title: row.title, description: row.description});
}

export default async function EventPage({params}: Props) {
  const {locale, slug} = await params;
  setRequestLocale(locale);
  const [event, t] = await Promise.all([eventsRepository.getPublicBySlug(slug, locale, {asOf: new Date()}).catch(() => null), getTranslations({locale, namespace: "Events"})]);
  if (!event) notFound();
  const appLocale = locale as AppLocale;
  const registrationMessages = {registered: t("registration.registered"), waitlist: t("registration.waitlist"), alreadyRegistered: t("registration.alreadyRegistered"), alreadyWaitlisted: t("registration.alreadyWaitlisted"), unauthenticated: t("registration.unauthenticated"), ineligible: t("registration.ineligible"), closed: t("registration.closed"), error: t("registration.error")};
  async function registerAction(state: RegistrationActionState, formData: FormData): Promise<RegistrationActionState> { "use server"; return runPublicEventRegistrationAction(state, formData, {messages: registrationMessages}); }
  const past = eventBoundary({startsAt: new Date(event.startsAt), endsAt: event.endsAt ? new Date(event.endsAt) : null}) < new Date();
  return <><StructuredData data={buildEventData({...event, image: event.hero?.url}, event.title, appLocale)}/><section className="container mx-auto px-6 py-12"><EventDetail event={event} labels={{date: t("detail.date"), venue: t("detail.venue"), capacity: t("detail.capacity")}} locale={locale}/>{!past ? <section className="mt-8 glass-card space-y-3 p-6"><h2 className="font-serif text-2xl font-semibold">{t("registration.title")}</h2><EventRegistrationForm action={registerAction} eventId={event.id} links={{ineligible: localizedPath(appLocale, "/membership"), unauthenticated: localizedPath(appLocale, "/join")}} messages={registrationMessages} pendingLabel={t("registration.pending")} registerLabel={t("registration.submit")}/></section> : null}</section></>;
}
