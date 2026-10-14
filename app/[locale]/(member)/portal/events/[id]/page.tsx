import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";
import {PrivateLink} from "@/components/internal-shell/private-link";
import {TicketCheckoutForm} from "@/components/marketing/ticket-checkout-form";
import {portalAccessNotice} from "@/components/portal/access-notice";
import {PortalPageHeader} from "@/components/portal/page-header";
import type {AppLocale} from "@/i18n/routing";
import {profilesRepository} from "@/lib/db/repos/profiles";
import {portalPageActor} from "@/lib/portal/page-actor";
import {readPortalPage} from "@/lib/portal/access-state";
import {getPortalEvent} from "@/lib/portal/member-event";
import {formatPortalDate} from "@/lib/portal/format-date";
import {getTicketCheckoutLabels} from "@/lib/tickets/labels";
import {formatTicketPrice} from "@/lib/tickets/format";
import {localizedPath} from "@/lib/urls";

export const dynamic = "force-dynamic";
type Props = Readonly<{params: Promise<{locale: string; id: string}>}>;
export default async function PortalEventPage({params}: Props) {
  const {locale: language, id} = await params;
  const locale = language as AppLocale;
  setRequestLocale(locale);
  const actor = await portalPageActor(locale, `/portal/events/${id}`);
  const result = await readPortalPage(() => getPortalEvent(actor, id, locale));
  if (!result.ok) return portalAccessNotice(locale, result.access);
  const event = result.value;
  if (!event) notFound();
  const [t, tTicket, labels, profile] = await Promise.all([
    getTranslations({locale, namespace: "Portal"}), getTranslations({locale, namespace: "Ticket"}),
    getTicketCheckoutLabels(locale), actor.kind === "member" ? profilesRepository.getById(actor, actor.profileId) : null,
  ]);
  const canBuy = event.registrationMode === "ticketed" && event.ticketPriceHkdCents !== null && new Date(event.startsAt) > new Date();
  return <div className="space-y-6">
    <PortalPageHeader eyebrow={t("events.title")} title={event.title} lead={formatPortalDate(locale, event.startsAt)} />
    {event.venue ? <p>{event.venue}</p> : null}
    <p className="whitespace-pre-line">{event.description}</p>
    {canBuy ? <TicketCheckoutForm eventId={event.id} locale={locale} labels={labels} defaultBuyerName={profile?.displayName ?? ""} defaultBuyerEmail={profile?.email ?? ""}
      pricePerSeat={tTicket("price", {price: formatTicketPrice(event.ticketPriceHkdCents, locale)})} unitAmountHkdCents={event.ticketPriceHkdCents!}
      eventStartsAt={event.startsAt} refundPolicyHref={localizedPath(locale, "/refund-policy")} /> : <p>{t("events.registrationUnavailable")}</p>}
    <PrivateLink className="text-link" href={localizedPath(locale, "/portal/events")}>{t("events.title")}</PrivateLink>
  </div>;
}
