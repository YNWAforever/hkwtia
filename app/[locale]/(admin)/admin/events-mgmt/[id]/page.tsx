import {revalidatePath} from "next/cache";
import {notFound} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {z} from "zod";

import {AttendeeTable} from "@/components/admin/attendee-table";
import {EventForm} from "@/components/admin/event-form";
import type {AppLocale} from "@/i18n/routing";
import {checkInAttendee} from "@/lib/admin/events";
import {requireAdminActor} from "@/lib/auth/actor";
import {eventsRepository, updateEvent} from "@/lib/db/repos/events";

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
  const t = await getTranslations({locale, namespace: "Admin.eventsMgmt"});
  async function updateAction(formData: FormData): Promise<void> {
    "use server";
    const actionActor = await requireAdminActor();
    const updated = await updateEvent(actionActor, parsedId.data, formInput(formData));
    if (!updated) notFound();
    revalidatePath(`/${locale}/admin/events-mgmt/${parsedId.data}`);
  }
  async function checkInAction(formData: FormData): Promise<void> {
    "use server";
    const actionActor = await requireAdminActor();
    await checkInAttendee(actionActor, {eventId: parsedId.data, profileId: formData.get("profileId")});
    revalidatePath(`/${locale}/admin/events-mgmt/${parsedId.data}`);
  }
  const labels = {slug: t("slug"), titleEn: t("titleEn"), titleZh: t("titleZh"), descriptionEn: t("descriptionEn"), descriptionZh: t("descriptionZh"), startsAt: t("startsAt"), endsAt: t("endsAt"), venue: t("venue"), capacity: t("capacity"), memberOnly: t("memberOnly"), published: t("published"), save: t("save")};
  const attendeeLabels = {caption: t("attendees"), name: t("name"), email: t("email"), status: t("status"), checkedIn: t("checkedIn"), checkIn: t("checkIn"), unavailable: t("unavailable")};
  return <div className="space-y-8"><header><p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p><h1 className="font-serif text-4xl font-semibold">{event.titleEn}</h1></header><EventForm action={updateAction} labels={labels} values={event}/><section className="glass-card p-6"><h2 className="font-serif text-2xl font-semibold">{t("attendees")}</h2><AttendeeTable attendees={attendees} labels={attendeeLabels} checkInAction={checkInAction}/></section></div>;
}
