import {contentDraftAssistance} from "@/lib/admin/content-draft-assistance";
import {EventAttendeeExportButton} from "@/components/admin/event-attendee-export-button";

import {notFound} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {z} from "zod";

import {AttendeeTable} from "@/components/admin/attendee-table";
import {CancelEventPanel} from "@/components/admin/cancel-event-panel";
import {EventForm} from "@/components/admin/event-form";
import {OrdersTable} from "@/components/admin/orders-table";
import type {AppLocale} from "@/i18n/routing";
import {toCancelConfirmMessage} from "@/lib/admin/cancel-confirm-message";
import {cancelEventAction, checkInEventAttendeeAction, checkInEventGuestAction, updateEventAction} from "@/lib/admin/event-actions";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {toRefundConfirmMessage} from "@/lib/admin/refund-confirm-message";
import {submitSeatCheckInAction} from "@/lib/tickets/check-in-actions";
import {submitRefundOrderAction} from "@/lib/tickets/refund-actions";


import {eventOrdersRepository, listEventOrderPage} from "@/lib/db/repos/event-orders";
import {parsePageQuery} from "@/lib/admin/pagination";
import {eventNotificationsRepository} from "@/lib/db/repos/event-notifications";
import {eventsRepository, localizeEvent} from "@/lib/db/repos/events";
import {mediaRepository} from "@/lib/db/repos/media";

type Props = Readonly<{params: Promise<{locale: string; id: string}>; searchParams?: Promise<Record<string, string | string[] | undefined>>}>;
const idSchema = z.string().uuid();

