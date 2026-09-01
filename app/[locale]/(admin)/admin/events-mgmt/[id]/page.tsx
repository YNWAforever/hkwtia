
import {notFound} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {z} from "zod";

import {AttendeeTable} from "@/components/admin/attendee-table";
import {EventForm} from "@/components/admin/event-form";
import type {AppLocale} from "@/i18n/routing";
import {checkInEventAttendeeAction, updateEventAction} from "@/lib/admin/event-actions";
import {requireAdminPageActor} from "@/lib/admin/page-auth";


import {eventsRepository, localizeEvent} from "@/lib/db/repos/events";
import {mediaRepository} from "@/lib/db/repos/media";

type Props = Readonly<{params: Promise<{locale: string; id: string}>}>;
const idSchema = z.string().uuid();

export default async function AdminEventDetailPage({params}: Props) {
  const {locale: localeValue, id: rawId} = await params;
  const locale = localeValue as AppLocale;
  const parsedId = idSchema.safeParse(rawId);
  if (!parsedId.success) notFound();
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const [allEvents, attendees, mediaRows] = await Promise.all([
    eventsRepository.listForAdmin(actor),
    eventsRepository.listAttendees(actor, parsedId.data),
    mediaRepository.listActiveForAdmin(actor),
  ]);
  const event = allEvents.find((row) => row.id === parsedId.data);
  if (!event) notFound();
  const localized = localizeEvent(event, locale);
  const t = await getTranslations({locale, namespace: "Admin.eventsMgmt"});
  const updateActionMessages = {successMessage: t("updateSuccess"), validationMessage: t("validation"), errorMessage: t("error")};
  const checkInActionMessages = {successMessage: t("checkInSuccess"), errorMessage: t("checkInError")};
  const eventPath = "/" + locale + "/admin/events-mgmt/" + parsedId.data;
  const updateAction = updateEventAction.bind(null, parsedId.data, eventPath, updateActionMessages);
  const checkInAction = checkInEventAttendeeAction.bind(null, parsedId.data, eventPath, checkInActionMessages);
  const labels = {slug: t("slug"), titleEn: t("titleEn"), titleZh: t("titleZh"), descriptionEn: t("descriptionEn"), descriptionZh: t("descriptionZh"), startsAt: t("startsAt"), endsAt: t("endsAt"), venue: t("venue"), capacity: t("capacity"), memberOnly: t("memberOnly"), published: t("published"), heroMediaId: t("heroMediaId"), noHeroMedia: t("noHeroMedia"), save: t("save"), saving: t("saving")};
  const attendeeLabels = {caption: t("attendees"), name: t("name"), email: t("email"), status: t("status"), checkedIn: t("checkedIn"), checkIn: t("checkIn"), checkingIn: t("checkingIn"), unavailable: t("unavailable"), statuses: {registered: t("statuses.registered"), waitlist: t("statuses.waitlist"), cancelled: t("statuses.cancelled"), attended: t("statuses.attended"), no_show: t("statuses.noShow")}};
  return <div className="space-y-8"><header><p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p><h1 className="font-serif text-4xl font-semibold">{localized.title}</h1></header><EventForm action={updateAction} labels={labels} mediaRows={mediaRows} values={event}/><section className="glass-card p-6"><h2 className="font-serif text-2xl font-semibold">{t("attendees")}</h2><AttendeeTable attendees={attendees} checkInAction={checkInAction} labels={attendeeLabels} locale={locale}/></section></div>;
}
