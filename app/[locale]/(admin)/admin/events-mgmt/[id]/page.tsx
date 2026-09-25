
import {notFound} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {z} from "zod";

import {AttendeeTable} from "@/components/admin/attendee-table";
import {CancelEventPanel} from "@/components/admin/cancel-event-panel";
import {EventForm} from "@/components/admin/event-form";
import {OrdersTable} from "@/components/admin/orders-table";
import type {AppLocale} from "@/i18n/routing";
import {toCancelConfirmMessage} from "@/lib/admin/cancel-confirm-message";
import {cancelEventAction, checkInEventAttendeeAction, updateEventAction} from "@/lib/admin/event-actions";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {toRefundConfirmMessage} from "@/lib/admin/refund-confirm-message";
import {submitSeatCheckInAction} from "@/lib/tickets/check-in-actions";
import {submitRefundOrderAction} from "@/lib/tickets/refund-actions";


import {eventOrdersRepository} from "@/lib/db/repos/event-orders";
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
  // The costed cancellation preview: a failed read is `null`, never zeroes, so
  // the confirmation says "unavailable" rather than telling staff an event nobody
  // bought about is free to cancel (the rule the seat counts follow).
  const [allEvents, attendees, mediaRows, cancellation] = await Promise.all([
    eventsRepository.listForAdmin(actor),
    eventsRepository.listAttendees(actor, parsedId.data),
    mediaRepository.listActiveForAdmin(actor),
    eventsRepository.cancellationPreview(actor, parsedId.data).catch(() => null),
  ]);
  const event = allEvents.find((row) => row.id === parsedId.data);
  if (!event) notFound();
  // Spec section 4.5: the admin event page shows the paid and held seat counts
  // beside capacity, so staff can see a filling event. A failed order read must
  // not render as an empty count -- "nothing sold" and "we could not ask" are
  // different answers -- so a failure becomes an explicit unavailable state,
  // the rule the admin queues follow.
  const seatCounts = event.registrationMode === "ticketed"
    ? await Promise.all([
      eventOrdersRepository.heldSeats(event.id, new Date()),
      eventOrdersRepository.paidSeats(event.id),
    ]).then(([held, paid]) => ({held, paid})).catch(() => null)
    : null;
  // Only a ticketed event can have orders, so the read is skipped elsewhere. A
  // failed read is `null`, never `[]`: an unreachable table must not look like
  // an event nobody bought.
  const orders = event.registrationMode === "ticketed"
    ? await eventOrdersRepository.listEventOrders(event.id).catch(() => null)
    : [];
  // `attendees` is only `null` when the event id doesn't exist; `event` above
  // already proved it does, so this is defensive, not expected in practice.
  const attendeeRows = attendees ?? [];
  const localized = localizeEvent(event, locale);
  const t = await getTranslations({locale, namespace: "Admin.eventsMgmt"});
  // The seat outcomes reuse the check-in page's own copy: the door-list fallback
  // and the scanned page are the same write, so they report it in the same words.
  const tc = await getTranslations({locale, namespace: "Admin.checkIn"});
  const tOrders = await getTranslations({locale, namespace: "Admin.eventsMgmt.orders"});
  const updateActionMessages = {successMessage: t("updateSuccess"), validationMessage: t("validation"), errorMessage: t("error")};
  const checkInActionMessages = {successMessage: t("checkInSuccess"), eventCancelledMessage: t("checkInEventCancelled"), errorMessage: t("checkInError")};
  const resendPassMessages = {successMessage: t("resendSuccess"), errorMessage: t("resendError")};
  const seatCheckInMessages = {successMessage: tc("checkInSuccess"), successMessageAlready: tc("alreadyCheckedIn"), successMessageUndone: tc("undoSuccess"), notCheckedInMessage: tc("notCheckedIn"), notAdmissibleMessage: tc("notAdmissible"), errorMessage: tc("updateError")};
  const eventPath = "/" + locale + "/admin/events-mgmt/" + parsedId.data;
  const updateAction = updateEventAction.bind(null, parsedId.data, eventPath, updateActionMessages);
  const checkInAction = checkInEventAttendeeAction.bind(null, parsedId.data, eventPath, checkInActionMessages);
  // The door list has no scanner page, so the event detail page is the only
  // revalidation target; it is passed for both slots of the shared action, and a
  // successful check-in revalidates it (twice, which is idempotent) so the row
  // re-renders as checked in.
  const seatCheckInAction = submitSeatCheckInAction.bind(null, eventPath, eventPath, seatCheckInMessages);
  // The refund outcomes are resolved here from the staff member's own locale and
  // bound in, so a zh-HK page reports "nothing was charged back" in Chinese.
  const refundMessages = {
    refunded: tOrders("refundOutcomes.refunded"),
    alreadyRefunded: tOrders("refundOutcomes.alreadyRefunded"),
    notAdmissible: tOrders("refundOutcomes.notAdmissible"),
    providerFailed: tOrders("refundOutcomes.providerFailed"),
    commitFailed: tOrders("refundOutcomes.commitFailed"),
    notFound: tOrders("refundOutcomes.notFound"),
  };
  const refundAction = submitRefundOrderAction.bind(null, eventPath, refundMessages);
  // The cancel outcomes are resolved here from the staff member's own locale and
  // bound in, exactly as the refund outcomes are; `confirm` is `t.raw` because the
  // panel interpolates it by hand (see lib/admin/cancel-confirm-message.ts).
  const cancelMessages = {
    successMessage: t("cancel.outcomes.success"),
    alreadyCancelledMessage: t("cancel.outcomes.alreadyCancelled"),
    invalidTransitionMessage: t("cancel.outcomes.invalidTransition"),
    notFoundMessage: t("cancel.outcomes.notFound"),
    errorMessage: t("cancel.outcomes.error"),
  };
  const cancelLabels = {heading: t("cancel.heading"), description: t("cancel.description"), button: t("cancel.button"), keep: t("cancel.keep"), submitting: t("cancel.submitting"), unavailable: t("cancel.unavailable"), confirm: toCancelConfirmMessage(t.raw("cancel.confirm"))};
  const cancelAction = cancelEventAction.bind(null, parsedId.data, eventPath, cancelMessages);
  const labels = {slug: t("slug"), titleEn: t("titleEn"), titleZh: t("titleZh"), descriptionEn: t("descriptionEn"), descriptionZh: t("descriptionZh"), startsAt: t("startsAt"), endsAt: t("endsAt"), venue: t("venue"), capacity: t("capacity"), registrationMode: t("registrationMode"), registrationModes: {rsvp: t("registrationModes.rsvp"), external: t("registrationModes.external"), ticketed: t("registrationModes.ticketed")}, ticketPriceHkdCents: t("ticketPriceHkdCents"), memberOnly: t("memberOnly"), published: t("published"), heroMediaId: t("heroMediaId"), noHeroMedia: t("noHeroMedia"), save: t("save"), saving: t("saving")};
  const attendeeLabels = {caption: t("attendees"), kind: t("kind"), kinds: {member: t("kinds.member"), guest: t("kinds.guest"), ticket: t("kinds.ticket")}, name: t("name"), email: t("email"), organisation: t("organisation"), status: t("status"), checkedIn: t("checkedIn"), checkIn: t("checkIn"), checkingIn: t("checkingIn"), resendPass: t("resendPass"), resending: t("resending"), unavailable: t("unavailable"), statuses: {registered: t("statuses.registered"), waitlist: t("statuses.waitlist"), cancelled: t("statuses.cancelled"), attended: t("statuses.attended"), no_show: t("statuses.noShow"), paid: t("statuses.paid")}};
  const ordersLabels = {caption: tOrders("caption"), empty: tOrders("empty"), buyer: tOrders("buyer"), seats: tOrders("seats"), amount: tOrders("amount"), status: tOrders("status"), refundedOn: tOrders("refundedOn"), refund: tOrders("refund"), confirm: toRefundConfirmMessage(tOrders.raw("confirm")), cancel: tOrders("cancel"), note: tOrders("note"), statuses: {pending: tOrders("statuses.pending"), paid: tOrders("statuses.paid"), expired: tOrders("statuses.expired"), failed: tOrders("statuses.failed"), refunded: tOrders("statuses.refunded")}};
  return <div className="space-y-8"><header><p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p><h1 className="font-serif text-4xl font-semibold">{localized.title}</h1>{event.registrationMode === "ticketed" ? seatCounts === null ? <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive" role="alert">{t("seatsUnavailable")}</p> : <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">{event.capacity !== null ? <div className="flex items-baseline gap-2"><dt className="text-muted-foreground">{t("capacity")}</dt><dd className="font-medium">{event.capacity}</dd></div> : null}<div className="flex items-baseline gap-2"><dt className="text-muted-foreground">{t("seatsPaid")}</dt><dd className="font-medium">{seatCounts.paid}</dd></div><div className="flex items-baseline gap-2"><dt className="text-muted-foreground">{t("seatsHeld")}</dt><dd className="font-medium">{seatCounts.held}</dd></div></dl> : null}</header>{event.status === "cancelled" ? null : <EventForm action={updateAction} labels={labels} mediaRows={mediaRows} values={event}/>}<section className="glass-card p-6">{event.status === "cancelled" ? <><h2 className="font-serif text-2xl font-semibold">{t("cancel.heading")}</h2><p className="text-sm text-muted-foreground" role="status">{t("cancel.cancelledNotice")}</p></> : <CancelEventPanel action={cancelAction} labels={cancelLabels} locale={locale} preview={cancellation}/>}</section>{event.registrationMode === "ticketed" ? <section className="glass-card p-6"><h2 className="font-serif text-2xl font-semibold">{tOrders("heading")}</h2>{orders === null ? <p role="alert">{tOrders("unavailable")}</p> : <OrdersTable action={refundAction} labels={ordersLabels} locale={locale} rows={orders}/>}</section> : null}<section className="glass-card p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-2xl font-semibold">{t("attendees")}</h2><a className="text-primary underline" href={`/api/admin/events/${event.id}/attendees.csv`}>{t("exportCsv")}</a></div><AttendeeTable attendees={attendeeRows} checkInAction={checkInAction} labels={attendeeLabels} locale={locale} resendPassMessages={resendPassMessages} resendPassPath={eventPath} seatCheckInAction={seatCheckInAction} checkInBlocked={event.status === "cancelled"}/></section></div>;
}