export default async function AdminEventDetailPage({params, searchParams}: Props) {
  const {locale: localeValue, id: rawId} = await params;
  const locale = localeValue as AppLocale;
  const parsedId = idSchema.safeParse(rawId);
  if (!parsedId.success) notFound();
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const rawQuery = searchParams ? await searchParams : {};
  const tab = z.enum(["content", "attendees", "orders", "notifications"]).safeParse(rawQuery.tab ?? "content");
  if (!tab.success) notFound();
  const publicEventPath = `${locale === "zh-HK" ? "/zh" : ""}/admin/events-mgmt/${parsedId.data}`;
  const pageQuery = tab.data === "attendees" || tab.data === "orders"
    ? parsePageQuery({search: typeof rawQuery.q === "string" ? rawQuery.q : "", cursor: typeof rawQuery.cursor === "string" ? rawQuery.cursor : null, limit: 20})
    : null;
  const event = await eventsRepository.getForAdmin(actor, parsedId.data);
  if (!event) notFound();
  const contentAssistance = tab.data === "content" ? await contentDraftAssistance(actor, "event", parsedId.data, locale) : undefined;
  const mediaRows = tab.data === "content" ? await mediaRepository.listActiveForAdmin(actor) : [];
  // Fail closed on unavailable previews; never turn an unreadable cost into zero.
  const cancellation = tab.data === "content" && event.status !== "cancelled"
    ? await eventsRepository.cancellationPreview(actor, event.id).catch(() => null) : null;
  const notificationPreview = (tab.data === "content" || tab.data === "notifications") && event.status !== "cancelled"
    ? await eventNotificationsRepository.preview(actor, event.id).catch(() => null) : null;
  const notificationSummary = (tab.data === "content" || tab.data === "notifications") && event.status === "cancelled"
    ? await eventNotificationsRepository.summary(actor, event.id).catch(() => null) : null;
  const seatCounts = event.registrationMode === "ticketed"
    ? await Promise.all([
      eventOrdersRepository.heldSeats(event.id, new Date()),
      eventOrdersRepository.paidSeats(event.id),
    ]).then(([held, paid]) => ({held, paid})).catch(() => null)
    : null;
  const attendeePage = tab.data === "attendees" && pageQuery
    ? await eventsRepository.listAttendeePage(actor, event.id, pageQuery).catch(() => null) : null;
  const orderPage = tab.data === "orders" && pageQuery && event.registrationMode === "ticketed"
    ? await listEventOrderPage(actor, event.id, pageQuery).catch(() => null) : null;
  const localized = localizeEvent(event, locale);
  const tabHref = (nextTab: string, cursor?: string | null) => {
    const params = new URLSearchParams({tab: nextTab});
    if (nextTab === tab.data && pageQuery?.search) params.set("q", pageQuery.search);
    if (cursor) params.set("cursor", cursor);
    return `${publicEventPath}?${params}`;
  };
  const t = await getTranslations({locale, namespace: "Admin.eventsMgmt"});
  // The seat outcomes reuse the check-in page's own copy: the door-list fallback
  // and the scanned page are the same write, so they report it in the same words.
  const tc = await getTranslations({locale, namespace: "Admin.checkIn"});
  const tOrders = await getTranslations({locale, namespace: "Admin.eventsMgmt.orders"});
  const updateActionMessages = {successMessage: t("updateSuccess"), validationMessage: t("validation"), errorMessage: t("error"), conflictMessage: t("editConflict")};
  const checkInActionMessages = {successMessage: t("checkInSuccess"), eventCancelledMessage: t("checkInEventCancelled"), errorMessage: t("checkInError")};
  const resendPassMessages = {successMessage: t("resendSuccess"), errorMessage: t("resendError"), queuedMessage: t("resendQueued"), uncertainMessage: t("resendUncertain")};
  const seatCheckInMessages = {successMessage: tc("checkInSuccess"), successMessageAlready: tc("alreadyCheckedIn"), successMessageUndone: tc("undoSuccess"), notCheckedInMessage: tc("notCheckedIn"), notAdmissibleMessage: tc("notAdmissible"), errorMessage: tc("updateError")};
  const eventPath = "/" + locale + "/admin/events-mgmt/" + parsedId.data;
  const updateAction = updateEventAction.bind(null, parsedId.data, eventPath, updateActionMessages);
  const checkInAction = checkInEventAttendeeAction.bind(null, parsedId.data, eventPath, checkInActionMessages);
  const guestCheckInMessages = {successMessage: t("checkInSuccess"), alreadyMessage: t("guestAlreadyCheckedIn"), ineligibleMessage: t("guestIneligible"), errorMessage: t("checkInError")};
  const guestCheckInAction = checkInEventGuestAction.bind(null, parsedId.data, eventPath, guestCheckInMessages);
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
    pending: tOrders("refundOutcomes.pending"),
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
  const cancelLabels = {heading: t("cancel.heading"), description: t("cancel.description"), button: t("cancel.button"), keep: t("cancel.keep"), submitting: t("cancel.submitting"), unavailable: t("cancel.unavailable"), confirm: toCancelConfirmMessage(t.raw("cancel.confirm")), noticePreview: t.raw("cancel.noticePreview"), noticeUnavailable: t("cancel.noticeUnavailable")};
  const cancelAction = cancelEventAction.bind(null, parsedId.data, eventPath, cancelMessages);
  const labels = {slug: t("slug"), titleEn: t("titleEn"), titleZh: t("titleZh"), descriptionEn: t("descriptionEn"), descriptionZh: t("descriptionZh"), startsAt: t("startsAt"), endsAt: t("endsAt"), venue: t("venue"), capacity: t("capacity"), registrationMode: t("registrationMode"), registrationModes: {rsvp: t("registrationModes.rsvp"), external: t("registrationModes.external"), ticketed: t("registrationModes.ticketed")}, format: t("format"), formats: {in_person: t("formats.in_person"), online: t("formats.online"), hybrid: t("formats.hybrid")}, onlineUrl: t("onlineUrl"), externalRegistrationUrl: t("externalRegistrationUrl"), tags: t("tags"), visibility: t("visibility"), visibilities: {public: t("visibilities.public"), members_only: t("visibilities.members_only"), invite_only: t("visibilities.invite_only")}, ticketPriceHkdCents: t("ticketPriceHkdCents"), memberOnly: t("memberOnly"), published: t("published"), mediaSearch:t("mediaSearch"),mediaResult:t("mediaResult"),mediaSelected:t("mediaSelected"),heroMediaId: t("heroMediaId"), noHeroMedia: t("noHeroMedia"), save: t("save"), saving: t("saving"), saveDraft: t("saveDraft"), savePublish: t("savePublish"), previewDraft: t("previewDraft"), previewPrivate: t("previewPrivate"), previewEnglish: t("previewEnglish"), previewChinese: t("previewChinese")};
  const attendeeLabels = {caption: t("attendees"), search: t("attendeeSearch"), noMatches: t("attendeeNoMatches"), kind: t("kind"), kinds: {member: t("kinds.member"), guest: t("kinds.guest"), ticket: t("kinds.ticket")}, name: t("name"), email: t("email"), organisation: t("organisation"), status: t("status"), checkedIn: t("checkedIn"), checkIn: t("checkIn"), checkingIn: t("checkingIn"), resendPass: t("resendPass"), resending: t("resending"), unavailable: t("unavailable"), statuses: {registered: t("statuses.registered"), waitlist: t("statuses.waitlist"), cancelled: t("statuses.cancelled"), attended: t("statuses.attended"), no_show: t("statuses.noShow"), paid: t("statuses.paid")}};
  const ordersLabels = {caption: tOrders("caption"), reference: tOrders("reference"), empty: tOrders("empty"), buyer: tOrders("buyer"), seats: tOrders("seats"), amount: tOrders("amount"), status: tOrders("status"), refundedOn: tOrders("refundedOn"), refund: tOrders("refund"), recheckRefund: tOrders("recheckRefund"), confirm: toRefundConfirmMessage(tOrders.raw("confirm")), cancel: tOrders("cancel"), note: tOrders("note"), statuses: {pending: tOrders("statuses.pending"), paid: tOrders("statuses.paid"), expired: tOrders("statuses.expired"), failed: tOrders("statuses.failed"), refunded: tOrders("statuses.refunded"), refund_failed: tOrders("statuses.refund_failed"), refund_pending: tOrders("statuses.refund_pending")}};
  return <div className="space-y-8">
    <header>
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p>
      <h1 className="font-serif text-4xl font-semibold">{localized.title}</h1>
      {event.registrationMode === "ticketed" ? seatCounts === null
        ? <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive" role="alert">{t("seatsUnavailable")}</p>
        : <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {event.capacity !== null ? <div className="flex items-baseline gap-2"><dt className="text-muted-foreground">{t("capacity")}</dt><dd className="font-medium">{event.capacity}</dd></div> : null}
          <div className="flex items-baseline gap-2"><dt className="text-muted-foreground">{t("seatsPaid")}</dt><dd className="font-medium">{seatCounts.paid}</dd></div>
          <div className="flex items-baseline gap-2"><dt className="text-muted-foreground">{t("seatsHeld")}</dt><dd className="font-medium">{seatCounts.held}</dd></div>
        </dl> : null}
    </header>
    <nav aria-label={t("tabs.label")} className="flex flex-wrap gap-2">
      {(["content", "attendees", "orders", "notifications"] as const)
        .filter((item) => item !== "orders" || event.registrationMode === "ticketed")
        .map((item) => <a aria-current={tab.data === item ? "page" : undefined} className="min-h-11 rounded-md border px-4 py-2 aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground" href={tabHref(item)} key={item}>{t(`tabs.${item}`)}</a>)}
    </nav>
    {tab.data === "content" ? <>
      {event.status === "cancelled" ? null : <EventForm action={updateAction} labels={labels} mediaRows={mediaRows} values={event} assistance={contentAssistance}/>}
      <section className="glass-card p-6">{event.status === "cancelled" ? <>
        <h2 className="font-serif text-2xl font-semibold">{t("cancel.heading")}</h2>
        <p className="text-sm text-muted-foreground" role="status">{t("cancel.cancelledNotice")}</p>
        {notificationSummary ? <p className="mt-2 text-sm">{t("cancel.noticeSummary", notificationSummary)}</p> : <p className="mt-2 text-sm" role="alert">{t("cancel.noticeUnavailable")}</p>}
      </> : <CancelEventPanel action={cancelAction} labels={cancelLabels} locale={locale} preview={cancellation} notificationPreview={notificationPreview}/>}</section>
    </> : null}
    {tab.data === "notifications" ? <section className="glass-card p-6">
      <h2 className="font-serif text-2xl font-semibold">{t("tabs.notifications")}</h2>
      {event.status === "cancelled"
        ? notificationSummary ? <p className="mt-3" role="status">{t("cancel.noticeSummary", notificationSummary)}</p> : <p className="mt-3" role="alert">{t("cancel.noticeUnavailable")}</p>
        : notificationPreview ? <p className="mt-3" role="status">{String(t.raw("cancel.noticePreview")).replace("{candidates}", String(notificationPreview.candidates)).replace("{blocked}", String(notificationPreview.knownBlocked))}</p> : <p className="mt-3" role="alert">{t("cancel.noticeUnavailable")}</p>}
    </section> : null}
    {tab.data === "orders" && event.registrationMode === "ticketed" ? <section className="glass-card p-6">
      <h2 className="font-serif text-2xl font-semibold">{tOrders("heading")}</h2>
      <form action={publicEventPath} className="mt-4 flex flex-wrap items-end gap-2" method="get"><input name="tab" type="hidden" value="orders"/><label className="block text-sm" htmlFor="order-search">{t("searchOrders")}<input className="mt-2 block min-h-11 rounded-md border px-3" defaultValue={pageQuery?.search} id="order-search" name="q" type="search"/></label><button className="min-h-11 rounded-md border px-4" type="submit">{t("searchSubmit")}</button></form>
      {orderPage === null ? <p role="alert">{tOrders("unavailable")}</p> : <><OrdersTable action={refundAction} labels={ordersLabels} locale={locale} rows={orderPage.items}/>{orderPage.nextCursor ? <a className="mt-4 inline-flex min-h-11 items-center text-primary underline" href={tabHref("orders", orderPage.nextCursor)}>{t("nextPage")}</a> : null}{pageQuery?.cursor ? <a className="ml-4 text-primary underline" href={tabHref("orders")}>{t("firstPage")}</a> : null}</>}
    </section> : null}
    {tab.data === "attendees" ? <section className="glass-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-2xl font-semibold">{t("attendees")}</h2>{process.env.ADMIN_BATCH_ENABLED === "true" && process.env.EVENT_ATTENDEE_EXPORT_ENABLED === "true" ? <EventAttendeeExportButton key={pageQuery?.search ?? ""} eventId={event.id} search={pageQuery?.search ?? ""} locale={locale} label={t("exportPreview")} errorLabel={t("exportError")}/> : <a className="text-primary underline" href={`/api/admin/events/${event.id}/attendees.csv`}>{t("exportCsv")}</a>}</div>
      <form action={publicEventPath} className="my-4 flex flex-wrap items-end gap-2" method="get"><input name="tab" type="hidden" value="attendees"/><label className="block text-sm" htmlFor="attendee-page-search">{t("attendeeSearch")}<input className="mt-2 block min-h-11 rounded-md border px-3" defaultValue={pageQuery?.search} id="attendee-page-search" name="q" type="search"/></label><button className="min-h-11 rounded-md border px-4" type="submit">{t("searchSubmit")}</button></form>
      {attendeePage === null ? <p role="alert">{t("unavailable")}</p> : <><AttendeeTable attendees={attendeePage.items} checkInAction={checkInAction} guestCheckInAction={guestCheckInAction} labels={attendeeLabels} locale={locale} resendPassMessages={resendPassMessages} resendPassPath={eventPath} seatCheckInAction={seatCheckInAction} checkInBlocked={event.status === "cancelled"} showSearch={false}/>{attendeePage.nextCursor ? <a className="mt-4 inline-flex min-h-11 items-center text-primary underline" href={tabHref("attendees", attendeePage.nextCursor)}>{t("nextPage")}</a> : null}{pageQuery?.cursor ? <a className="ml-4 text-primary underline" href={tabHref("attendees")}>{t("firstPage")}</a> : null}</>}
    </section> : null}
  </div>;
}
