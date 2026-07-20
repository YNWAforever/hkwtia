import {revalidatePath} from "next/cache";
import {notFound} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {z} from "zod";

import {AttendeeTable} from "@/components/admin/attendee-table";
import {EventForm} from "@/components/admin/event-form";
import type {AppLocale} from "@/i18n/routing";
import {runCheckInAction, runEventFormAction, type EventActionState} from "@/lib/admin/event-action-core";
import {checkInAttendee} from "@/lib/admin/events";
import {requireAdminActor} from "@/lib/auth/actor";
import {eventsRepository, localizeEvent, updateEvent} from "@/lib/db/repos/events";

type Props = Readonly<{params: Promise<{locale: string; id: string}>}>;
const idSchema = z.string().uuid();

function formInput(formData: FormData) {
  const capacity = String(formData.get("capacity") ?? "").trim();
  const optional = (name: string) => String(formData.get(name) ?? "").trim() || null;
  return {slug: formData.get("slug"), titleEn: formData.get("titleEn"), titleZh: optional("titleZh"), descriptionEn: formData.get("descriptionEn"), descriptionZh: optional("descriptionZh"), startsAt: formData.get("startsAt"), endsAt: optional("endsAt"), venue: optional("venue"), capacity: capacity ? Number(capacity) : null, memberOnly: formData.get("memberOnly") === "on", published: formData.get("published") === "on"};
}

export default async function AdminEventDetailPage({params}: Props) {
  const {locale: localeValue, id: rawId} = await params;
  const locale = localeValue as AppLocale;
  const parsedId = idSchema.safeParse(rawId);
  if (!parsedId.success) notFound();
  setRequestLocale(locale);
  const actor = await requireAdminActor();
  const [allEvents, attendees] = await Promise.all([eventsRepository.listForAdmin(actor), eventsRepository.listAttendees(actor, parsedId.data)]);
  const event = allEvents.find((row) => row.id === parsedId.data);
  if (!event) notFound();
  const localized = localizeEvent(event, locale);
  const t = await getTranslations({locale, namespace: "Admin.eventsMgmt"});
  async function updateAction(state: EventActionState, formData: FormData): Promise<EventActionState> {
    "use server";
    return runEventFormAction(state, formData, {successMessage: t("updateSuccess"), validationMessage: t("validation"), errorMessage: t("error"), mutate: async (data) => {
      const updated = await updateEvent(await requireAdminActor(), parsedId.data, formInput(data));
      if (!updated) throw new Error("EVENT_NOT_FOUND");
      revalidatePath(`/${locale}/admin/events-mgmt/${parsedId.data}`);
    }});
  }
  async function checkInAction(state: EventActionState, formData: FormData): Promise<EventActionState> {
    "use server";
    return runCheckInAction(state, formData, {successMessage: t("checkInSuccess"), errorMessage: t("checkInError"), mutate: async (data) => {
      await checkInAttendee(await requireAdminActor(), {eventId: parsedId.data, profileId: data.get("profileId")});
      revalidatePath(`/${locale}/admin/events-mgmt/${parsedId.data}`);
    }});
  }
  const labels = {slug: t("slug"), titleEn: t("titleEn"), titleZh: t("titleZh"), descriptionEn: t("descriptionEn"), descriptionZh: t("descriptionZh"), startsAt: t("startsAt"), endsAt: t("endsAt"), venue: t("venue"), capacity: t("capacity"), memberOnly: t("memberOnly"), published: t("published"), save: t("save"), saving: t("saving")};
  const attendeeLabels = {caption: t("attendees"), name: t("name"), email: t("email"), status: t("status"), checkedIn: t("checkedIn"), checkIn: t("checkIn"), checkingIn: t("checkingIn"), unavailable: t("unavailable"), statuses: {registered: t("statuses.registered"), waitlist: t("statuses.waitlist"), cancelled: t("statuses.cancelled"), attended: t("statuses.attended"), no_show: t("statuses.noShow")}};
  return <div className="space-y-8"><header><p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p><h1 className="font-serif text-4xl font-semibold">{localized.title}</h1></header><EventForm action={updateAction} labels={labels} values={event}/><section className="glass-card p-6"><h2 className="font-serif text-2xl font-semibold">{t("attendees")}</h2><AttendeeTable attendees={attendees} checkInAction={checkInAction} labels={attendeeLabels} locale={locale}/></section></div>;
}
